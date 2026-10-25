import { env } from "cloudflare:workers";
import { requestOwner } from "../../../lib/identity";
import { hostedAgentOwner, type AgentConfig } from "../../../lib/hosted-scene-agent";
import { sceneExampleFile } from "../../../lib/scene-examples";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const owner = await requestOwner(request);
  if (!owner || !hostedAgentOwner(env as AgentConfig, owner))
    return new Response("Private example unavailable.", { status: 404 });
  const query = new URL(request.url).searchParams,
    kind = query.get("kind");
  const file = sceneExampleFile(query.get("asset"), kind);
  if (!file) return new Response("Not found.", { status: 404 });
  const object = await env.BUCKET?.get("scene-assets/" + file);
  if (!object) return new Response("Private example unavailable.", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": kind === "model" ? "model/gltf-binary" : "application/json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
