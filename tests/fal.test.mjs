import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createApp } from "../server.mjs";
import { createFalProvider, validateFalInput, probeAnimation } from "../fal-video.mjs";
import { source } from "./fixtures.mjs";

test("fal input validation and real video duration preflight", async () => {
  const bytes = await fs.readFile(source);
  const input = validateFalInput({
    requestId: randomUUID(),
    animation: "data:video/mp4;base64," + bytes.toString("base64"),
    resolution: "768P",
  });
  assert.deepEqual(input.bytes, bytes);
  assert.equal(await probeAnimation(source.pathname), 14);
  assert.throws(() =>
    validateFalInput({ requestId: randomUUID(), animation: "https://example.com/video.mp4" }),
  );
  assert.throws(() =>
    validateFalInput({
      requestId: randomUUID(),
      animation: "data:video/mp4;base64,AAAA",
      resolution: "4K",
    }),
  );
});

test("fal uploads source, submits exactly once and never retries an ambiguous POST", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-fal-"));
  try {
    let uploads = 0,
      posts = 0;
    const provider = createFalProvider("private-fal-key", {
      client: {
        storage: {
          upload: async (file) => {
            uploads++;
            assert.equal(file.type, "video/mp4");
            return "https://v3.fal.media/source.mp4";
          },
        },
      },
      fetchImpl: async (url, opts) => {
        posts++;
        assert.equal(url, "https://queue.fal.run/minimax/h3-max/3d-to-video");
        assert.equal(opts.headers.Authorization, "Key private-fal-key");
        const input = JSON.parse(opts.body);
        assert.equal(input.resolution, "768P");
        assert.equal(input.enable_safety_checker, true);
        assert.ok(!opts.body.includes("private-fal-key"));
        throw new Error("lost response");
      },
    });
    const job = { directory: dir };
    await assert.rejects(
      provider.submit(
        {
          bytes: await fs.readFile(source),
          mime: "video/mp4",
          resolution: "768P",
          maxImages: 2,
          prompt: "steel",
        },
        job,
        async () => {},
      ),
      /lost response/,
    );
    assert.equal(uploads, 1);
    assert.equal(posts, 1);
    assert.equal(job.submissionAttempted, true);
    assert.ok(
      !(await fs.readFile(path.join(dir, "fal-request.json"), "utf8")).includes("private-fal-key"),
    );
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test("fal job lifecycle shares local playback/history and duplicate request protection", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-fal-ui-"));
  let submitted = 0;
  const app = await createApp({
    runsDir: dir,
    getFalKey: async () => "fal-test-key",
    falFactory: (key) => {
      assert.equal(key, "fal-test-key");
      return {
        submit: async (input, job, save) => {
          submitted++;
          job.submissionAttempted = true;
          job.duration = 14;
          await save(job);
          return "fal-job-id";
        },
        status: async () => ({ status: "COMPLETED", metrics: { inference_time: 12 } }),
        result: async () => ({ video: { url: "https://v3.fal.media/generated.mp4" } }),
        download: async (url, file) =>
          fs.writeFile(file, Buffer.concat([Buffer.from("\0\0\0\x18ftypisom"), Buffer.alloc(100)])),
      };
    },
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${app.address().port}`;
    const { token } = await (await fetch(base + "/api/config")).json();
    const body = {
      requestId: randomUUID(),
      animation: "data:video/mp4;base64,AAAA",
      resolution: "768P",
    };
    const send = () =>
      fetch(base + "/api/fal/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Token": token },
        body: JSON.stringify(body),
      });
    const job = await (await send()).json();
    assert.equal((await (await send()).json()).id, job.id);
    let result;
    for (let i = 0; i < 100; i++) {
      [result] = await (await fetch(base + "/api/jobs")).json();
      if (result.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(result.status, "completed");
    assert.equal(result.provider, "fal");
    assert.equal(result.processingSeconds, 12);
    assert.equal(result.duration, 14);
    assert.equal(submitted, 1);
    assert.ok(result.video);
    const response = await fetch(base + result.video);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await fs.rm(dir, { recursive: true });
  }
});

test("paused fal jobs resume without re-upload or another billable submission", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-fal-resume-"));
  let submits = 0,
    available = false;
  const options = {
    runsDir: dir,
    getFalKey: async () => "test",
    falFactory: () => ({
      submit: async (input, job, save) => {
        submits++;
        job.submissionAttempted = true;
        await save(job);
        return "saved-fal-id";
      },
      status: async () => {
        if (!available) throw new Error("offline");
        return { status: "COMPLETED" };
      },
      result: async () => ({ video: { url: "https://v3.fal.media/video.mp4" } }),
      download: async (url, file) =>
        fs.writeFile(file, Buffer.concat([Buffer.from("\0\0\0\x18ftypisom"), Buffer.alloc(100)])),
    }),
  };
  let app = await createApp(options);
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  let base = `http://127.0.0.1:${app.address().port}`;
  async function post(route, body) {
    const { token } = await (await fetch(base + "/api/config")).json();
    return (
      await fetch(base + route, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Local-Token": token },
        body: JSON.stringify(body),
      })
    ).json();
  }
  async function waitFor(status) {
    for (let i = 0; i < 100; i++) {
      const jobs = await (await fetch(base + "/api/jobs")).json();
      if (jobs[0]?.status === status) return jobs[0];
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Job did not reach " + status);
  }
  try {
    await post("/api/fal/jobs", {
      requestId: randomUUID(),
      animation: "data:video/mp4;base64,AAAA",
    });
    const paused = await waitFor("paused");
    assert.equal(paused.remoteId, "saved-fal-id");
    await new Promise((resolve) => app.close(resolve));
    app = await createApp(options);
    await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${app.address().port}`;
    available = true;
    await post(`/api/jobs/${paused.id}/resume`, {});
    await waitFor("completed");
    assert.equal(submits, 1);
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await fs.rm(dir, { recursive: true });
  }
});

test("multiple appearance references validated and uploaded in order", async () => {
  const image = "data:image/png;base64,aGVsbG8=";
  const base = { requestId: randomUUID(), animation: "data:video/mp4;base64,AAAA" };
  assert.equal(validateFalInput({ ...base, images: [image, image] }).images.length, 2);
  assert.equal(validateFalInput({ ...base, image }).images.length, 1);
  assert.throws(() => validateFalInput({ ...base, images: Array(7).fill(image) }));
  assert.throws(() => validateFalInput({ ...base, images: ["https://untrusted"] }));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blackblend-refs-"));
  let uploads = 0;
  try {
    const provider = createFalProvider("test", {
      client: { storage: { upload: async () => `https://v3.fal.media/${++uploads}` } },
      fetchImpl: async (url, opts) => {
        const payload = JSON.parse(opts.body);
        assert.deepEqual(payload.reference_image_urls, [
          "https://v3.fal.media/2",
          "https://v3.fal.media/3",
        ]);
        return Response.json({ request_id: "test-id" });
      },
    });
    await provider.submit(
      {
        bytes: await fs.readFile(source),
        mime: "video/mp4",
        resolution: "768P",
        maxImages: 2,
        images: [image, image],
      },
      { directory: dir },
      async () => {},
    );
    assert.equal(uploads, 3);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});
