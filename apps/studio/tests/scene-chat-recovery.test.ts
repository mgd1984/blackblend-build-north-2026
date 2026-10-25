import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readPendingChat,
  storePendingChat,
  clearPendingChat,
  pendingChatKey,
  sceneFingerprint,
  pendingMatchesScene,
  fetchPendingChatStatus,
  createPendingChat,
  type PendingChat,
  type ChatStorage,
} from "../lib/scene-chat-recovery.ts";
import { conceptWoodshed } from "../lib/scene-document.ts";
const storage = (): ChatStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
};
async function pending(owner = "alice"): Promise<PendingChat> {
  const scene = conceptWoodshed();
  return {
    version: 1,
    owner,
    requestId: crypto.randomUUID(),
    baseRevision: scene.revision,
    sceneHash: await sceneFingerprint(scene),
    createdAt: Date.now(),
  };
}
test("request identity survives reload and stays bound to the account and exact source", async () => {
  const session = storage(),
    request = await pending(),
    source = conceptWoodshed();
  storePendingChat(session, request);
  const recovered = readPendingChat(session, "alice");
  assert.deepEqual(recovered, request);
  assert.equal(readPendingChat(session, "bob"), null);
  assert.equal(await pendingMatchesScene(request, "alice", source), true);
  assert.equal(await pendingMatchesScene(request, "bob", source), false);
  assert.equal(await pendingMatchesScene(request, "alice", { ...source, revision: 1 }), false);
  assert.equal(
    await pendingMatchesScene(request, "alice", { ...source, background: "white" }),
    false,
  );
  assert.ok(!JSON.stringify(recovered).includes(source.parts[0].name));
});
test("late completion cannot erase a newer request, and malformed records do not recover", async () => {
  const session = storage(),
    first = await pending(),
    second = await pending();
  storePendingChat(session, first);
  storePendingChat(session, second);
  clearPendingChat(session, first);
  assert.deepEqual(readPendingChat(session, "alice"), second);
  clearPendingChat(session, second);
  assert.equal(readPendingChat(session, "alice"), null);
  session.setItem(pendingChatKey("alice"), JSON.stringify({ ...first, owner: "bob" }));
  assert.equal(readPendingChat(session, "alice"), null);
  session.setItem(pendingChatKey("alice"), JSON.stringify({ ...first, requestId: "../other" }));
  assert.equal(readPendingChat(session, "alice"), null);
  session.setItem(pendingChatKey("alice"), "{");
  assert.equal(readPendingChat(session, "alice"), null);
  assert.throws(
    () =>
      storePendingChat(
        {
          ...session,
          setItem: () => {
            throw Error("storage disabled");
          },
        },
        first,
      ),
    /storage disabled/,
  );
});

test("recovery only reads the existing owner-scoped request and never retries a POST", async () => {
  const request = await createPendingChat("alice", conceptWoodshed(), crypto.randomUUID());
  let calls = 0;
  const response = await fetchPendingChatStatus(request, (async (url, options) => {
    calls++;
    assert.equal(url, "/api/scene-agent?id=" + request.requestId);
    assert.equal(options?.method, "GET");
    assert.equal(options?.body, undefined);
    return Response.json({ status: "completed", reply: { message: "Recovered" } });
  }) as typeof fetch);
  assert.equal(((await response.json()) as { status: string }).status, "completed");
  assert.equal(calls, 1);
  await assert.rejects(
    fetchPendingChatStatus(request, (async () => {
      calls++;
      throw Error("offline");
    }) as typeof fetch),
    /offline/,
  );
  assert.equal(calls, 2);
});
