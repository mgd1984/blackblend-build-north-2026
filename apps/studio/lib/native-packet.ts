import { z } from "zod";
import { digest } from "./media-inspection.ts";
import type { SceneDocument } from "./scene-document.ts";
import type { WindowEdit } from "./window-edit.ts";

export const nativeReport = z
  .object({
    blenderVersion: z.literal("5.1.0"),
    openingClear: z.literal(true),
    existingWindowsPreserved: z.literal(true),
    removedVolume: z.number().finite().positive(),
    affectedMeshes: z.number().int().positive(),
    rayChecks: z.literal(9),
    trimSurfaceChecks: z.literal(4),
    wallPlaneNormal: z.array(z.number().finite()).length(3),
    partId: z.string(),
  })
  .strict();
const headerSchema = z
  .object({
    report: nativeReport,
    modelSize: z.number().int().min(20),
    blendSize: z.number().int().min(1000),
    modelHash: z.string().regex(/^[a-f0-9]{64}$/),
    blendHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export function nativeInput(scene: SceneDocument, edit: WindowEdit, blend: ArrayBuffer) {
  const json = new TextEncoder().encode(JSON.stringify({ scene, edit }));
  const magic = new Uint8Array(blend, 0, Math.min(7, blend.byteLength)),
    native =
      new TextDecoder().decode(magic) === "BLENDER" ||
      Array.from(magic.slice(0, 4)).join(",") === "40,181,47,253";
  if (json.length > 250000 || blend.byteLength > 25000000 || !native)
    throw Error("Invalid native source.");
  const body = new Uint8Array(4 + json.length + blend.byteLength);
  new DataView(body.buffer).setUint32(0, json.length);
  body.set(json, 4);
  body.set(new Uint8Array(blend), 4 + json.length);
  return body;
}
export async function nativeOutput(bytes: ArrayBuffer, partId: string) {
  if (bytes.byteLength < 5 || bytes.byteLength > 50_010_000)
    throw Error("Invalid native output size.");
  const size = new DataView(bytes).getUint32(0);
  if (size < 1 || size > 10000 || 4 + size >= bytes.byteLength)
    throw Error("Invalid native output header.");
  const header = headerSchema.parse(JSON.parse(new TextDecoder().decode(bytes.slice(4, 4 + size))));
  if (
    header.report.partId !== partId ||
    4 + size + header.modelSize + header.blendSize !== bytes.byteLength
  )
    throw Error("Native output does not match the requested wall.");
  const model = bytes.slice(4 + size, 4 + size + header.modelSize),
    blend = bytes.slice(4 + size + header.modelSize);
  const view = new DataView(model);
  if (
    new TextDecoder().decode(new Uint8Array(model, 0, 4)) !== "glTF" ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== model.byteLength ||
    new TextDecoder().decode(new Uint8Array(blend, 0, 7)) !== "BLENDER"
  )
    throw Error("Invalid native artifact signatures.");
  if ((await digest(model)) !== header.modelHash || (await digest(blend)) !== header.blendHash)
    throw Error("Native artifact hash mismatch.");
  return { ...header, model, blend };
}
