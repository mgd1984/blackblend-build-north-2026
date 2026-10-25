import { test } from "node:test";
import assert from "node:assert/strict";
import { generationHttp } from "../lib/generation-http.ts";
import { sqliteD1 } from "./sqlite-d1.ts";
const origin = "https://blackblend.example",
  owner = "clerk:alice";
const request = (body: unknown, from: string | null = origin) =>
  new Request(origin + "/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(from ? { Origin: from } : {}) },
    body: JSON.stringify(body),
  });
test("configured generation admits only the exact operator and capability reads never contact fal", async () => {
  let calls = 0;
  const config = {
    DB: {} as D1Database,
    BUCKET: {} as R2Bucket,
    FAL_KEY: "server-only-key",
    GENERATION_MEDIA_SECRET: "s".repeat(64),
    GENERATION_ALLOWED_OWNERS: owner,
    GENERATION_DAILY_LIMIT: "1",
    APP_ORIGIN: origin,
  };
  const fetchImpl = (async () => {
    calls++;
    throw Error("Provider must not run.");
  }) as typeof fetch;
  for (const [identity, available] of [
    [owner, true],
    ["clerk:alice-extra", false],
    ["clerk:mallory", false],
  ] as const) {
    const route = generationHttp(config, async () => identity, fetchImpl);
    const response = await route.GET(new Request(origin + "/api/generations"));
    assert.equal(response.status, 200);
    const data = (await response.json()) as { available: boolean; billing: string };
    assert.equal(data.available, available);
    assert.equal(data.billing, "not-enabled");
    assert.ok(!JSON.stringify(data).includes(config.FAL_KEY));
    for (const acceptProviderCharge of [undefined, false]) {
      assert.equal(
        (
          await route.POST(
            request({
              action: "approve",
              id: crypto.randomUUID(),
              inputHash: "a".repeat(64),
              acceptProviderCharge,
            }),
          )
        ).status,
        400,
      );
    }
  }
  assert.equal(calls, 0);
});
test("generation HTTP rejects missing identity and cross-origin mutations before database/provider access", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    throw Error("Provider must not run.");
  }) as typeof fetch;
  const unsigned = generationHttp({}, async () => null, fetchImpl);
  assert.equal((await unsigned.GET(new Request(origin + "/api/generations"))).status, 401);
  assert.equal((await unsigned.POST(request({ action: "approve" }))).status, 401);
  const signed = generationHttp({}, async () => owner, fetchImpl);
  for (const from of [null, "https://attacker.invalid", "null"])
    assert.equal((await signed.POST(request({ action: "approve" }, from))).status, 403);
  assert.equal(calls, 0);
});
test("generation HTTP fails closed when unconfigured, rejects malformed actions and isolates workflow lookup", async () => {
  const { db, close } = sqliteD1();
  let calls = 0;
  const route = generationHttp({ DB: db, BUCKET: {} as R2Bucket }, async () => owner, (async () => {
    calls++;
    throw Error("Provider must not run.");
  }) as typeof fetch);
  try {
    const cap = await route.GET(new Request(origin + "/api/generations"));
    assert.equal(cap.status, 200);
    const data = (await cap.json()) as { available: boolean; billing: string };
    assert.equal(data.available, false);
    assert.equal(data.billing, "not-enabled");
    const invalid = [
      { action: "approve", id: crypto.randomUUID(), inputHash: "a".repeat(64) },
      {
        action: "approve",
        id: crypto.randomUUID(),
        inputHash: "a".repeat(64),
        acceptProviderCharge: false,
      },
      {
        action: "prepare",
        workflowId: crypto.randomUUID(),
        sourceHash: "a".repeat(64),
        requestId: crypto.randomUUID(),
        FAL_KEY: "client-secret",
      },
      { action: "execute_python", code: "no" },
    ];
    for (const body of invalid) assert.equal((await route.POST(request(body))).status, 400);
    assert.equal(
      (await route.GET(new Request(origin + "/api/generations?workflowId=" + crypto.randomUUID())))
        .status,
      404,
    );
    const huge = request({ action: "prepare" });
    huge.headers.set("Content-Length", "10000000");
    assert.equal((await route.POST(huge)).status, 400);
    assert.equal(calls, 0);
  } finally {
    close();
  }
});
