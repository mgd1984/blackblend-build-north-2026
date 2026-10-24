import { requestOwner } from "../../../lib/identity";
import { env } from "cloudflare:workers";
import { getWorkflow } from "../../../lib/workflow-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const owner = await requestOwner(request);
  if (!owner) return new Response("Sign in.", { status: 401 });
  try {
    const url = new URL(request.url),
      flow = await getWorkflow(owner, url.searchParams.get("id") ?? ""),
      kind = url.searchParams.get("kind"),
      key =
        kind === "proof"
          ? flow.proofKey
          : kind === "source"
            ? flow.sourceKey
            : kind === "result"
              ? flow.resultKey
              : null;
    if (!key || !env.BUCKET) return new Response("Not found.", { status: 404 });
    const object = await env.BUCKET.get(key, { range: request.headers });
    if (!object) return new Response("Not found.", { status: 404 });
    const headers = new Headers({
      "Content-Type": kind === "proof" ? "image/png" : "video/mp4",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    });
    if (object.range && "offset" in object.range) {
      const start = object.range.offset ?? 0,
        length = object.range.length ?? object.size;
      headers.set(
        "Content-Range",
        `bytes ${start}-${start + length - 1}/${object.size}`,
      );
      headers.set("Content-Length", String(length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { headers });
  } catch {
    return new Response("Not found.", { status: 404 });
  }
}
