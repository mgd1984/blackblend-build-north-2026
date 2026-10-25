import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sceneDocument, type SceneDocument } from "../lib/scene-document";
import { validateWindowEdit, type WindowEdit } from "../lib/window-edit";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const assets = path.join(repo, "runs/scene-assets");
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export async function readGeometryFile(id: string, kind: string) {
  if (!uuid.test(id) || !["model", "blend", "report"].includes(kind))
    throw Error("Invalid geometry artifact.");
  const name = kind === "model" ? "woodshed.glb" : kind === "blend" ? "scene.blend" : "report.json";
  return readFile(path.join(assets, "revisions", id, name));
}
let active = false;
export async function cutNativeWindow(input: SceneDocument, raw: WindowEdit) {
  const scene = sceneDocument.parse(input),
    { edit } = validateWindowEdit(scene, raw);
  if (active) throw Error("A native geometry edit is already running.");
  active = true;
  try {
    const source = scene.geometry
      ? path.join(assets, "revisions", scene.geometry.id, "scene.blend")
      : path.join(assets, "woodshed-before-browser-export.blend");
    await access(source);
    const id = crypto.randomUUID(),
      directory = path.join(assets, "revisions", id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const request = path.join(directory, "input.private.json");
    await writeFile(request, JSON.stringify({ scene, edit, directory }), { mode: 0o600 });
    // Static Python and validated JSON only. Never execute model-provided code.
    try {
      await promisify(execFile)(
        process.env.BLENDER_PATH || "/Applications/Blender.app/Contents/MacOS/Blender",
        [
          "--background",
          "--disable-autoexec",
          source,
          "--python",
          path.join(repo, "blender/window_edit.py"),
          "--",
          request,
        ],
        { timeout: 120000, maxBuffer: 256000 },
      );
    } catch {
      /* Some Blender builds crash during shutdown. Verify the actual output receipt. */
    }
    const report = JSON.parse(
      await readFile(path.join(directory, "report.json"), "utf8").catch(
        () => '{"error":"Blender did not produce a verified opening."}',
      ),
    );
    if (report.error || report.openingClear !== true || !(report.removedVolume > 0))
      throw Error(
        report.error || "The window opening could not be verified. No scene changes applied.",
      );
    const glb = await readFile(path.join(directory, "woodshed.glb"));
    const blend = await readFile(path.join(directory, "scene.blend"));
    if (glb.subarray(0, 4).toString() !== "glTF" || blend.length < 1000)
      throw Error("The native revision is incomplete.");
    const next = sceneDocument.parse({
      ...scene,
      geometry: { id, ...edit },
      assumptions: [
        ...new Set([
          ...scene.assumptions,
          "Window opening is a visualization edit; framing and structural performance require engineering review.",
        ]),
      ].slice(-30),
    });
    await writeFile(path.join(directory, "document.json"), JSON.stringify(next), { mode: 0o600 });
    return {
      scene: next,
      report: {
        removedVolume: report.removedVolume,
        openingClear: true,
        blenderVersion: report.blenderVersion,
      },
    };
  } finally {
    active = false;
  }
}
