import { test } from "node:test";
import assert from "node:assert/strict";
import { previsFrames, encodeCanvasMp4 } from "../lib/browser-previs.ts";
import { animationPose } from "../lib/scene-document.ts";

test("capture frames have exact duration, contiguous timestamps and closed assembly endpoints", () => {
  for (const seconds of [2, 6, 8, 10, 12, 14, 15]) {
    const frames = previsFrames(seconds);
    assert.equal(frames.length, seconds * 24);
    assert.equal(frames[0].timestamp, 0);
    assert.equal(frames[0].progress, 0);
    assert.equal(frames.at(-1)!.progress, 1);
    assert.ok(Math.abs(frames.at(-1)!.timestamp + frames.at(-1)!.duration - seconds) < 1e-10);
    for (let index = 1; index < frames.length; index++)
      assert.ok(
        Math.abs(
          frames[index - 1].timestamp + frames[index - 1].duration - frames[index].timestamp,
        ) < 1e-10,
      );
    assert.equal(animationPose(frames[0].progress).explode, 0);
    assert.equal(animationPose(frames.at(-1)!.progress).explode, 0);
    assert.equal(animationPose(frames.at(-1)!.progress).orbit, 1);
  }
  for (const value of [NaN, Infinity, 0, 1, 15.1]) assert.throws(() => previsFrames(value));
});

test("unavailable WebCodecs yields explicit fallback rather than fake MP4 bytes", async () => {
  assert.equal(typeof globalThis.VideoEncoder, "undefined");
  let rendered = false;
  const result = await encodeCanvasMp4(
    {} as HTMLCanvasElement,
    6,
    () => {
      rendered = true;
    },
    () => {},
  );
  assert.equal(result, null);
  assert.equal(rendered, false);
});
