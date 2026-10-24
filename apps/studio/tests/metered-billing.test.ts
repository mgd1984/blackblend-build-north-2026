import { test } from "node:test";
import assert from "node:assert/strict";
import { createUsageDelivery, createSandboxAccountResolver, toMetronomeEvent, type SandboxBillingAccount, type UsageOutboxRecord } from "../lib/metered-billing.ts";

const now = Date.parse("2026-10-21T19:00:00Z");
const account: SandboxBillingAccount = {
  owner: "clerk:user_blackblend",
  environment: "sandbox",
  stripeAccountId: "acct_sandbox",
  stripeCustomerId: "cus_blackblend",
  metronomeCustomerId: "e771844e-1767-4638-8911-8c947619ea5c",
  metronomeContractId: "cd05a1a9-b099-48ae-9d78-b02c9d0736c8",
  usageConfigured: true,
};
const record = (): UsageOutboxRecord => ({
  id: "ecb66068-b1af-4ea2-a005-621fc35610b6",
  owner: account.owner,
  kind: "generation.completed",
  payload: { model: "minimax/h3-max/3d-to-video", duration_ms: 6000, resolution: "480P", reference_count: 2 },
  created_at: "2026-10-21T18:59:00Z",
  delivered_at: null,
});
const config = { enabled: true, environment: "sandbox" as const, stripeAccountId: account.stripeAccountId, token: "test-only-secret" };

test("generation events contain product units and dimensions without invented price or private inputs", () => {
  const event = toMetronomeEvent({ ...record(), payload: { ...(record().payload as object), prompt: "private", source_url: "https://private", provider_request_id: "private", provider_cost_usd: 100 } }, account, now);
  assert.equal(event.transaction_id, record().id);
  assert.equal(event.timestamp, record().created_at);
  assert.deepEqual(event.properties, { units: 1, provider: "fal", model: "minimax/h3-max/3d-to-video", duration_ms: 6000, resolution: "480P", reference_count: 2, billing_scope: account.metronomeContractId });
  assert.ok(!JSON.stringify(event).includes("private"));
});
test("video resolution dimensions preserve fal's exact labels and the 15-second limit", () => {
  for (const resolution of ["480P", "768P", "1080P"]) {
    const event = toMetronomeEvent({ ...record(), payload: { ...(record().payload as object), resolution, duration_ms: 15000 } }, account, now);
    assert.equal(event.properties.resolution, resolution);
    assert.equal(event.properties.duration_ms, 15000);
  }
  for (const resolution of ["480p", "720P", "720p", "768p", "1080p"]) {
    assert.throws(() => toMetronomeEvent({ ...record(), payload: { ...(record().payload as object), resolution } }, account, now), /dimensions/);
  }
  assert.throws(() => toMetronomeEvent({ ...record(), payload: { ...(record().payload as object), duration_ms: 15001 } }, account, now), /quantity/);
});
test("agent token usage stays separate and cached tokens cannot exceed input tokens", () => {
  const source = { ...record(), kind: "agent.completed", payload: { model: "gpt-5-mini", input_tokens: 1000, cached_input_tokens: 250, output_tokens: 100 } };
  const event = toMetronomeEvent(source, account, now);
  assert.equal(event.event_type, "blackblend.agent.completed");
  assert.equal(event.properties.uncached_input_tokens, 750);
  assert.throws(() => toMetronomeEvent({ ...source, payload: { ...source.payload, cached_input_tokens: 1001 } }, account, now));
});
test("mapping binds one trusted owner, customer, contract and Stripe sandbox", async () => {
  const resolve = createSandboxAccountResolver([account], config.stripeAccountId);
  assert.deepEqual(await resolve(account.owner), account);
  assert.equal(await resolve("clerk:user_attacker"), null);
  assert.throws(() => createSandboxAccountResolver([account, account], config.stripeAccountId), /Duplicate/);
  assert.throws(() => createSandboxAccountResolver([{ ...account, environment: "production" }], config.stripeAccountId));
  assert.throws(() => createSandboxAccountResolver([account], "acct_other"));
  assert.throws(() => toMetronomeEvent({ ...record(), owner: "clerk:user_attacker" }, account, now), /owner/);
});
test("delivery batches bare events at a fixed URL and marks only acknowledged usage", async () => {
  const marked: string[][] = [];
  const deliver = createUsageDelivery({ config, now: () => now, resolveAccount: createSandboxAccountResolver([account], config.stripeAccountId), markDelivered: async (ids) => { marked.push(ids); }, fetchImpl: async (url, init) => {
    assert.equal(url, "https://api.metronome.com/v1/ingest");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only-secret");
    assert.ok(Array.isArray(JSON.parse(init?.body as string)));
    return new Response(null, { status: 200 });
  } });
  assert.deepEqual(await deliver([record()]), { accepted: 1 });
  assert.deepEqual(marked, [[record().id]]);
  assert.deepEqual(await deliver([{ ...record(), delivered_at: "2026-10-21T19:00:00Z" }]), { accepted: 0 });
});
test("uncertain ingestion or failed outbox acknowledgement retries identical IDs and bodies", async () => {
  const bodies: string[] = [];
  let failMark = true;
  const deliver = createUsageDelivery({ config, now: () => now, resolveAccount: async () => account, markDelivered: async () => { if (failMark) { failMark = false; throw Error("database unavailable"); } }, fetchImpl: async (_url, init) => { bodies.push(init?.body as string); return new Response(null, { status: 200 }); } });
  await assert.rejects(deliver([record()]), /database/);
  await deliver([record()]);
  assert.equal(bodies[0], bodies[1]);
  let marks = 0;
  const uncertain = createUsageDelivery({ config, now: () => now, resolveAccount: async () => account, markDelivered: async () => { marks++; }, fetchImpl: async () => { throw Error("secret network details"); } });
  await assert.rejects(uncertain([record()]), /unconfirmed/);
  assert.equal(marks, 0);
});
test("disabled, unmapped, duplicate, oversized and invalid usage never reaches a vendor", async () => {
  let calls = 0;
  const base = { config, now: () => now, resolveAccount: async () => account, markDelivered: async () => {}, fetchImpl: async () => { calls++; return new Response(null, { status: 200 }); } };
  await assert.rejects(createUsageDelivery({ ...base, config: { ...config, enabled: false } })([record()]));
  await assert.rejects(createUsageDelivery({ ...base, resolveAccount: async () => null })([record()]));
  await assert.rejects(createUsageDelivery(base)([record(), record()]), /Duplicate/);
  await assert.rejects(createUsageDelivery(base)(Array.from({ length: 101 }, record)), /100/);
  await assert.rejects(createUsageDelivery(base)([{ ...record(), kind: "generation.failed" }]));
  await assert.rejects(createUsageDelivery(base)([{ ...record(), created_at: "2026-08-01T00:00:00Z" }]), /reconciliation/);
  await assert.rejects(createUsageDelivery(base)([{ ...record(), payload: { ...(record().payload as object), duration_ms: NaN } }]));
  assert.equal(calls, 0);
});
test("HTTP rejection never marks delivery or leaks a vendor error body", async () => {
  let marks = 0;
  const deliver = createUsageDelivery({ config, now: () => now, resolveAccount: async () => account, markDelivered: async () => { marks++; }, fetchImpl: async () => new Response("secret vendor internals", { status: 429 }) });
  await assert.rejects(deliver([record()]), (error: Error) => /not acknowledged/.test(error.message) && !error.message.includes("secret"));
  assert.equal(marks, 0);
});
