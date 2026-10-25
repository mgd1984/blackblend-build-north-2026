import { test } from "node:test";
import assert from "node:assert/strict";
import { briefInput, planFor } from "../lib/briefs.ts";
const valid = {
  requestId: "e66cdffc-d468-442d-96e0-866b30b0ba33",
  title: "PTZ explanation",
  track: "studio",
  audience: "Design client",
  goal: "Explain the belt drive assembly.",
  source: "blender",
  fidelity: "native",
};
test("brief validation bounds and rejects hidden operation fields", () => {
  assert.equal(briefInput.parse(valid).title, valid.title);
  for (const mutation of [
    { goal: "x" },
    { title: "x".repeat(121) },
    { track: "admin" },
    { fidelity: "guaranteed" },
    { source: "https://secret" },
    { requestId: "bad" },
    { providerKey: "secret" },
    { owner: "someone-else" },
  ])
    assert.equal(briefInput.safeParse({ ...valid, ...mutation }).success, false);
});
test("native preflight never asks a provider to generate and retains acceptance gates", () => {
  const plan = planFor(briefInput.parse(valid));
  assert.ok(plan.steps.some((s) => s.includes("native rendering")));
  assert.ok(plan.gates.some((s) => s.includes("No paid generation")));
  assert.ok(plan.requiredBeforeGeneration.includes("explicit spending cap"));
});
test("appearance path requires human approval and missing source is preflighted", () => {
  const plan = planFor(
    briefInput.parse({
      ...valid,
      source: "none",
      fidelity: "appearance",
      track: "directed",
    }),
  );
  assert.ok(plan.steps[0].includes("Prepare"));
  assert.ok(plan.steps.some((s) => s.includes("person approves")));
  assert.equal(plan.track, "directed");
});
