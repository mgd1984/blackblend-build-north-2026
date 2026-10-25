import { requestOwner } from "../../../lib/identity";
import { BriefConflictError, createBrief, listBriefs, getBrief } from "../../../lib/brief-store";
import { readJsonBounded, RequestBodyError } from "../../../lib/request-body";
export const dynamic = "force-dynamic";
const options = { headers: { "Cache-Control": "private, no-store" } };
export async function GET(request: Request) {
  const owner = await requestOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in to view briefs." }, { status: 401, ...options });
  try {
    const id = new URL(request.url).searchParams.get("id");
    return Response.json(
      id ? { brief: await getBrief(owner, id) } : { briefs: await listBriefs(owner) },
      options,
    );
  } catch {
    return Response.json(
      { error: "Briefs are temporarily unavailable." },
      { status: 503, ...options },
    );
  }
}
export async function POST(request: Request) {
  const owner = await requestOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in to save a brief." }, { status: 401, ...options });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin." }, { status: 403, ...options });
  try {
    const brief = await createBrief(
      owner,
      await readJsonBounded(request, 20000, { requireJson: false }),
    );
    return Response.json({ brief }, options);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return Response.json(
        { error: error.status === 413 ? "Brief is too large." : error.message },
        { status: error.status, ...options },
      );
    if (error instanceof BriefConflictError)
      return Response.json({ error: error.message }, { status: 409, ...options });
    if (error instanceof Error && (error.name === "ZodError" || error instanceof SyntaxError))
      return Response.json({ error: "Check your brief fields." }, { status: 400, ...options });
    return Response.json(
      { error: "Could not save. Retry with the same request ID." },
      { status: 503, ...options },
    );
  }
}
