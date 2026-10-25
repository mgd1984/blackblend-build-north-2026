import { env } from "cloudflare:workers";
import { generationService, type GenerationConfig } from "../../../lib/generation-service";
export const dynamic = "force-dynamic";
// fal can read only the selected file through an expiring signed link. Keep it out of browser job records.
export async function GET(request: Request) {
  try {
    const object = await generationService(env as GenerationConfig).sourceCapability(
      new URL(request.url),
    );
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Media unavailable.", { status: 404 });
  }
}
