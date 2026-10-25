import { createRemoteJWKSet, jwtVerify } from "jose";
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyClerkSession(token: string, issuer: string, origin: string) {
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:") throw Error("Invalid Clerk issuer.");
  let keys = keysets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer));
    keysets.set(issuer, keys);
  }
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    algorithms: ["RS256"],
  });
  if (!payload.sub || typeof payload.sid !== "string" || payload.azp !== origin)
    throw Error("Invalid Clerk session.");
  return "clerk:" + payload.sub;
}
