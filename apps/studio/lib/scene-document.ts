import { z } from "zod";
import { nativeSceneAssets } from "./scene-examples.ts";

const vector = z.tuple([
  z.number().finite().min(-1000).max(1000),
  z.number().finite().min(-1000).max(1000),
  z.number().finite().min(-1000).max(1000),
]);
const size = z.tuple([
  z.number().min(0.001).max(100),
  z.number().min(0.001).max(100),
  z.number().min(0.001).max(100),
]);
const label = z.string().trim().min(1).max(160);
export const scenePart = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    name: label,
    group: label,
    shape: z.enum(["box", "cylinder", "sphere", "native"]),
    node: z.string().max(200).nullable(),
    size,
    position: vector,
    rotation: vector,
    explode: vector,
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    visible: z.boolean(),
  })
  .strict();
export const sceneDocument = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0),
    title: label,
    fidelity: z.enum(["concept", "source-derived"]),
    asset: z.enum(["primitives", ...nativeSceneAssets]),
    geometry: z
      .object({
        id: z.string().uuid(),
        partId: z.string().regex(/^native-\d{1,3}$/),
        width: z.number().min(0.2).max(1.8),
        height: z.number().min(0.2).max(1.6),
        sill: z.number().min(0.2).max(1.9),
        offset: z.number().min(-1).max(1),
      })
      .strict()
      .optional(),
    parts: z.array(scenePart).min(1).max(200),
    camera: z
      .object({
        yaw: z.number().min(-720).max(720),
        elevation: z.number().min(-89.5).max(89.5),
        radius: z.number().min(0.02).max(200),
        target: vector,
        orbit: z.number().min(-360).max(360),
        projection: z.enum(["perspective", "orthographic"]).optional(),
        fov: z.number().min(12).max(85).optional(),
        orthoScale: z.number().min(0.002).max(500).optional(),
      })
      .strict(),
    animation: z
      .object({ duration: z.number().min(2).max(15), spread: z.number().min(0).max(2) })
      .strict(),
    background: z.enum(["studio", "white"]),
    renderStyle: z.enum(["material", "wireframe"]).optional(),
    assumptions: z.array(z.string().max(400)).max(30),
  })
  .strict()
  .superRefine((scene, context) => {
    if (new Set(scene.parts.map((p) => p.id)).size !== scene.parts.length)
      context.addIssue({ code: "custom", message: "Part IDs must be unique." });
    if (scene.parts.some((p) => p.shape === "native" && (!p.node || scene.asset === "primitives")))
      context.addIssue({ code: "custom", message: "Native parts need a matching source asset." });
    if (
      new Set(scene.parts.filter((p) => p.node).map((p) => p.node)).size !==
      scene.parts.filter((p) => p.node).length
    )
      context.addIssue({ code: "custom", message: "Each native node can only appear once." });
    if (
      scene.geometry &&
      (scene.asset !== "woodshed" ||
        !scene.parts.some((p) => p.id === scene.geometry!.partId && p.shape === "native"))
    )
      context.addIssue({
        code: "custom",
        message: "A geometry revision requires its authored wall.",
      });
  });
export type SceneDocument = z.infer<typeof sceneDocument>;
export type ScenePart = z.infer<typeof scenePart>;

const patch = scenePart.omit({ id: true }).partial().strict();
export const sceneOperation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update_part"), id: scenePart.shape.id, patch }).strict(),
  z.object({ type: z.literal("add_part"), part: scenePart }).strict(),
  z.object({ type: z.literal("remove_part"), id: scenePart.shape.id }).strict(),
  z
    .object({
      type: z.literal("settings"),
      title: label.optional(),
      camera: sceneDocument.shape.camera.partial().optional(),
      animation: sceneDocument.shape.animation.partial().optional(),
      background: z.enum(["studio", "white"]).optional(),
      renderStyle: z.enum(["material", "wireframe"]).optional(),
    })
    .strict(),
]);
export const sceneChange = z
  .object({
    baseRevision: z.number().int().min(0),
    message: z.string().min(1).max(3000),
    assumptions: z.array(z.string().max(400)).max(30),
    operations: z.array(sceneOperation).max(120),
  })
  .strict();
