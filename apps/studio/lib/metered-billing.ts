/** Server-only billing seam. Never pass browser input directly to this adapter. */
export type UsageOutboxRecord = {
  id: string;
  owner: string;
  kind: string;
  payload: unknown;
  created_at: string;
  delivered_at: string | null;
};

export type SandboxBillingAccount = {
  owner: string;
  environment: "sandbox";
  stripeAccountId: string;
  stripeCustomerId: string;
  metronomeCustomerId: string;
  metronomeContractId: string;
  /** Operator confirmed matching billable metrics, rate card and contract. */
  usageConfigured: true;
};

export type MeteredBillingConfig = {
  enabled: boolean;
  environment: "sandbox";
  stripeAccountId: string;
  /** Sandbox token held in Worker secrets, never supplied by a browser. */
  token: string;
};

type IngestEvent = {
  transaction_id: string;
  customer_id: string;
  event_type: "blackblend.generation.completed" | "blackblend.agent.completed";
  timestamp: string;
  properties: Record<string, string | number>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownerPattern = /^clerk:[A-Za-z0-9_]{1,128}$/;
const stripeAccountPattern = /^acct_[A-Za-z0-9]{1,128}$/;
const stripeCustomerPattern = /^cus_[A-Za-z0-9]{1,128}$/;
const MAX_BACKFILL_MS = 34 * 24 * 60 * 60 * 1000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid usage payload.");
  return value as Record<string, unknown>;
}
function integer(value: unknown, maximum: number, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw Error("Invalid usage quantity.");
  return value;
}
function identifier(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw Error("Invalid billing identity.");
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw Error("Invalid usage timestamp.");
  return Date.parse(value);
}

export function validateSandboxAccount(value: unknown, expectedStripeAccount: string): SandboxBillingAccount {
  const account = object(value);
  if (account.environment !== "sandbox" || account.usageConfigured !== true || account.stripeAccountId !== expectedStripeAccount)
    throw Error("Sandbox billing account is not configured.");
  return {
    owner: identifier(account.owner, ownerPattern),
    environment: "sandbox",
    stripeAccountId: identifier(account.stripeAccountId, stripeAccountPattern),
    stripeCustomerId: identifier(account.stripeCustomerId, stripeCustomerPattern),
    metronomeCustomerId: identifier(account.metronomeCustomerId, uuid),
    metronomeContractId: identifier(account.metronomeContractId, uuid),
    usageConfigured: true,
  };
}

/** Load only from trusted server configuration or an owner-indexed database table. */
export function createSandboxAccountResolver(accounts: unknown, stripeAccountId: string) {
  identifier(stripeAccountId, stripeAccountPattern);
  if (!Array.isArray(accounts) || accounts.length > 1000) throw Error("Invalid billing account configuration.");
  const mapping = new Map<string, SandboxBillingAccount>();
  const customers = new Set<string>();
  for (const value of accounts) {
    const account = validateSandboxAccount(value, stripeAccountId);
    if (mapping.has(account.owner) || customers.has(account.metronomeCustomerId) || customers.has(account.stripeCustomerId))
      throw Error("Duplicate billing account mapping.");
    mapping.set(account.owner, account);
    customers.add(account.metronomeCustomerId);
    customers.add(account.stripeCustomerId);
  }
  return async (owner: string): Promise<SandboxBillingAccount | null> => {
    const account = mapping.get(owner);
    return account ? { ...account } : null;
  };
}

export function toMetronomeEvent(record: UsageOutboxRecord, account: SandboxBillingAccount, now = Date.now()): IngestEvent {
  identifier(record.id, uuid);
  identifier(record.owner, ownerPattern);
  if (record.owner !== account.owner) throw Error("Usage owner does not match billing account.");
  const occurred = timestamp(record.created_at);
  if (occurred > now + 60_000 || now - occurred >= MAX_BACKFILL_MS)
    throw Error("Usage needs manual billing reconciliation.");
  const payload = object(record.payload);
  // No prompts, media URLs, provider request IDs, Clerk IDs or guessed dollar costs.
  let properties: Record<string, string | number>;
  let event_type: IngestEvent["event_type"];
  if (record.kind === "generation.completed") {
    if (payload.model !== "minimax/h3-max/3d-to-video" || !["480P", "768P", "1080P"].includes(String(payload.resolution)))
      throw Error("Unsupported generation usage dimensions.");
    properties = {
      units: 1,
      provider: "fal",
      model: payload.model,
      duration_ms: integer(payload.duration_ms, 15_000, 1),
      resolution: String(payload.resolution),
      reference_count: integer(payload.reference_count, 6),
    };
    if (payload.processing_ms !== undefined) properties.processing_ms = integer(payload.processing_ms, 24 * 60 * 60 * 1000);
    event_type = "blackblend.generation.completed";
  } else if (record.kind === "agent.completed") {
    if (typeof payload.model !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(payload.model))
      throw Error("Invalid agent model.");
    const input = integer(payload.input_tokens, 10_000_000);
    const cached = integer(payload.cached_input_tokens, input);
    properties = {
      units: 1,
      provider: "openai",
      model: payload.model,
      input_tokens: input,
      cached_input_tokens: cached,
      uncached_input_tokens: input - cached,
      output_tokens: integer(payload.output_tokens, 10_000_000),
    };
    event_type = "blackblend.agent.completed";
  } else {
    throw Error("Unsupported usage event.");
  }
  return {
    transaction_id: record.id,
    customer_id: account.metronomeCustomerId,
    event_type,
    timestamp: record.created_at,
    properties: { ...properties, billing_scope: account.metronomeContractId },
  };
}

/** Called by a trusted scheduled/queue worker reading the durable usage outbox.
 * Retrying this ingestion is safe with unchanged IDs; retrying provider submission is separate.
 */
export function createUsageDelivery(dependencies: {
  config: MeteredBillingConfig;
  resolveAccount(owner: string): Promise<SandboxBillingAccount | null>;
  markDelivered(ids: string[], acceptedAt: string): Promise<void>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  return async (records: UsageOutboxRecord[]) => {
    const config = dependencies.config;
    if (!config.enabled || config.environment !== "sandbox" || !config.token || !stripeAccountPattern.test(config.stripeAccountId))
      throw Error("Sandbox metered billing is not configured.");
    if (!Array.isArray(records) || records.length > 100) throw Error("Usage batch must contain at most 100 records.");
    const pending = records.filter((record) => !record.delivered_at);
    if (!pending.length) return { accepted: 0 };
    const seen = new Set<string>();
    const events: IngestEvent[] = [];
    for (const record of pending) {
      if (seen.has(record.id)) throw Error("Duplicate outbox ID in usage batch.");
      seen.add(record.id);
      const resolved = await dependencies.resolveAccount(record.owner);
      if (!resolved) throw Error("Usage owner has no configured billing account.");
      const account = validateSandboxAccount(resolved, config.stripeAccountId);
      events.push(toMetronomeEvent(record, account, now()));
    }
    let response: Response;
    try {
      response = await fetchImpl("https://api.metronome.com/v1/ingest", {
        method: "POST",
        headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
        body: JSON.stringify(events),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw Error("Usage delivery is unconfirmed. Retain the outbox and retry its unchanged IDs.");
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw Error("Usage was not acknowledged. Retain the outbox for reconciliation.");
    }
    await response.body?.cancel();
    // If this write fails, leave the records pending and resend the same transaction IDs.
    await dependencies.markDelivered(pending.map((record) => record.id), new Date(now()).toISOString());
    return { accepted: events.length };
  };
}
