import { validateSandboxAccount } from "./metered-billing.ts";
import type { BillingNotificationHint } from "./billing-webhooks.ts";

export type BillingEnv = {
  DB?: D1Database;
  BILLING_MODE?: string;
  BILLING_STRIPE_ACCOUNT_ID?: string;
  METRONOME_API_TOKEN?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  METRONOME_WEBHOOK_SECRET?: string;
  METRONOME_SANDBOX_ENVIRONMENT?: string;
};
export class BillingUnavailable extends Error {}
type AccountRow = {
  owner: string;
  environment: string;
  stripe_account_id: string;
  stripe_customer_id: string;
  metronome_customer_id: string;
  metronome_contract_id: string;
  usage_configured: number;
};

export function billingEnabled(env: BillingEnv) {
  return (
    env.BILLING_MODE === "sandbox" &&
    !!env.DB &&
    /^acct_[A-Za-z0-9]{1,128}$/.test(env.BILLING_STRIPE_ACCOUNT_ID ?? "") &&
    !!env.METRONOME_API_TOKEN &&
    !!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") &&
    !!env.METRONOME_WEBHOOK_SECRET &&
    !!env.METRONOME_SANDBOX_ENVIRONMENT?.trim() &&
    env.METRONOME_SANDBOX_ENVIRONMENT.trim().toUpperCase() !== "PRODUCTION"
  );
}
function mapped(row: AccountRow | null, accountId: string) {
  if (!row) return null;
  return validateSandboxAccount(
    {
      owner: row.owner,
      environment: row.environment,
      stripeAccountId: row.stripe_account_id,
      stripeCustomerId: row.stripe_customer_id,
      metronomeCustomerId: row.metronome_customer_id,
      metronomeContractId: row.metronome_contract_id,
      usageConfigured: row.usage_configured === 1,
    },
    accountId,
  );
}
export function billingStore(db: D1Database, stripeAccountId: string) {
  async function lookup(
    column: "owner" | "stripe_customer_id" | "metronome_customer_id",
    value: string,
  ) {
    try {
      return mapped(
        await db
          .prepare(
            `SELECT * FROM billing_accounts WHERE ${column}=? AND stripe_account_id=? AND environment='sandbox'`,
          )
          .bind(value, stripeAccountId)
          .first<AccountRow>(),
        stripeAccountId,
      );
    } catch {
      throw new BillingUnavailable("Billing account storage is unavailable.");
    }
  }
  return {
    byOwner: (owner: string) => lookup("owner", owner),
    byStripeCustomer: (customer: string) => lookup("stripe_customer_id", customer),
    byMetronomeCustomer: (customer: string) => lookup("metronome_customer_id", customer),
    async enqueue(key: string, hint: BillingNotificationHint): Promise<"inserted" | "duplicate"> {
      try {
        const result = await db
          .prepare(
            `INSERT INTO billing_notifications (id,provider,event_id,owner,payload,received_at)
          VALUES (?,?,?,?,?,?) ON CONFLICT(provider,event_id) DO NOTHING`,
          )
          .bind(
            key,
            hint.provider,
            hint.eventId,
            hint.owner,
            JSON.stringify(hint),
            new Date().toISOString(),
          )
          .run();
        return result.meta.changes ? "inserted" : "duplicate";
      } catch {
        throw new BillingUnavailable("Billing notification could not be stored.");
      }
    },
  };
}

/** Create account mappings only from trusted setup code, never a public route.
 * Insert new mappings only; never silently replace an owner, customer or contract.
 */
export async function provisionSandboxBillingAccount(
  db: D1Database,
  value: unknown,
  stripeAccountId: string,
) {
  const account = validateSandboxAccount(value, stripeAccountId);
  await db
    .prepare(
      `INSERT INTO billing_accounts
    (owner,environment,stripe_account_id,stripe_customer_id,metronome_customer_id,metronome_contract_id,usage_configured,created_at)
    VALUES (?,'sandbox',?,?,?,?,1,?)`,
    )
    .bind(
      account.owner,
      account.stripeAccountId,
      account.stripeCustomerId,
      account.metronomeCustomerId,
      account.metronomeContractId,
      new Date().toISOString(),
    )
    .run();
  return account;
}

export async function ownerBillingStatus(env: BillingEnv, owner: string) {
  if (!/^clerk:[A-Za-z0-9_]{1,128}$/.test(owner))
    throw new BillingUnavailable("Invalid billing owner.");
  if (!env.DB) throw new BillingUnavailable("Billing storage is unavailable.");
  const aggregate = await env.DB.prepare(
    `SELECT
    SUM(CASE WHEN delivered_at IS NULL THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) AS accepted,
    SUM(CASE WHEN delivered_at IS NULL AND delivery_error IS NOT NULL THEN 1 ELSE 0 END) AS attention,
    MAX(delivered_at) AS last_accepted FROM usage_events WHERE owner=?`,
  )
    .bind(owner)
    .first<{
      pending: number | null;
      accepted: number | null;
      attention: number | null;
      last_accepted: string | null;
    }>();
  const notifications = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM billing_notifications WHERE owner=? AND processed_at IS NULL`,
  )
    .bind(owner)
    .first<{ count: number }>();
  const enabled = billingEnabled(env);
  const account = enabled
    ? await billingStore(env.DB, env.BILLING_STRIPE_ACCOUNT_ID!).byOwner(owner)
    : null;
  return {
    mode: env.BILLING_MODE === "sandbox" ? ("sandbox" as const) : ("disabled" as const),
    configured: enabled && !!account,
    commercialGenerationEnabled: false as const,
    usage: {
      pending: aggregate?.pending ?? 0,
      accepted: aggregate?.accepted ?? 0,
      attentionRequired: aggregate?.attention ?? 0,
    },
    notificationPending: notifications?.count ?? 0,
    lastAcceptedAt: aggregate?.last_accepted ?? null,
    reason: !enabled
      ? "Sandbox billing is disabled or its verified configuration is incomplete."
      : !account
        ? "This account has no configured sandbox billing mapping."
        : null,
  };
}
