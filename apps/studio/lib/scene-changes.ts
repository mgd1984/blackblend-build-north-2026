import { sceneDocument, type SceneDocument } from "./scene-document.ts";

/** Detect edits from checked scene data, not the agent's claim or the revision number. */
export function sceneChanges(source: SceneDocument, candidate: SceneDocument) {
  const before = sceneDocument.parse(source),
    after = sceneDocument.parse(candidate);
  const prior = new Map(before.parts.map((part) => [part.id, part]));
  const next = new Map(after.parts.map((part) => [part.id, part]));
  const added = after.parts.filter((part) => !prior.has(part.id)).map((part) => part.name);
  const removed = before.parts.filter((part) => !next.has(part.id)).map((part) => part.name);
  const updated = after.parts
    .filter(
      (part) => prior.has(part.id) && JSON.stringify(prior.get(part.id)) !== JSON.stringify(part),
    )
    .map((part) => part.name);
  const fields = [
    "camera",
    "animation",
    "background",
    "renderStyle",
    "title",
    "asset",
    "fidelity",
    "assumptions",
  ] as const;
  const settings = fields.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
  const geometry = JSON.stringify(before.geometry) !== JSON.stringify(after.geometry);
  // A changed ordering is still a real document edit, even with identical parts.
  const ordering =
    before.parts.map((part) => part.id).join(",") !== after.parts.map((part) => part.id).join(",");
  return {
    changed: !!(
      added.length ||
      removed.length ||
      updated.length ||
      settings.length ||
      geometry ||
      ordering
    ),
    added,
    removed,
    updated,
    settings,
    geometry,
    ordering,
  };
}

/** Limit browser Undo history. Source models and Blender versions remain private. */
export function retainedSceneHistory(raw: unknown): SceneDocument[] {
  if (!Array.isArray(raw)) return [];
  const retained: SceneDocument[] = [];
  let bytes = 0;
  for (const item of raw.slice(-30).reverse()) {
    const parsed = sceneDocument.safeParse(item);
    if (!parsed.success) continue;
    const size = new TextEncoder().encode(JSON.stringify(parsed.data)).length;
    if (bytes + size > 500_000) break;
    bytes += size;
    retained.unshift(parsed.data);
  }
  return retained;
}
