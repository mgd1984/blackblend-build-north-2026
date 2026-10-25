import Stripe from "stripe";
import { validateSandboxAccount, type SandboxBillingAccount } from "./metered-billing.ts";

const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 1_000_000;
const STRIPE_TYPES = new Set([
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
]);

type StripeHint = {
  provider: "stripe";
  eventId: string;
  type: string;
  owner: string;
  customerId: string;
  invoiceId: string;
  occurredAt: string;
};
type MetronomeHint = {
  provider: "metronome";
  eventId: string;
  type: string;
  owner: string;
  customerId: string;
  occurredAt: string;
};
export type BillingNotificationHint = StripeHint | MetronomeHint;

function requireBody(raw: Uint8Array) {
  if (!raw.length || raw.byteLength > MAX_BODY) throw Error("Invalid billing notification size.");
}

/** SDK verification works in Workers using Web Crypto; there is no Stripe API request here. */
export function createStripeNotificationVerifier(signingSecret: string) {
  if (!signingSecret.startsWith("whsec_") || signingSecret.length > 1024)
    throw Error("Stripe webhook signing secret is not configured.");
  // SDK constructor requires an API-key shape, but signature verification makes no API calls.
  // No connected account credential is needed or exposed by this verifier.
  const stripe = new Stripe("sk_test_signature_verification_only");
  return async (
    raw: Uint8Array,
    signature: string | null,
    now = Date.now(),
  ): Promise<Stripe.Event> => {
    requireBody(raw);
    if (!signature || signature.length > 4096) throw Error("Invalid Stripe billing signature.");
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        raw,
        signature,
        signingSecret,
        300,
        Stripe.createSubtleCryptoProvider(),
        now,
      );
    } catch {
      throw Error("Invalid Stripe billing signature.");
    }
    // This adapter deliberately has no production mode and rejects Connect cross-account events.
    if (event.livemode !== false || event.account || event.context)
      throw Error("Billing notification is outside the configured sandbox.");
    // Stripe's verifier tolerates timestamps in the future; enforce a symmetric replay window.
    const times = signature.split(",").filter((part) => part.startsWith("t="));
    if (
      times.length !== 1 ||
      !/^t=\d+$/.test(times[0]) ||
      Math.abs(now / 1000 - Number(times[0].slice(2))) > 300
    )
      throw Error("Billing notification timestamp is outside the replay window.");
    return event;
  };
}

/** Check the signature before parsing JSON or finding the account.
 * A valid notification asks us to check the invoice/contract; it never grants credit or spending access.
 */
export async function stripeNotificationHint(input: {
  event: Stripe.Event;
  stripeAccountId: string;
  resolveByStripeCustomer(customerId: string): Promise<SandboxBillingAccount | null>;
}): Promise<StripeHint | null> {
  const event = input.event;
  if (event.livemode !== false || event.account || event.context)
    throw Error("Invalid Stripe event environment.");
  if (!STRIPE_TYPES.has(event.type)) return null;
  const invoice = event.data.object as Stripe.Invoice;
  const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (
    !/^evt_[A-Za-z0-9]+$/.test(event.id) ||
    !/^in_[A-Za-z0-9]+$/.test(invoice.id) ||
    !customer ||
    invoice.livemode !== false ||
    !Number.isSafeInteger(event.created)
  )
    throw Error("Invalid Stripe invoice notification.");
  const found = await input.resolveByStripeCustomer(customer);
  if (!found) throw Error("Stripe customer has no billing owner.");
  const account = validateSandboxAccount(found, input.stripeAccountId);
  if (account.stripeCustomerId !== customer) throw Error("Stripe customer mapping mismatch.");
  return {
    provider: "stripe",
    eventId: event.id,
    type: event.type,
    owner: account.owner,
    customerId: customer,
    invoiceId: invoice.id,
    occurredAt: new Date(event.created * 1000).toISOString(),
  };
}

