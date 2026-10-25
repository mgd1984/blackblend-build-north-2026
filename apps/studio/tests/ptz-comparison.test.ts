import { test } from "node:test";
import assert from "node:assert/strict";
import { ptzSample } from "../lib/ptz-comparison.ts";

const sourceDuration = 17.666667,
  resultDuration = 17.866667;
test("PTZ timing preserves the recovered motion landmarks in both directions", () => {
  assert.equal(ptzSample(0, sourceDuration, resultDuration).time, 0);
  assert.equal(ptzSample(0, sourceDuration, resultDuration).scale, 1.32);
  assert.ok(Math.abs(ptzSample(1, sourceDuration, resultDuration).time - 1.35) < 1e-8);
  assert.ok(
    Math.abs(
      ptzSample(sourceDuration - 1, sourceDuration, resultDuration).time - (resultDuration - 1.35),
    ) < 1e-8,
  );
});
test("PTZ timing is monotonic across reversal and remains inside media bounds", () => {
  let previous = -1;
  for (let time = 0; time <= sourceDuration; time += 0.01) {
    const sample = ptzSample(time, sourceDuration, resultDuration);
    assert.ok(sample.time >= previous - 1e-6);
    assert.ok(sample.time >= 0 && sample.time <= resultDuration - 0.04);
    assert.ok(sample.rate > 0);
    assert.ok(sample.scale >= 1 && sample.scale <= 1.32);
    previous = sample.time;
  }
});
