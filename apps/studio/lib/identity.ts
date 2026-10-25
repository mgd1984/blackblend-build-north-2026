import { env } from "cloudflare:workers";
import { verifyClerkSession } from "./clerk-session";
type AuthEnv = {
  CLERK_ISSUER?: string;
  APP_ORIGIN?: string;
};
export async function requestOwner(request: Request): Promise<string | null> {
  const config = env as AuthEnv;
  if (!config.CLERK_ISSUER || !config.APP_ORIGIN) return null;
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("__session="))
    ?.slice(10);
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : cookie;
  if (!token) return null;
  try {
    return await verifyClerkSession(token, config.CLERK_ISSUER, config.APP_ORIGIN);
  } catch {
    return null;
  }
}
