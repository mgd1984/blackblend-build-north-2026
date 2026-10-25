import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneExampleFile } from "../lib/scene-examples.ts";
import { sceneDocument, conceptWoodshed } from "../lib/scene-document.ts";
import { validateAgentReply } from "../lib/scene-agent.ts";
import { validateWindowEdit } from "../lib/window-edit.ts";

test("private example lookup accepts fixed names, never paths or URLs", () => {
  assert.equal(sceneExampleFile(null, "model"), "woodshed.glb");
  assert.equal(sceneExampleFile("massey-harris-21", "document"), "massey-harris-21.json");
  assert.equal(sceneExampleFile("ptz", "document"), "ptz.json");
  assert.equal(sceneExampleFile("ptz", "model"), "ptz.glb");
  for (const asset of ["../../secrets", "massey-harris-21.blend", "https://example.com", ""])
    assert.equal(sceneExampleFile(asset, "model"), null);
  assert.equal(sceneExampleFile("massey-harris-21", "blend"), null);
});
test("PTZ native example stays within source asset and geometry execution boundaries", () => {
  const source = sceneDocument.parse({
    ...conceptWoodshed(),
    asset: "ptz",
    fidelity: "source-derived",
    parts: [
      {
        ...conceptWoodshed().parts[0],
        id: "native-0",
        node: "native-0",
        shape: "native",
        name: "Payload plate",
      },
    ],
  });
  assert.equal(
    validateAgentReply({ message: "Inspect the rig.", scene: source }, source).scene.asset,
    "ptz",
  );
  assert.throws(
    () =>
      validateAgentReply(
        {
          message: "Invented node",
          scene: { ...source, parts: [{ ...source.parts[0], node: "fake" }] },
        },
        source,
      ),
    /unavailable/,
  );
  assert.throws(
    () =>
      validateWindowEdit(source, {
        partId: "native-0",
        width: 0.8,
        height: 0.7,
        sill: 1,
        offset: 0.85,
      }),
    /authored shed wall/,
  );
});
test("Massey assemblies retain native provenance without gaining the shed window executor", () => {
  const source = sceneDocument.parse({
    ...conceptWoodshed(),
    asset: "massey-harris-21",
    fidelity: "source-derived",
    parts: [
      {
        ...conceptWoodshed().parts[0],
        id: "native-3",
        node: "native-3",
        shape: "native",
        name: "Grain handling",
      },
    ],
  });
  assert.equal(
    validateAgentReply({ message: "Inspect the assembly.", scene: source }, source).scene.asset,
    "massey-harris-21",
  );
  assert.throws(
    () =>
      validateAgentReply(
        {
          message: "Invented",
          scene: { ...source, parts: [{ ...source.parts[0], node: "fake" }] },
        },
        source,
      ),
    /unavailable/,
  );
  assert.throws(
    () =>
      validateAgentReply(
        { message: "Different asset", scene: { ...source, asset: "woodshed" } },
        source,
      ),
    /unavailable/,
  );
  const edit = { partId: "native-3", width: 0.8, height: 0.7, sill: 1, offset: 0.85 };
  assert.throws(() => validateWindowEdit(source, edit), /authored shed wall/);
  assert.throws(
    () => sceneDocument.parse({ ...source, geometry: { id: crypto.randomUUID(), ...edit } }),
    /authored wall/,
  );
});
