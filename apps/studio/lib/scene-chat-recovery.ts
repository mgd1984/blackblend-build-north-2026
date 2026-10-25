import { z } from "zod";
import type { SceneDocument } from "./scene-document.ts";

const pendingChat = z
  .object({
    version: z.literal(1),
    owner: z.string().min(1).max(200),
    requestId: z.string().uuid(),
    baseRevision: z.number().int().nonnegative(),
    sceneHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.number().int().positive(),
  })
  .strict();
export type PendingChat = z.infer<typeof pendingChat>;
export type ChatStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const pendingChatKey = (owner: string) =>
  "blackblend.pending-chat.v1:" + encodeURIComponent(owner);
export function readPendingChat(storage: ChatStorage, owner: string): PendingChat | null {
  try {
    const saved = pendingChat.safeParse(
      JSON.parse(storage.getItem(pendingChatKey(owner)) ?? "null"),
    );
    return saved.success && saved.data.owner === owner ? saved.data : null;
  } catch {
    return null;
  }
}
export function storePendingChat(storage: ChatStorage, pending: PendingChat) {
  const validated = pendingChat.parse(pending);
  storage.setItem(pendingChatKey(validated.owner), JSON.stringify(validated));
}
export function clearPendingChat(storage: ChatStorage, pending: PendingChat) {
  // A late response must never remove a newer request from the same account.
  if (readPendingChat(storage, pending.owner)?.requestId === pending.requestId)
    storage.removeItem(pendingChatKey(pending.owner));
}
export async function sceneFingerprint(scene: SceneDocument) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(scene)),
  );
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
}
export async function pendingMatchesScene(
  pending: PendingChat,
  owner: string,
  scene: SceneDocument,
) {
  return (
    pending.owner === owner &&
    pending.baseRevision === scene.revision &&
    pending.sceneHash === (await sceneFingerprint(scene))
  );
}

export async function createPendingChat(
  owner: string,
  scene: SceneDocument,
  requestId: string,
): Promise<PendingChat> {
  return pendingChat.parse({
    version: 1,
    owner,
    requestId,
    baseRevision: scene.revision,
    sceneHash: await sceneFingerprint(scene),
    createdAt: Date.now(),
  });
}

export async function fetchPendingChatStatus(pending: PendingChat, fetchImpl = fetch) {
  const record = pendingChat.parse(pending);
  return fetchImpl("/api/scene-agent?id=" + encodeURIComponent(record.requestId), {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
}
