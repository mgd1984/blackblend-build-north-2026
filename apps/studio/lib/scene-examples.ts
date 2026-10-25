/** Fixed private asset names; never accept a caller-supplied path or URL. */
export const nativeSceneAssets = ["woodshed", "massey-harris-21", "ptz"] as const;
export type NativeSceneAsset = (typeof nativeSceneAssets)[number];
export const nativeSceneTitles: Record<NativeSceneAsset, string> = {
  woodshed: "Woodshed",
  "massey-harris-21": "Massey-Harris 21",
  ptz: "PTZ camera rig",
};
export function sceneExampleFile(asset: string | null, kind: string | null) {
  if (kind !== "model" && kind !== "document") return null;
  if (asset !== null && !nativeSceneAssets.includes(asset as NativeSceneAsset)) return null;
  return `${asset ?? "woodshed"}.${kind === "model" ? "glb" : "json"}`;
}
