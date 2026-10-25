import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeOutput } from "../lib/native-packet.ts";
import { digest } from "../lib/media-inspection.ts";
export async function nativeFixture(partId = "native-3") {
  const model = new Uint8Array(20);
  model.set(new TextEncoder().encode("glTF"));
  new DataView(model.buffer).setUint32(4, 2, true);
  new DataView(model.buffer).setUint32(8, 20, true);
  const blend = new Uint8Array(1000);
  blend.set(new TextEncoder().encode("BLENDER-v510"));
  const header = new TextEncoder().encode(
    JSON.stringify({
      report: {
        blenderVersion: "5.1.0",
        openingClear: true,
        existingWindowsPreserved: true,
        removedVolume: 0.03,
        affectedMeshes: 16,
        rayChecks: 9,
        trimSurfaceChecks: 4,
        wallPlaneNormal: [0, 1, 0],
        partId,
      },
      modelSize: model.length,
      blendSize: blend.length,
      modelHash: await digest(model),
      blendHash: await digest(blend),
    }),
  );
  const result = new Uint8Array(4 + header.length + model.length + blend.length);
  new DataView(result.buffer).setUint32(0, header.length);
  result.set(header, 4);
  result.set(model, 4 + header.length);
  result.set(blend, 4 + header.length + model.length);
  return result.buffer;
}
test("native artifacts must match their hashes, signatures, wall and verification contract", async () => {
  const bytes = await nativeFixture();
  assert.equal((await nativeOutput(bytes, "native-3")).report.trimSurfaceChecks, 4);
  await assert.rejects(nativeOutput(bytes, "native-2"), /requested wall/);
  const changed = bytes.slice(0);
  new Uint8Array(changed)[changed.byteLength - 1] = 1;
  await assert.rejects(nativeOutput(changed, "native-3"), /hash mismatch/);
  await assert.rejects(nativeOutput(bytes.slice(0, -1), "native-3"), /requested wall/);
});
