import { after, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { sqliteD1 } from "./sqlite-d1.ts";
import { conceptWoodshed } from "../lib/scene-document.ts";
import { readBodyBounded, readJsonBounded, RequestBodyError } from "../lib/request-body.ts";

// Bundle the actual routes/stores; substitute only Workers bindings and Clerk verification.
// Identity's bearer/cookie selection and all database/HTTP checks run unchanged.
const fixture = sqliteD1(),
  origin = "https://blackblend.example";
let uploads = 0;
const env = {
  DB: fixture.db,
  APP_ORIGIN: origin,
  CLERK_ISSUER: "https://test.clerk.accounts.dev",
  BUCKET: {
    async put() {
      uploads++;
    },
  },
};
Object.assign(globalThis, { __blackblendReviewEnv: env });
after(() => {
  fixture.close();
  Reflect.deleteProperty(globalThis, "__blackblendReviewEnv");
});
const result = await build({
  stdin: {
    contents: `export {POST as briefPost} from './app/api/briefs/route.ts';
    export {POST as scenePost} from './app/api/scenes/route.ts';
    export {POST as workflowPost} from './app/api/workflows/route.ts';
    export {POST as mcpPost} from './app/mcp/route.ts';`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "test-bindings",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "workers",
          namespace: "fixture",
        }));
        b.onResolve({ filter: /\/clerk-session$/ }, () => ({
          path: "clerk",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents:
            path === "workers"
              ? "export const env = globalThis.__blackblendReviewEnv;"
              : `export async function verifyClerkSession(token) {
          if (token === 'good-alice') return 'clerk:alice';
          if (token === 'good-bob') return 'clerk:bob';
          throw Error('Invalid test session');
        }`,
          loader: "js",
        }));
      },
    },
  ],
});
type TestReply = {
  brief: { id: string };
  workflow: { id: string; proof: string };
  error: string;
  result: { isError?: boolean; content: { text: string }[]; serverInfo: { name: string } };
};
type Handler = (r: Request) => Promise<Omit<Response, "json"> & { json(): Promise<TestReply> }>;
const { briefPost, scenePost, workflowPost, mcpPost } = (await import(
  "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
)) as Record<string, Handler>;
const valid = () => ({
  requestId: crypto.randomUUID(),
  title: "Woodshed film",
  track: "studio",
  audience: "Design client",
  goal: "Explain the woodshed assembly.",
  source: "blender",
  fidelity: "native",
});
function json(body: unknown, extra: Record<string, string> = {}) {
  return new Request(origin + "/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: "__session=good-alice",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
function streamed(limit: number, contentType: string, declared?: string) {
  let pulls = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(Math.ceil(limit / 2) + 1));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(origin + "/api/test", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: "__session=good-alice",
      "Content-Type": contentType,
      ...(declared ? { "Content-Length": declared } : {}),
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
  return { request, state: () => ({ pulls, cancelled }) };
}

test("MCP blocks hostile/missing/null cookie origins but preserves bearer and public discovery", async () => {
  for (const name of ["blackblend_create_brief", "blackblend_render_workflow_action"]) {
    for (const from of [
      null,
      "null",
      "https://evil.blackblend.example",
      "https://attacker.invalid",
    ]) {
      const r = json(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: valid() } },
        { "Content-Type": "text/plain" },
      );
      if (from === null) r.headers.delete("Origin");
      else r.headers.set("Origin", from);
      assert.equal((await mcpPost(r)).status, 403);
    }
  }
  const input = valid(),
    call = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "blackblend_create_brief", arguments: input },
    };
  const same = await (await mcpPost(json(call))).json();
  assert.equal(same.result.isError, undefined);
  const bearer = json(call, { Authorization: "Bearer good-alice" });
  bearer.headers.delete("Origin");
  assert.deepEqual(await (await mcpPost(bearer)).json(), same);
  const bad = json(
    { ...call, params: { ...call.params, arguments: valid() } },
    { Authorization: "Bearer invalid", Origin: "https://evil.blackblend.example" },
  );
  assert.equal((await (await mcpPost(bad)).json()).result.isError, true);
  const basic = json(call, {
    Authorization: "Basic arbitrary",
    Origin: "https://evil.blackblend.example",
  });
  assert.equal((await mcpPost(basic)).status, 403);
  const discover = json({ jsonrpc: "2.0", id: 3, method: "initialize" });
  discover.headers.delete("Origin");
  discover.headers.delete("Cookie");
  assert.equal((await (await mcpPost(discover)).json()).result.serverInfo.name, "blackblend");
  const rows = await fixture.db.prepare("SELECT count(*) AS n FROM briefs").first<{ n: number }>();
  assert.equal(rows!.n, 1, "hostile and invalid bearer calls must not persist briefs");
});

