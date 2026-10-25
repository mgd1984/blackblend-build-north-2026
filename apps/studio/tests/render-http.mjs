import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const base = process.env.BLACKBLEND_TEST_ORIGIN ?? "http://127.0.0.1:4330";
if (new URL(base).hostname !== "127.0.0.1") throw Error("Local fixtures only.");
const session = process.env.BLACKBLEND_TEST_SESSION;
if (!session)
  throw Error(
    "Provide a short-lived local Clerk test session; platform/mock cookies are not accepted.",
  );
const headers = { Authorization: `Bearer ${session}`, Origin: base };
async function post(data) {
  return fetch(base + "/api/workflows", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
const b = await (await fetch(base + "/api/briefs", { headers })).json();
const briefId = b.briefs[0].id;
let response = await post({
  action: "create",
  briefId,
  prompt: "Synthetic HTTP workflow QA. No generation.",
  quality: "480P",
});
let flow = (await response.json()).workflow;
assert.ok(flow, await response.text().catch(() => ""));
assert.equal(
  (
    await post({
      action: "request_generation",
      id: flow.id,
      sourceHash: "a".repeat(64),
    })
  ).status,
  400,
);
await post({ action: "prepare_render", id: flow.id });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "bb-render-http-"));
try {
  const movie = path.join(temp, "synthetic.mp4");
  await promisify(execFile)(process.env.FFMPEG_PATH ?? "ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24",
    "-t",
    "14",
    "-c:v",
    "libx264",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    movie,
  ]);
  const bytes = await fs.readFile(movie);
  async function upload(kind) {
    const data = new FormData();
    data.set("id", flow.id);
    data.set("kind", kind);
    data.set("file", new File([bytes], kind + ".mp4", { type: "video/mp4" }));
    return fetch(base + "/api/workflows", {
      method: "POST",
      headers,
      body: data,
    });
  }
  response = await upload("source");
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  flow = data.workflow;
  assert.equal(flow.sourceHash, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(
    (
      await post({
        action: "review_render",
        id: flow.id,
        sourceHash: "b".repeat(64),
      })
    ).status,
    400,
  );
  assert.equal((await upload("result")).status, 400);
  assert.equal(
    (
      await post({
        action: "review_render",
        id: flow.id,
        sourceHash: flow.sourceHash,
      })
    ).status,
    200,
  );
  const request = await (
    await post({
      action: "request_generation",
      id: flow.id,
      sourceHash: flow.sourceHash,
    })
  ).json();
  assert.equal(request.workflow.status, "awaiting_local_approval");
  assert.equal(request.handoff.expectedSourceHash, flow.sourceHash);
  assert.equal((await post({ action: "submit", id: flow.id })).status, 400);
  assert.equal(
    (
      await post({
        action: "record_submission",
        id: flow.id,
        sourceHash: flow.sourceHash,
        proposalId: "3b864eaa-6547-4a4e-bdb7-758849946da3",
        jobId: "run-mocked",
      })
    ).status,
    200,
  );
  assert.equal((await upload("result")).status, 200);
  const media = await fetch(base + flow.source, {
    headers: { ...headers, Range: "bytes=0-99" },
  });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(base + "/api/workflows")).status, 401);
  console.log(
    "Passed: ownership, durable workflows, private media/range, source hashing, stale-review rejection, generation stage gates, no hosted submit action. No provider calls.",
  );
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
