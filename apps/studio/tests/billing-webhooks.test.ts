import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createStripeNotificationVerifier, createStripeBillingHandler, createMetronomeBillingHandler, type BillingNotificationHint } from "../lib/billing-webhooks.ts";
import type { SandboxBillingAccount } from "../lib/metered-billing.ts";

const now = Date.parse("2026-10-21T19:00:00Z");
const account: SandboxBillingAccount = {
  owner: "clerk:user_blackblend", environment: "sandbox", stripeAccountId: "acct_sandbox", stripeCustomerId: "cus_blackblend",
  metronomeCustomerId: "e771844e-1767-4638-8911-8c947619ea5c", metronomeContractId: "cd05a1a9-b099-48ae-9d78-b02c9d0736c8", usageConfigured: true,
};
const stripeSecret = "whsec_test_only_signing_secret";
const metronomeSecret = "test-only-notification-secret";
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const stripeEvent = () => ({ id: "evt_example", type: "invoice.paid", livemode: false, object: "event", created: now / 1000, data: { object: { id: "in_example", object: "invoice", customer: account.stripeCustomerId, livemode: false, metadata: { owner: "clerk:user_attacker" } } } });
function stripeSignature(raw: Uint8Array, time = now / 1000) {
  return "t=" + time + ",v1=" + createHmac("sha256", stripeSecret).update(String(time) + ".").update(raw).digest("hex");
}
const metronomeEvent = () => ({ id: "92a7cc8a-2439-46f8-b6bf-27f93cd5c011", type: "commit.create", environment_type: "TEST_FIXTURE", timestamp: new Date(now).toISOString(), customer_id: account.metronomeCustomerId });
function metronomeSignature(raw: Uint8Array, date: string) {
  return createHmac("sha256", metronomeSecret).update(date + "\n").update(raw).digest("hex");
}

test("Stripe SDK verifies exact bytes and rejects forged, old, future and live events", async () => {
  const verify = createStripeNotificationVerifier(stripeSecret);
  const raw = bytes(stripeEvent());
  assert.equal((await verify(raw, stripeSignature(raw), now)).id, "evt_example");
  await assert.rejects(verify(bytes({ ...stripeEvent(), type: "invoice.payment_failed" }), stripeSignature(raw), now), /signature/);
  await assert.rejects(verify(raw, stripeSignature(raw, now / 1000 - 301), now), /signature|replay/);
  await assert.rejects(verify(raw, stripeSignature(raw, now / 1000 + 301), now), /replay/);
  const live = bytes({ ...stripeEvent(), livemode: true });
  await assert.rejects(verify(live, stripeSignature(live), now), /sandbox/);
  const connected = bytes({ ...stripeEvent(), account: "acct_other" });
  await assert.rejects(verify(connected, stripeSignature(connected), now), /sandbox/);
});
test("Stripe notifications resolve customer ownership server-side, deduplicate inbox IDs and grant no credit", async () => {
  const queued = new Map<string, BillingNotificationHint>();
  const handler = createStripeBillingHandler({ signingSecret: stripeSecret, stripeAccountId: account.stripeAccountId,
    resolveByStripeCustomer: async (id) => { assert.equal(id, account.stripeCustomerId); return account; },
    enqueue: async (key, hint) => { if (queued.has(key)) return "duplicate"; queued.set(key, hint); return "inserted"; },
  });
  const raw = bytes(stripeEvent());
  assert.equal(await handler(raw, stripeSignature(raw), now), "inserted");
  assert.equal(await handler(raw, stripeSignature(raw), now), "duplicate");
  assert.equal(queued.get("stripe:evt_example")?.owner, account.owner);
  assert.ok(!JSON.stringify([...queued.values()]).includes("user_attacker"));
  assert.ok(!JSON.stringify([...queued.values()]).includes("amount"));
  const checkout = bytes({ ...stripeEvent(), type: "checkout.session.completed" });
  assert.equal(await handler(checkout, stripeSignature(checkout), now), "ignored");
});
test("unknown or mismatched Stripe customer cannot enter the billing inbox", async () => {
  const raw = bytes(stripeEvent());
  for (const mapped of [null, { ...account, stripeCustomerId: "cus_other" }]) {
    const handler = createStripeBillingHandler({ signingSecret: stripeSecret, stripeAccountId: account.stripeAccountId, resolveByStripeCustomer: async () => mapped, enqueue: async () => { assert.fail("must not enqueue"); } });
    await assert.rejects(handler(raw, stripeSignature(raw), now), /owner|mismatch/);
  }
});
test("Metronome signature checks raw bytes, environment, replay window and trusted customer mapping", async () => {
  const queued: BillingNotificationHint[] = [];
  const handler = createMetronomeBillingHandler({ signingSecret: metronomeSecret, sandboxEnvironmentType: "TEST_FIXTURE", stripeAccountId: account.stripeAccountId,
    resolveByMetronomeCustomer: async () => account,
    enqueue: async (_key, hint) => { queued.push(hint); return "inserted"; },
  });
  const date = new Date(now).toUTCString();
  const raw = bytes(metronomeEvent());
  assert.equal(await handler(raw, date, metronomeSignature(raw, date), now), "inserted");
  assert.equal(queued[0].owner, account.owner);
  await assert.rejects(handler(bytes({ ...metronomeEvent(), type: "contract.start" }), date, metronomeSignature(raw, date), now), /signature/);
  const old = new Date(now - 301_000).toUTCString();
  await assert.rejects(handler(raw, old, metronomeSignature(raw, old), now), /replay/);
  const production = bytes({ ...metronomeEvent(), environment_type: "PRODUCTION" });
  await assert.rejects(handler(production, date, metronomeSignature(production, date), now), /sandbox/);
  const unknown = bytes({ ...metronomeEvent(), customer_id: "cd05a1a9-b099-48ae-9d78-b02c9d0736c8" });
  await assert.rejects(handler(unknown, date, metronomeSignature(unknown, date), now), /mismatch/);
  assert.equal(queued.length, 1);
});
test("notification inbox failures propagate so delivery is not acknowledged prematurely", async () => {
  const handler = createStripeBillingHandler({ signingSecret: stripeSecret, stripeAccountId: account.stripeAccountId, resolveByStripeCustomer: async () => account, enqueue: async () => { throw Error("inbox unavailable"); } });
  const raw = bytes(stripeEvent());
  await assert.rejects(handler(raw, stripeSignature(raw), now), /inbox unavailable/);
});
