import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { request, submit, download, main, validateId, BASE } from "../tt-video.mjs";

test("cross-origin redirect strips key permanently", async () => {
  const calls = [];
  await request(BASE + "/abc/download", "private", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://assets.example/video.mp4" },
          })
        : new Response("ok");
    },
  });
  assert.equal(calls[0].options.headers.Authorization, "Bearer private");
  assert.equal(calls[1].options.headers.Authorization, undefined);
});
test("rejects insecure redirects and submission redirects", async () => {
  const fetchImpl = async () =>
    new Response(null, { status: 302, headers: { location: "http://example.com/" } });
  await assert.rejects(request(BASE, "key", { fetchImpl }), /Unsafe URL/);
  await assert.rejects(
    request(BASE, "key", { payload: {}, fetchImpl }),
    /Submission redirect refused/,
  );
});
test("submission is never retried; ambiguous result is persisted without key", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-test-"));
  try {
    let count = 0;
    await assert.rejects(
      submit({ model: "test", prompt: "dog" }, "secret-test-key", dir, async () => {
        count++;
        throw new Error("timeout");
      }),
      /timeout/,
    );
    assert.equal(count, 1);
    const [run] = await fs.readdir(dir);
    const record = await fs.readFile(path.join(dir, run, "submission.json"), "utf8");
    assert.equal(JSON.parse(record).state, "unknown");
    assert.ok(!record.includes("secret-test-key"));
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
test("streamed download checks format and refuses overwrite", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-test-"));
  try {
    const target = path.join(dir, "video.mp4");
    const content = Buffer.concat([Buffer.from("\0\0\0\x18ftypisom"), Buffer.alloc(100)]);
    await download("abc", "key", target, async () => new Response(content));
    assert.deepEqual(await fs.readFile(target), content);
    await assert.rejects(
      download("abc", "key", target, async () => {
        throw new Error("must not fetch");
      }),
      /EEXIST/,
    );
    const bad = path.join(dir, "bad.mp4");
    await assert.rejects(
      download("abc", "key", bad, async () => new Response("not video")),
      /truncated/,
    );
    await assert.rejects(fs.access(bad));
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
test("dry-run requires neither Keychain nor network; submission requires opt-in", async () => {
  await main(["submit", "--model", "test", "--prompt", "dog", "--dry-run"]);
  await assert.rejects(main(["submit", "--model", "test", "--prompt", "dog"]), /confirm-submit/);
  assert.throws(() => validateId("../bad"), /valid job ID/);
});