export type SceneChange = z.infer<typeof sceneChange>;
export function applySceneChange(input: SceneDocument, raw: unknown): SceneDocument {
  const change = sceneChange.parse(raw);
  const source = sceneDocument.parse(input);
  if (change.baseRevision !== source.revision)
    throw Error("The scene changed. Review the latest revision before applying this edit.");
  const next = structuredClone(source);
  for (const op of change.operations) {
    if (op.type === "settings") {
      if (op.title) next.title = op.title;
      if (op.background) next.background = op.background;
      if (op.renderStyle) next.renderStyle = op.renderStyle;
      if (op.camera) Object.assign(next.camera, op.camera);
      if (op.animation) Object.assign(next.animation, op.animation);
    } else if (op.type === "add_part") {
      if (next.parts.some((p) => p.id === op.part.id)) throw Error("That part already exists.");
      next.parts.push(op.part);
    } else {
      const index = next.parts.findIndex((p) => p.id === op.id);
      if (index < 0) throw Error("Part not found.");
      if (op.type === "remove_part") next.parts.splice(index, 1);
      else Object.assign(next.parts[index], op.patch);
    }
  }
  next.assumptions = [...new Set([...next.assumptions, ...change.assumptions])].slice(-30);
  next.revision++;
  return sceneDocument.parse(next);
}

const smooth = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};
export function animationPose(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  // Hold assembled, open, pause for inspection, close, then hold assembled again.
  const explode =
    t < 0.12
      ? 0
      : t < 0.36
        ? smooth((t - 0.12) / 0.24)
        : t < 0.62
          ? 1
          : t < 0.9
            ? 1 - smooth((t - 0.62) / 0.28)
            : 0;
  return { explode, orbit: smooth(t) };
}

export function conceptWoodshed(): SceneDocument {
  const parts: ScenePart[] = [];
  const add = (
    id: string,
    name: string,
    group: string,
    size: ScenePart["size"],
    position: ScenePart["position"],
    explode: ScenePart["explode"],
    color: string,
    rotation: ScenePart["rotation"] = [0, 0, 0],
  ) =>
    parts.push({
      id,
      name,
      group,
      shape: "box",
      node: null,
      size,
      position,
      explode,
      color,
      rotation,
      visible: true,
    });
  add("floor", "Shed floor", "Floor", [2.8, 0.18, 4.2], [0, 0.15, 0], [0, -0.25, 0], "#a1845e");
  add(
    "rear-wall",
    "Rear wall",
    "Existing shed",
    [2.8, 2.6, 0.12],
    [0, 1.54, -2.04],
    [0, 0, -1],
    "#617365",
  );
  add(
    "left-wall",
    "Window side",
    "Existing shed",
    [0.12, 2.6, 4.2],
    [-1.34, 1.54, 0],
    [-1, 0, 0],
    "#617365",
  );
  add(
    "right-wall",
    "Woodshed side",
    "Existing shed",
    [0.12, 2.6, 4.2],
    [1.34, 1.54, 0],
    [0.5, 0, 0],
    "#617365",
  );
  add(
    "door-left",
    "Front wall · left",
    "Existing shed",
    [0.6, 2.6, 0.12],
    [-1.1, 1.54, 2.04],
    [0, 0, 1],
    "#617365",
  );
  add(
    "door-right",
    "Front wall · right",
    "Existing shed",
    [0.6, 2.6, 0.12],
    [1.1, 1.54, 2.04],
    [0, 0, 1],
    "#617365",
  );
  add(
    "lintel",
    "Door lintel",
    "Existing shed",
    [1.6, 0.4, 0.12],
    [0, 2.64, 2.04],
    [0, 0.2, 1],
    "#617365",
  );
  add(
    "roof-left",
    "Gable roof · left",
    "Roof",
    [1.8, 0.12, 4.6],
    [-0.73, 3.13, 0],
    [-0.2, 1.4, 0],
    "#343837",
    [0, 0, 25],
  );
  add(
    "roof-right",
    "Gable roof · right",
    "Roof",
    [1.8, 0.12, 4.6],
    [0.73, 3.13, 0],
    [0.2, 1.4, 0],
    "#343837",
    [0, 0, -25],
  );
  add(
    "extension-floor",
    "Woodshed deck",
    "Woodshed",
    [1.5, 0.16, 4.2],
    [2.15, 0.15, 0],
    [1, -0.15, 0],
    "#bd9d70",
  );
  for (let i = 0; i < 6; i++)
    add(
      "slat-" + i,
      "Ventilation slat " + (i + 1),
      "Woodshed",
      [0.08, 0.2, 4.2],
      [2.85, 0.55 + i * 0.33, 0],
      [1.5, 0, 0],
      "#bd9d70",
    );
  add(
    "extension-roof",
    "Lean-to roof",
    "Woodshed",
    [1.8, 0.12, 4.6],
    [2.15, 2.65, 0],
    [1, 1.2, 0],
    "#343837",
    [0, 0, -12],
  );
  return sceneDocument.parse({
    version: 1,
    revision: 0,
    title: "Woodshed · assembly study",
    fidelity: "concept",
    asset: "primitives",
    parts,
    camera: { yaw: 35, elevation: 25, radius: 11, target: [0.7, 1.6, 0], orbit: 0 },
    animation: { duration: 10, spread: 1 },
    background: "studio",
    assumptions: [
      "Concept example. Load the private Blender export for the authored woodshed geometry.",
    ],
  });
}
