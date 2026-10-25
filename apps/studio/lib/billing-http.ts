import { createStripeBillingHandler, createMetronomeBillingHandler } from "./billing-webhooks.ts";
import {
  billingEnabled,
  billingStore,
  ownerBillingStatus,
  BillingUnavailable,
  type BillingEnv,
} from "./billing-store.ts";
const headers = { "Cache-Control": "private, no-store" };
class InvalidBillingRequest extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function billingStatusResponse(
  request: Request,
  env: BillingEnv,
  resolveOwner: (request: Request) => Promise<string | null>,
) {
  const owner = await resolveOwner(request);
  if (!owner) return Response.json({ error: "Sign in." }, { status: 401, headers });
  try {
    return Response.json(await ownerBillingStatus(env, owner), { headers });
  } catch {
    return Response.json(
      { error: "Billing status is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
async function readRaw(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
  )
    throw new InvalidBillingRequest("JSON notification required.", 415);
  if (Number(request.headers.get("content-length")) > 1_000_000)
    throw new InvalidBillingRequest("Notification exceeds the size limit.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidBillingRequest("Notification required.", 400);
  const blocks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000)
        throw new InvalidBillingRequest("Notification exceeds the size limit.", 413);
      blocks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const block of blocks) {
    bytes.set(block, offset);
    offset += block.byteLength;
  }
  return bytes;
}
/** Server-to-server routes use signature verification instead of browser sessions or CSRF tokens. */
export async function billingWebhookResponse(
  provider: "stripe" | "metronome",
  request: Request,
  env: BillingEnv,
  now?: number,
) {
  if (!billingEnabled(env))
    return Response.json({ error: "Sandbox billing is not configured." }, { status: 503, headers });
  try {
    const raw = await readRaw(request),
      store = billingStore(env.DB!, env.BILLING_STRIPE_ACCOUNT_ID!);
    const common = { stripeAccountId: env.BILLING_STRIPE_ACCOUNT_ID!, enqueue: store.enqueue };
    const result =
      provider === "stripe"
        ? await createStripeBillingHandler({
            ...common,
            signingSecret: env.STRIPE_WEBHOOK_SECRET!,
            resolveByStripeCustomer: store.byStripeCustomer,
          })(raw, request.headers.get("stripe-signature"), now)
        : await createMetronomeBillingHandler({
            ...common,
            signingSecret: env.METRONOME_WEBHOOK_SECRET!,
            sandboxEnvironmentType: env.METRONOME_SANDBOX_ENVIRONMENT!,
            resolveByMetronomeCustomer: store.byMetronomeCustomer,
          })(
            raw,
            request.headers.get("x-metronome-date"),
            request.headers.get("metronome-webhook-signature"),
            now,
          );
    return Response.json({ received: true, result }, { headers });
  } catch (error) {
    if (error instanceof InvalidBillingRequest)
      return Response.json({ error: error.message }, { status: error.status, headers });
    const unavailable =
      error instanceof BillingUnavailable ||
      (error instanceof Error && /no billing owner|mapping mismatch/.test(error.message));
    return Response.json(
      {
        error: unavailable
          ? "Billing notification is awaiting server configuration or storage."
          : "Invalid billing notification.",
      },
      { status: unavailable ? 503 : 400, headers },
    );
  }
}
