import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./sqlite-d1.ts";
import {
  generationAvailable,
  generationCommand,
  generationService,
  type GenerationConfig,
} from "../lib/generation-service.ts";
import { digest, inspectMp4 } from "../lib/media-inspection.ts";
import { falQueue, SubmissionUnknown } from "../lib/fal-queue.ts";
const owner = "clerk:alice",
  other = "clerk:mallory";
function movie(seconds = 6) {
  const box = (name: string, data: Uint8Array) => {
    const bytes = new Uint8Array(data.length + 8);
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(new TextEncoder().encode(name), 4);
    bytes.set(data, 8);
    return bytes;
  };
  const header = new Uint8Array(100),
    view = new DataView(header.buffer);
  view.setUint32(12, 1000);
  view.setUint32(16, seconds * 1000);
  const join = (...parts: Uint8Array[]) => {
    const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  };
  const handler = new Uint8Array(24);
  handler.set(new TextEncoder().encode("vide"), 8);
  const ftyp = box("ftyp", new TextEncoder().encode("isom0000")),
    moov = box("moov", join(box("mvhd", header), box("trak", box("mdia", box("hdlr", handler)))));
  return join(ftyp, moov, box("mdat", new Uint8Array(16)));
}
function memoryBucket() {
  const files = new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>();
  const bucket = {
    async get(key: string) {
      const record = files.get(key);
      if (!record) return null;
      return {
        arrayBuffer: async () => record.bytes.slice().buffer,
        body: new Response(record.bytes).body,
        httpMetadata: { contentType: record.type },
        size: record.bytes.length,
      };
    },
    async put(
      key: string,
      data: Uint8Array | ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) {
      files.set(key, {
        bytes: new Uint8Array(data as ArrayBuffer).slice(),
        type: options?.httpMetadata?.contentType ?? "application/octet-stream",
      });
    },
    async delete(key: string) {
      files.delete(key);
    },
  } as unknown as R2Bucket;
  return { bucket, files };
}
async function fixture(fetchImpl: typeof fetch) {
  const { db, close } = sqliteD1(),
    { bucket, files } = memoryBucket(),
    bytes = movie(),
    hash = await digest(bytes);
  await bucket.put("source", bytes, { httpMetadata: { contentType: "video/mp4" } });
  const id = crypto.randomUUID();
  async function addFlow(flowId = id) {
    await db
      .prepare(
        `INSERT INTO workflows
    (id,owner,brief_id,status,revision,metadata,source_hash,source_key,prompt,quality,created_at,updated_at)
    VALUES (?,?,'brief','reviewed','revision','{}',?,'source','Realistic timber','480P','now','now')`,
      )
      .bind(flowId, owner, hash)
      .run();
    return flowId;
  }
  await addFlow();
  const config: GenerationConfig = {
    DB: db,
    BUCKET: bucket,
    FAL_KEY: "private-fal-key",
    GENERATION_MEDIA_SECRET: "s".repeat(64),
    GENERATION_ALLOWED_OWNERS: owner,
    GENERATION_DAILY_LIMIT: "3",
    APP_ORIGIN: "https://blackblend.example",
  };
  return {
    db,
    bucket,
    files,
    hash,
    id,
    config,
    addFlow,
    service: generationService(config, fetchImpl),
    close,
  };
}
test("prepare, explicit approval, one durable submit, private completion and a single usage event", async () => {
  const calls: { url: string; method: string }[] = [],
    payloads: { video_url: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, options?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, method: options?.method ?? "GET" });
    if (options?.method === "POST") {
      assert.equal(new Headers(options.headers).get("X-Fal-No-Retry"), "1");
      assert.equal(new Headers(options.headers).get("X-Fal-Store-IO"), "0");
      const payload = JSON.parse(String(options.body));
      payloads.push(payload);
      assert.equal(payload.max_generated_reference_images, 0);
      return Response.json({ request_id: "remote_one" });
    }
    if (target.endsWith("/status"))
      return Response.json({ status: "COMPLETED", metrics: { inference_time: 4.5 } });
    if (target.endsWith("/requests/remote_one"))
      return Response.json({ video: { url: "https://v3.fal.media/result.mp4" } });
    assert.equal(target, "https://v3.fal.media/result.mp4");
    return new Response(movie(), { headers: { "Content-Type": "video/mp4" } });
  }) as typeof fetch;
  const f = await fixture(fetchImpl);
  try {
    const command = {
      workflowId: f.id,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
      images: [],
    };
    const prepared = await f.service.prepare(owner, command);
    assert.equal(calls.length, 0);
    assert.equal(prepared.status, "awaiting_approval");
    assert.equal(prepared.durationMs, 6000);
    assert.equal(prepared.baseEstimateCents, 30);
    assert.equal(prepared.estimateIncludesReferenceUsage, false);
    assert.equal((await f.service.prepare(owner, command)).id, prepared.id);
    await assert.rejects(f.service.read(other, prepared.id), /not found/);
    await assert.rejects(f.service.approve(other, prepared.id, prepared.inputHash), /not enabled/);
    await assert.rejects(f.service.media(other, prepared.id, "source"), /not found/);
    await assert.rejects(f.service.approve(owner, prepared.id, "b".repeat(64)), /changed/);
    await Promise.all([
      f.service.approve(owner, prepared.id, prepared.inputHash),
      f.service.approve(owner, prepared.id, prepared.inputHash),
    ]);
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
    const sourceUrl = new URL(payloads[0].video_url);
    assert.equal((await f.service.sourceCapability(sourceUrl)).size, movie().length);
    sourceUrl.searchParams.set("kind", "result");
    await assert.rejects(f.service.sourceCapability(sourceUrl));
    const completed = await f.service.refresh(owner, prepared.id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.processingMs, 4500);
    assert.ok(completed.result?.startsWith("/api/generation-media"));
    assert.ok(!JSON.stringify(completed).includes("private-fal-key"));
    assert.ok(!JSON.stringify(completed).includes("remote_one"));
    const count = calls.length;
    await f.service.refresh(owner, prepared.id);
    assert.equal(calls.length, count);
    const events = await f.db.prepare("SELECT * FROM usage_events").all();
    assert.equal(events.results.length, 1);
    assert.equal(
      (
        await f.db
          .prepare("SELECT status FROM workflows WHERE id=?")
          .bind(f.id)
          .first<{ status: string }>()
      )?.status,
      "completed",
    );
  } finally {
    f.close();
  }
});
test("uncertain submit remains blocked and never retries; another active job cannot consume the account", async () => {
  let submits = 0;
  const f = await fixture((async () => {
    submits++;
    throw Error("connection lost");
  }) as typeof fetch);
  try {
    const prepared = await f.service.prepare(owner, {
      workflowId: f.id,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
    });
    assert.equal(
      (await f.service.approve(owner, prepared.id, prepared.inputHash)).status,
      "unknown",
    );
    await f.service.approve(owner, prepared.id, prepared.inputHash);
    assert.equal(submits, 1);
    const secondFlow = await f.addFlow(crypto.randomUUID());
    const second = await f.service.prepare(owner, {
      workflowId: secondFlow,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
    });
    await assert.rejects(f.service.approve(owner, second.id, second.inputHash), /another job/);
    assert.equal(submits, 1);
    await assert.rejects(f.service.cancel(owner, prepared.id), /cannot be cancelled/);
  } finally {
    f.close();
  }
});
for (const status of [
  { status: "FAILED" },
  { status: "FAILED", error: "private provider failure" },
  { status: "COMPLETED", error: "private provider failure" },
]) {
  test(`provider ${status.status}${status.error ? " with error" : ""} is terminal and releases the active-job guard`, async () => {
    let posts = 0,
      polls = 0;
    const fetchImpl = (async (url, options) => {
      if (options?.method === "POST") {
        posts++;
        return Response.json({ request_id: "remote_" + posts });
      }
      assert.ok(String(url).endsWith("/status"), "failed jobs must not fetch a result");
      polls++;
      return Response.json(status);
    }) as typeof fetch;
    const f = await fixture(fetchImpl);
    try {
      const first = await f.service.prepare(owner, {
        workflowId: f.id,
        requestId: crypto.randomUUID(),
        sourceHash: f.hash,
      });
      await f.service.approve(owner, first.id, first.inputHash);
      const failed = await f.service.refresh(owner, first.id);
      assert.equal(failed.status, "failed");
      assert.equal(failed.result, null);
      assert.equal(failed.error, "The provider could not complete this generation.");
      assert.equal(f.files.size, 1, "no result artifact stored");
      assert.equal((await f.db.prepare("SELECT * FROM usage_events").all()).results.length, 0);
      assert.equal(
        (
          await f.db
            .prepare("SELECT status FROM workflows WHERE id=?")
            .bind(f.id)
            .first<{ status: string }>()
        )?.status,
        "submitted",
      );
      // A fresh service instance must retain the terminal state and never poll/resubmit it.
      const resumed = generationService(f.config, fetchImpl);
      assert.equal((await resumed.refresh(owner, first.id)).status, "failed");
      assert.equal((await resumed.approve(owner, first.id, first.inputHash)).status, "failed");
      assert.equal(posts, 1);
      assert.equal(polls, 1);
      const secondFlow = await f.addFlow(crypto.randomUUID());
      const second = await resumed.prepare(owner, {
        workflowId: secondFlow,
        requestId: crypto.randomUUID(),
        sourceHash: f.hash,
      });
      assert.equal(posts, 1, "preparing a different take does not submit it");
      assert.equal((await resumed.approve(owner, second.id, second.inputHash)).status, "queued");
      assert.equal(posts, 2, "only explicit approval of the new take submits another job");
    } finally {
      f.close();
    }
  });
}
test("expired approvals, forged sources, cross-owner cancels and arbitrary URLs cannot submit", async () => {
  let calls = 0;
  const f = await fixture((async () => {
    calls++;
    throw Error("unexpected");
  }) as typeof fetch);
  try {
    await assert.rejects(
      f.service.prepare(other, {
        workflowId: f.id,
        requestId: crypto.randomUUID(),
        sourceHash: f.hash,
      }),
      /not enabled/,
    );
    await assert.rejects(
      f.service.prepare(owner, {
        workflowId: f.id,
        requestId: crypto.randomUUID(),
        sourceHash: "0".repeat(64),
      }),
      /Review/,
    );
    const prepared = await f.service.prepare(owner, {
      workflowId: f.id,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
    });
    await assert.rejects(f.service.cancel(other, prepared.id), /not found/);
    await f.db
      .prepare(`UPDATE generation_jobs SET expires_at='2000-01-01' WHERE id=?`)
      .bind(prepared.id)
      .run();
    await assert.rejects(f.service.approve(owner, prepared.id, prepared.inputHash), /expired/);
    assert.equal(calls, 0);
    assert.equal((await f.service.cancel(owner, prepared.id)).status, "cancelled");
    assert.equal(
      (
        await f.db
          .prepare("SELECT status FROM workflows WHERE id=?")
          .bind(f.id)
          .first<{ status: string }>()
      )?.status,
      "reviewed",
    );
    assert.throws(() =>
      generationCommand.parse({
        action: "prepare",
        workflowId: f.id,
        requestId: crypto.randomUUID(),
        sourceHash: f.hash,
        url: "https://evil.example",
      }),
    );
    assert.equal(generationAvailable({ ...f.config, GENERATION_ALLOWED_OWNERS: "" }, owner), false);
  } finally {
    f.close();
  }
});
test("a finalized demonstration movie has bounded timing; malformed and overlong movies are rejected", () => {
  assert.equal(inspectMp4(movie(6)).durationMs, 6000);
  assert.throws(() => inspectMp4(movie(16)), /15 seconds/);
  const malformed = movie();
  new DataView(malformed.buffer).setUint32(0, 999999);
  assert.throws(() => inspectMp4(malformed), /box/);
  const example = readFileSync(
    new URL("../public/media/woodshed-hero-source.mp4", import.meta.url),
  );
  const timing = inspectMp4(example);
  assert.ok(timing.durationMs > 0 && timing.durationMs <= 15050);
});
test("provider redirects, errors and untrusted result locations fail without automatic submit retry", async () => {
  let posts = 0;
  const provider = falQueue("private-key", (async (_url, options) => {
    posts++;
    assert.equal(options?.redirect, "error");
    return new Response("private body", { status: 500 });
  }) as typeof fetch);
  await assert.rejects(
    provider.submit({
      video_url: "https://source.example/file",
      prompt: "test",
      resolution: "480P",
      reference_image_urls: [],
      max_generated_reference_images: 0,
      enable_safety_checker: true,
    }),
    SubmissionUnknown,
  );
  assert.equal(posts, 1);
  const output = falQueue("private-key", (async () =>
    Response.json({ video: { url: "https://evil.example/private" } })) as typeof fetch);
  await assert.rejects(output.result("known_request"), /Unexpected result host/);
});
test("malformed successful receipts stay uncertain and truncated output cannot emit completed usage", async () => {
  const payload = {
    video_url: "https://source.example/file",
    prompt: "test",
    resolution: "480P",
    reference_image_urls: [],
    max_generated_reference_images: 0 as const,
    enable_safety_checker: true as const,
  };
  for (const receipt of [{}, { request_id: null }, { request_id: 123 }]) {
    const provider = falQueue("private-key", (async () => Response.json(receipt)) as typeof fetch);
    await assert.rejects(provider.submit(payload), SubmissionUnknown);
  }
  const provider = falQueue("private-key", (async (url) =>
    String(url).startsWith("https://queue.fal.run/")
      ? Response.json({ video: { url: "https://v3.fal.media/truncated.mp4" } })
      : new Response(new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]))) as typeof fetch);
  await assert.rejects(provider.result("known_receipt"), /MP4/);
});
test("a post-commit read failure preserves references already bound to frozen approval", async () => {
  const f = await fixture((async () => {
    throw Error("No provider calls expected");
  }) as typeof fetch);
  let committed = false;
  const wrapper = {
    ...f.db,
    prepare(sql: string) {
      const statement = f.db.prepare(sql);
      if (sql === "SELECT * FROM generation_jobs WHERE owner=? AND request_id=?")
        return {
          bind(...values: unknown[]) {
            const bound = statement.bind(...values);
            return {
              ...bound,
              async first() {
                if (committed) throw Error("transient read failure");
                return bound.first();
              },
            };
          },
        };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]) {
      const result = await f.db.batch(statements);
      committed = true;
      return result;
    },
  } as unknown as D1Database;
  try {
    const service = generationService({ ...f.config, DB: wrapper });
    const image =
      "data:image/png;base64," + btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10));
    await assert.rejects(
      service.prepare(owner, {
        workflowId: f.id,
        requestId: crypto.randomUUID(),
        sourceHash: f.hash,
        images: [image],
      }),
      /transient/,
    );
    const saved = await f.db
      .prepare("SELECT * FROM generation_jobs")
      .first<{ status: string; input: string }>();
    assert.equal(saved?.status, "awaiting_approval");
    const keys = JSON.parse(saved!.input).referenceKeys;
    assert.equal(keys.length, 1);
    assert.ok(f.files.has(keys[0]));
  } finally {
    f.close();
  }
});
test("a slow stale status response cannot overwrite a newer completed result", async () => {
  let resolveOld!: (response: Response) => void, started!: (value: void) => void;
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let polls = 0;
  const fetchImpl = (async (url, options) => {
    const target = String(url);
    if (options?.method === "POST") return Response.json({ request_id: "remote_one" });
    if (target.endsWith("/status")) {
      polls++;
      if (polls === 1) {
        started();
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      }
      return Response.json({ status: "COMPLETED" });
    }
    if (target.startsWith("https://queue.fal.run/"))
      return Response.json({ video: { url: "https://v3.fal.media/result.mp4" } });
    return new Response(movie());
  }) as typeof fetch;
  const f = await fixture(fetchImpl),
    originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const job = await f.service.prepare(owner, {
      workflowId: f.id,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
    });
    await f.service.approve(owner, job.id, job.inputHash);
    const slow = f.service.refresh(owner, job.id);
    await firstStarted;
    now += 121000;
    assert.equal((await f.service.refresh(owner, job.id)).status, "completed");
    resolveOld(Response.json({ status: "IN_PROGRESS" }));
    await slow;
    const final = await f.service.read(owner, job.id);
    assert.equal(final.status, "completed");
    assert.ok(final.result);
    assert.equal((await f.db.prepare("SELECT * FROM usage_events").all()).results.length, 1);
  } finally {
    Date.now = originalNow;
    f.close();
  }
});
test("daily admission limits and concurrent cancellation bound submission without a customer wallet", async () => {
  let posts = 0;
  const f = await fixture((async (url, options) => {
    if (options?.method === "POST") {
      posts++;
      return Response.json({ request_id: "remote_one" });
    }
    if (String(url).endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (String(url).startsWith("https://queue.fal.run/"))
      return Response.json({ video: { url: "https://v3.fal.media/result.mp4" } });
    return new Response(movie());
  }) as typeof fetch);
  try {
    const service = generationService({ ...f.config, GENERATION_DAILY_LIMIT: "1" }, (async (
      url,
      options,
    ) => {
      if (options?.method === "POST") {
        posts++;
        return Response.json({ request_id: "remote_one" });
      }
      if (String(url).endsWith("/status")) return Response.json({ status: "COMPLETED" });
      if (String(url).startsWith("https://queue.fal.run/"))
        return Response.json({ video: { url: "https://v3.fal.media/result.mp4" } });
      return new Response(movie());
    }) as typeof fetch);
    const first = await service.prepare(owner, {
      workflowId: f.id,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
    });
    await service.approve(owner, first.id, first.inputHash);
    await service.refresh(owner, first.id);
    const secondFlow = await f.addFlow(crypto.randomUUID()),
      second = await service.prepare(owner, {
        workflowId: secondFlow,
        requestId: crypto.randomUUID(),
        sourceHash: f.hash,
      });
    await assert.rejects(service.approve(owner, second.id, second.inputHash), /daily/);
    assert.equal(posts, 1);
    await service.cancel(owner, second.id);
    const next = await f.service.prepare(owner, {
      workflowId: secondFlow,
      requestId: crypto.randomUUID(),
      sourceHash: f.hash,
    });
    await Promise.allSettled([
      f.service.cancel(owner, next.id),
      f.service.approve(owner, next.id, next.inputHash),
    ]);
    const status = (await f.service.read(owner, next.id)).status;
    assert.ok(["cancelled", "queued"].includes(status));
    assert.ok(posts <= 2);
  } finally {
    f.close();
  }
});
