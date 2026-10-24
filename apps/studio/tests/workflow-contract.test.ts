import { test } from "node:test";
import assert from "node:assert/strict";
import {
  command,
  requireTransition,
  localHandoff,
} from "../lib/workflow-contract.ts";
const hash = "a".repeat(64),
  id = "15d8a7ea-997d-4002-8213-05820d300044";
test("generation requires current render review", () => {
  assert.throws(
    () => requireTransition("rendered", "request_generation", hash, hash),
    /stage/,
  );
  assert.throws(
    () =>
      requireTransition("reviewed", "request_generation", hash, "b".repeat(64)),
    /Source changed/,
  );
  assert.doesNotThrow(() =>
    requireTransition("reviewed", "request_generation", hash, hash),
  );
});
test("no approve or submit action exists on hosted API", () => {
  for (const action of ["approve", "submit", "execute_python", "render_remote"])
    assert.equal(command.safeParse({ action, id }).success, false);
  assert.equal(
    command.safeParse({ action: "prepare_render", id, python: "danger" })
      .success,
    false,
  );
});
test("handoff is a local approval request, not a provider command", () => {
  const handoff = localHandoff({
    id,
    sourceHash: hash,
    prompt: "Native motion",
    quality: "480P",
  });
  assert.equal(handoff.expectedSourceHash, hash);
  assert.match(handoff.instructions, /never submits/i);
  assert.ok(!("providerKey" in handoff));
});