export async function metronomeNotificationHint(input: {
  raw: Uint8Array;
  dateHeader: string | null;
  signature: string | null;
  signingSecret: string;
  /** Exact environment_type observed in a verified sandbox test notification. */
  sandboxEnvironmentType: string;
  stripeAccountId: string;
  resolveByMetronomeCustomer(customerId: string): Promise<SandboxBillingAccount | null>;
  now?: number;
}): Promise<MetronomeHint> {
  requireBody(input.raw);
  if (!input.sandboxEnvironmentType || input.sandboxEnvironmentType.toUpperCase() === "PRODUCTION")
    throw Error("Metronome sandbox environment is not configured.");
  if (
    !input.signingSecret ||
    input.signingSecret.length > 1024 ||
    !input.dateHeader ||
    input.dateHeader.length > 128 ||
    !input.signature ||
    !/^[a-f0-9]{64}$/i.test(input.signature)
  )
    throw Error("Invalid Metronome billing signature.");
  const sentAt = Date.parse(input.dateHeader);
  if (!Number.isFinite(sentAt) || Math.abs((input.now ?? Date.now()) - sentAt) > 300_000)
    throw Error("Billing notification timestamp is outside the replay window.");
  const prefix = encoder.encode(input.dateHeader + "\n");
  const message = new Uint8Array(prefix.byteLength + input.raw.byteLength);
  message.set(prefix);
  message.set(input.raw, prefix.byteLength);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = Uint8Array.from(input.signature.match(/../g)!, (hex) => parseInt(hex, 16));
  if (!(await crypto.subtle.verify("HMAC", key, signature, message)))
    throw Error("Invalid Metronome billing signature.");
  let event: {
    id?: unknown;
    type?: unknown;
    timestamp?: unknown;
    environment_type?: unknown;
    customer_id?: unknown;
  };
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.raw));
  } catch {
    throw Error("Invalid Metronome billing notification.");
  }
  if (
    !event ||
    typeof event !== "object" ||
    typeof event.id !== "string" ||
    !UUID.test(event.id) ||
    event.environment_type !== input.sandboxEnvironmentType ||
    typeof event.type !== "string" ||
    !/^(commit|credit|contract|invoice)\.[a-z_]+$/.test(event.type) ||
    typeof event.customer_id !== "string" ||
    !UUID.test(event.customer_id) ||
    typeof event.timestamp !== "string" ||
    !Number.isFinite(Date.parse(event.timestamp))
  )
    throw Error("Unsupported Metronome sandbox notification.");
  const found = await input.resolveByMetronomeCustomer(event.customer_id);
  if (!found) throw Error("Metronome customer has no billing owner.");
  const account = validateSandboxAccount(found, input.stripeAccountId);
  if (account.metronomeCustomerId !== event.customer_id)
    throw Error("Metronome customer mapping mismatch.");
  return {
    provider: "metronome",
    eventId: event.id,
    type: event.type,
    owner: account.owner,
    customerId: event.customer_id,
    occurredAt: event.timestamp,
  };
}

/** Save notifications with UNIQUE(provider,eventId), then acknowledge the committed write.
 * Later processing must read current vendor state rather than trust message arrival order.
 */
export async function acceptBillingNotification(
  hint: BillingNotificationHint,
  enqueue: (key: string, hint: BillingNotificationHint) => Promise<"inserted" | "duplicate">,
) {
  return enqueue(hint.provider + ":" + hint.eventId, hint);
}

/** Public webhook routes must use these signature/account checks before trusting an event. */
export function createStripeBillingHandler(dependencies: {
  signingSecret: string;
  stripeAccountId: string;
  resolveByStripeCustomer(customerId: string): Promise<SandboxBillingAccount | null>;
  enqueue(key: string, hint: BillingNotificationHint): Promise<"inserted" | "duplicate">;
}) {
  const verify = createStripeNotificationVerifier(dependencies.signingSecret);
  return async (raw: Uint8Array, signature: string | null, now?: number) => {
    const event = await verify(raw, signature, now);
    const hint = await stripeNotificationHint({ ...dependencies, event });
    return hint ? acceptBillingNotification(hint, dependencies.enqueue) : "ignored";
  };
}

export function createMetronomeBillingHandler(dependencies: {
  signingSecret: string;
  sandboxEnvironmentType: string;
  stripeAccountId: string;
  resolveByMetronomeCustomer(customerId: string): Promise<SandboxBillingAccount | null>;
  enqueue(key: string, hint: BillingNotificationHint): Promise<"inserted" | "duplicate">;
}) {
  return async (
    raw: Uint8Array,
    dateHeader: string | null,
    signature: string | null,
    now?: number,
  ) => {
    const hint = await metronomeNotificationHint({
      ...dependencies,
      raw,
      dateHeader,
      signature,
      now,
    });
    return acceptBillingNotification(hint, dependencies.enqueue);
  };
}
