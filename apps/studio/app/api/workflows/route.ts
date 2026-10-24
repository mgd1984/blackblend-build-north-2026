import { requestOwner } from "../../../lib/identity";
import { readBodyBounded, readJsonBounded, RequestBodyError } from "../../../lib/request-body";
import {
  actWorkflow,
  listWorkflows,
  putMedia,
} from "../../../lib/workflow-store";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const owner = await requestOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in." }, { status: 401, headers });
  try {
    return Response.json(
      { workflows: await listWorkflows(owner) },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Could not load workflows." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  const owner = await requestOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in." }, { status: 401, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Invalid origin." },
      { status: 403, headers },
    );
  try {
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const bytes = await readBodyBounded(request, 26_000_000);
      const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(),
        file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose rendered media.");
      return Response.json(
        {
          workflow: await putMedia(
            owner,
            String(form.get("id")),
            String(form.get("kind")),
            file,
          ),
        },
        { headers },
      );
    }
    return Response.json(await actWorkflow(owner, await readJsonBounded(request, 300000, { requireJson: false })), {
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "Invalid workflow input.",
      },
      { status: error instanceof RequestBodyError ? error.status : 400, headers },
    );
  }
}
