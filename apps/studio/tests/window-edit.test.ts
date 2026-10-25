import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptWoodshed, sceneDocument } from "../lib/scene-document.ts";
import { validateWindowEdit } from "../lib/window-edit.ts";
const authored = () =>
  sceneDocument.parse({
    ...conceptWoodshed(),
    asset: "woodshed",
    fidelity: "source-derived",
    parts: [
      {
        ...conceptWoodshed().parts[0],
        id: "native-3",
        shape: "native",
        node: "native-3",
        name: "Original shed · wall 1 -1.001",
        size: [3, 2.7, 0.2],
      },
    ],
  });
const edit = { partId: "native-3", width: 0.8, height: 0.7, sill: 1, offset: 0 };
test("window operations require an authored wall and bounded dimensions", () => {
  assert.equal(validateWindowEdit(authored(), edit).part.id, "native-3");
  assert.throws(() => validateWindowEdit(conceptWoodshed(), edit), /authored/);
  assert.throws(() => validateWindowEdit(authored(), { ...edit, width: 100 }));
  assert.throws(() => validateWindowEdit(authored(), { ...edit, sill: 1.9, height: 1.6 }), /plate/);
  assert.throws(() => validateWindowEdit(authored(), { ...edit, partId: "../../source" }));
  assert.throws(() => validateWindowEdit(authored(), { ...edit, code: "run" }));
});
test("geometry revisions survive scene serialization and undo independently of transforms", () => {
  const source = authored(),
    id = crypto.randomUUID();
  const next = sceneDocument.parse({ ...source, geometry: { id, ...edit } });
  assert.equal(JSON.parse(JSON.stringify(next)).geometry.id, id);
  assert.equal(source.geometry, undefined);
  assert.deepEqual(next.parts, source.parts);
  assert.throws(() => sceneDocument.parse({ ...next, asset: "primitives" }));
  assert.throws(() => sceneDocument.parse({ ...next, geometry: { id: "bad", ...edit } }));
});
