import { requestOwner } from "../../../lib/identity";
import { getScene, listScenes, saveScene } from "../../../lib/scene-store";
import { readJsonBounded, RequestBodyError } from "../../../lib/request-body";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const owner = await requestOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in to open your scenes." }, { status: 401, headers });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ scenes: await listScenes(owner) }, { headers });
    const scene = await getScene(owner, id);
    return scene
      ? Response.json({ scene }, { headers })
      : Response.json({ error: "Scene not found." }, { status: 404, headers });
  } catch {
    return Response.json({ error: "Could not load scenes." }, { status: 503, headers });
  }
}
export async function POST(request: Request) {
  const owner = await requestOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in to save this scene." }, { status: 401, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin." }, { status: 403, headers });
  try {
    return Response.json(
      {
        scene: await saveScene(
          owner,
          await readJsonBounded(request, 250000, { requireJson: false }),
        ),
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof RequestBodyError)
      return Response.json(
        { error: error.status === 413 ? "Scene is too large." : error.message },
        { status: error.status, headers },
      );
    const conflict = error instanceof Error && error.message === "SCENE_CONFLICT";
    const invalid =
      error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
    return Response.json(
      {
        error: conflict
          ? "This scene was saved elsewhere. Reload it before saving again."
          : invalid
            ? "Invalid scene document."
            : "Could not save scene.",
      },
      { status: conflict ? 409 : invalid ? 400 : 503, headers },
    );
  }
}