test("brief retries compare every validated field, retain the original, and isolate owners", async () => {
  const input = valid(),
    first = await (await briefPost(json(input))).json();
  assert.ok(first.brief.id);
  assert.deepEqual(
    await (await briefPost(json({ ...input, title: "  " + input.title + "  " }))).json(),
    first,
  );
  for (const [key, value] of Object.entries({
    title: "Another title",
    track: "directed",
    audience: "Another client",
    goal: "Explain a different assembly.",
    source: "cad",
    fidelity: "appearance",
  })) {
    const conflict = await briefPost(json({ ...input, [key]: value }));
    assert.equal(conflict.status, 409, key);
    assert.match((await conflict.json()).error, /different brief fields/);
  }
  const mcpConflict = await mcpPost(
    json({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "blackblend_create_brief", arguments: { ...input, title: "Changed title" } },
    }),
  );
  const error = (await mcpConflict.json()).result;
  assert.equal(error.isError, true);
  assert.match(error.content[0].text, /different brief fields/);
  assert.deepEqual(await (await briefPost(json(input))).json(), first);
  const other = await (
    await briefPost(json({ ...input, title: "Bob project" }, { Cookie: "__session=good-bob" }))
  ).json();
  assert.ok(other.brief.id);
  assert.notEqual(other.brief.id, first.brief.id);
  assert.equal((await briefPost(json({ ...input, requestId: crypto.randomUUID() }))).status, 200);
});

test("all JSON routes and multipart uploads cancel oversized streams without trusting Content-Length", async () => {
  for (const [handler, limit, type] of [
    [briefPost, 20_000, "application/json"],
    [scenePost, 250_000, "application/json"],
    [workflowPost, 300_000, "application/json"],
    [mcpPost, 20_000, "text/plain"],
    [workflowPost, 26_000_000, "multipart/form-data; boundary=review"],
  ] as const) {
    for (const length of [undefined, "1"]) {
      const s = streamed(limit, type, length);
      assert.equal((await handler(s.request)).status, 413);
      assert.deepEqual(s.state(), { pulls: 2, cancelled: true });
    }
    const advertised = streamed(limit, type, String(limit + 1));
    assert.equal((await handler(advertised.request)).status, 413);
    assert.deepEqual(advertised.state(), { pulls: 0, cancelled: true });
  }
  assert.equal(uploads, 0);
});

test("byte accounting, exact limits, malformed JSON and existing media-type contracts", async () => {
  const exact = new Request(origin, { method: "POST", body: "123456" });
  assert.equal((await readBodyBounded(exact, 6)).byteLength, 6);
  await assert.rejects(
    readBodyBounded(new Request(origin, { method: "POST", body: "éééé" }), 6),
    (e: unknown) => e instanceof RequestBodyError && e.status === 413,
  );
  await assert.rejects(
    readJsonBounded(new Request(origin, { method: "POST", body: "{}" }), 100),
    /JSON input required/,
  );
  assert.equal((await briefPost(json(valid(), { "Content-Type": "text/plain" }))).status, 200);
  for (const handler of [briefPost, scenePost, workflowPost]) {
    const bad = json({});
    const malformed = new Request(bad, { body: "{" });
    assert.equal((await handler(malformed)).status, 400);
    const unsigned = json({});
    unsigned.headers.delete("Cookie");
    assert.equal((await handler(unsigned)).status, 401);
    assert.equal(
      (await handler(json({}, { Origin: "https://evil.blackblend.example" }))).status,
      403,
    );
  }
});

test("valid scene saves retain conflict checks, workflows and multipart media reach the real stores", async () => {
  const scene = { id: crypto.randomUUID(), expectedVersion: 0, document: conceptWoodshed() };
  const saved = await scenePost(json(scene));
  assert.equal(saved.status, 200);
  assert.equal((await scenePost(json(scene))).status, 409);
  const project = (await (await briefPost(json(valid()))).json()).brief;
  const made = await workflowPost(
    json({ action: "create", briefId: project.id, prompt: "Photoreal woodshed." }),
  );
  assert.equal(made.status, 200);
  const flow = (await made.json()).workflow;
  const form = new FormData();
  form.set("id", flow.id);
  form.set("kind", "proof");
  form.set(
    "file",
    new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "proof.png", { type: "image/png" }),
  );
  const upload = await workflowPost(
    new Request(origin + "/api/workflows", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: "__session=good-alice",
      },
      body: form,
    }),
  );
  assert.equal(upload.status, 200, await upload.clone().text());
  assert.ok((await upload.json()).workflow.proof);
  assert.equal(uploads, 1);
});
