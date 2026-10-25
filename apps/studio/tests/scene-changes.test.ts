import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptWoodshed, sceneDocument } from "../lib/scene-document.ts";
import { sceneChanges, retainedSceneHistory } from "../lib/scene-changes.ts";

test("clarifications, declined requests and revision-only replies cannot create an Apply proposal", () => {
  const source = conceptWoodshed();
  assert.equal(sceneChanges(source, structuredClone(source)).changed, false);
  assert.equal(sceneChanges(source, { ...source, revision: source.revision + 2 }).changed, false);
  // Schematized content, not JSON field ordering or success language, is authoritative.
  const reordered = Object.fromEntries(Object.entries(source).reverse());
  assert.equal(sceneChanges(source, sceneDocument.parse(reordered)).changed, false);
});
test("actual additions, transforms, settings and native revisions are distinguished", () => {
  const source = conceptWoodshed();
  const added = sceneDocument.parse({
    ...source,
    parts: [
      ...source.parts,
      { ...source.parts[0], id: "rectangle", name: "Rectangle", size: [1, 0.2, 0.7] },
    ],
  });
  assert.deepEqual(sceneChanges(source, added).added, ["Rectangle"]);
  const edited = structuredClone(source);
  edited.parts[0].visible = false;
  assert.deepEqual(sceneChanges(source, edited).updated, ["Shed floor"]);
  assert.deepEqual(sceneChanges(source, { ...source, background: "white" }).settings, [
    "background",
  ]);
  const native = sceneDocument.parse({
    ...source,
    asset: "woodshed",
    fidelity: "source-derived",
    parts: [{ ...source.parts[0], id: "native-3", shape: "native", node: "native-3" }],
  });
  const candidate = {
    ...native,
    geometry: {
      id: crypto.randomUUID(),
      partId: "native-3",
      width: 0.8,
      height: 0.7,
      sill: 1,
      offset: 0.85,
    },
  };
  assert.equal(sceneChanges(native, candidate).geometry, true);
  assert.equal(sceneChanges(native, candidate).changed, true);
  assert.equal(sceneChanges(candidate, { ...candidate, geometry: undefined }).geometry, true);
});
test("Undo/Redo history survives serialization, remains bounded and rejects malformed entries", () => {
  const original = conceptWoodshed(),
    changed = { ...original, revision: 1, background: "white" as const };
  const restored = retainedSceneHistory(JSON.parse(JSON.stringify([original, changed])));
  assert.deepEqual(restored, [original, changed]);
  assert.equal(retainedSceneHistory(undefined).length, 0);
  assert.deepEqual(retainedSceneHistory([{ script: "not a scene" }, original]), [original]);
  const recent = retainedSceneHistory(
    Array.from({ length: 50 }, (_, revision) => ({ ...original, revision })),
  );
  assert.equal(recent.length, 30);
  assert.equal(recent[0].revision, 20);
  assert.equal(recent.at(-1)?.revision, 49);
  const large = { ...original, assumptions: Array.from({ length: 30 }, () => "界".repeat(400)) };
  const bounded = retainedSceneHistory(
    Array.from({ length: 30 }, (_, revision) => ({ ...large, revision })),
  );
  assert.ok(
    new TextEncoder().encode(bounded.map((x) => JSON.stringify(x)).join("")).length <= 500_000,
  );
  assert.equal(bounded.at(-1)?.revision, 29);
});
