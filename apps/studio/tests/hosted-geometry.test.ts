import { NativePending } from "../lib/openai-blender.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hostedWindowExecutor,
  geometryArtifact,
  geometryRecord,
  geometryAvailable,
  runGeometryJob,
  NativeRejection,
  type GeometryConfig,
} from "../lib/hosted-geometry.ts";
import { conceptWoodshed, sceneDocument } from "../lib/scene-document.ts";
import { sqliteD1 } from "./sqlite-d1.ts";
import { digest } from "../lib/media-inspection.ts";
import { hostedSceneAgent } from "../lib/hosted-scene-agent.ts";
import { agentResponse, agentCall, agentMessage } from "./agent-fixture.ts";
const owner = "clerk:alice",
  other = "clerk:mallory";
const scene = () =>
  sceneDocument.parse({
    ...conceptWoodshed(),
    asset: "woodshed",
    fidelity: "source-derived",
    parts: [
      {
        ...conceptWoodshed().parts[0],
        id: "native-3",
        shape: "native",
        node: "native-3",
        name: "Original shed · wall 1 -1.001",
        size: [3, 2.7, 0.2],
      },
    ],
  });
const edit = { partId: "native-3", width: 0.8, height: 0.7, sill: 1, offset: 0.85 };
async function output() {
  const model = new Uint8Array(20);
  model.set(new TextEncoder().encode("glTF"));
  new DataView(model.buffer).setUint32(4, 2, true);
  new DataView(model.buffer).setUint32(8, 20, true);
  const blend = new TextEncoder().encode("BLENDER" + "0".repeat(993));
  const header = new TextEncoder().encode(
    JSON.stringify({
      report: {
        blenderVersion: "5.1.0",
        openingClear: true,
        existingWindowsPreserved: true,
        removedVolume: 0.03,
        affectedMeshes: 16,
        rayChecks: 9,
        trimSurfaceChecks: 4,
        wallPlaneNormal: [0, 1, 0],
        partId: "native-3",
      },
      modelSize: model.length,
      blendSize: blend.length,
      modelHash: await digest(model),
      blendHash: await digest(blend),
    }),
  );
  const packet = new Uint8Array(4 + header.length + model.length + blend.length);
  new DataView(packet.buffer).setUint32(0, header.length);
  packet.set(header, 4);
  packet.set(model, 4 + header.length);
  packet.set(blend, 4 + header.length + model.length);
  return packet.buffer;
}
function setup(execute?: () => Promise<ArrayBuffer>) {
  const { db, close } = sqliteD1(),
    objects = new Map<string, ArrayBuffer | string>();
  let dispatches = 0;
  const source = new TextEncoder().encode("BLENDER" + "0".repeat(993)).buffer;
  objects.set("scene-assets/woodshed-source.blend", source);
  const bucket = {
    async head(key: string) {
      return objects.has(key) ? { size: source.byteLength } : null;
    },
    async get(key: string) {
      const value = objects.get(key);
      if (!value) return null;
      const bytes = typeof value === "string" ? new TextEncoder().encode(value).buffer : value;
      return {
        size: bytes.byteLength,
        arrayBuffer: async () => bytes,
        body: new Response(bytes).body,
      };
    },
    async put(key: string, value: ArrayBuffer | string) {
      objects.set(key, value);
    },
  } as unknown as R2Bucket;
  const config: GeometryConfig = {
    DB: db,
    BUCKET: bucket,
    NATIVE_GEOMETRY_ENABLED: "true",
    NATIVE_ALLOWED_OWNERS: owner,
    NATIVE_DAILY_LIMIT: "2",
    OPENAI_API_KEY: "test-only",
    OPENAI_BLENDER_RUNTIME_FILE_ID: "file-runtime",
    NATIVE_TOOL_SHA256: "a".repeat(64),
  };
  const dispatch = async (id: string) => {
    dispatches++;
    await runGeometryJob(config, id, execute ?? output);
  };
  return { config, close, objects, db, dispatch, dispatches: () => dispatches };
}
test("hosted native revisions persist privately, replay once, preserve source and reject another owner", async () => {
  const s = setup();
  try {
    const original = scene(),
      request = crypto.randomUUID(),
      run = hostedWindowExecutor(s.config, owner, request, { dispatch: s.dispatch });
    const first = await run(original, edit),
      second = await run(original, edit);
    assert.deepEqual(first, second);
    assert.equal(s.dispatches(), 1);
    assert.equal(original.geometry, undefined);
    const id = first.scene.geometry!.id;
    assert.equal((await geometryRecord(s.config, owner, id)).status, "completed");
    assert.ok(await geometryArtifact(s.config, owner, id, "model"));
    assert.ok(await geometryArtifact(s.config, owner, id, "blend"));
    await assert.rejects(geometryArtifact(s.config, other, id, "model"), /not found/);
    await assert.rejects(
      hostedWindowExecutor(
        { ...s.config, NATIVE_ALLOWED_OWNERS: other },
        other,
        crypto.randomUUID(),
        { dispatch: s.dispatch },
      )(first.scene, edit),
      /not found/,
    );
    await assert.rejects(run(original, { ...edit, width: 0.9 }), /inputs changed/);
    await assert.rejects(geometryArtifact(s.config, owner, id, "../../source"), /Invalid/);
  } finally {
    s.close();
  }
});
test("lost native response and restart cannot launch another execution", async () => {
  const s = setup(async () => {
    throw Error("lost container response");
  });
  try {
    const id = crypto.randomUUID();
    await assert.rejects(
      hostedWindowExecutor(s.config, owner, id, { dispatch: s.dispatch })(scene(), edit),
      /reconciliation/,
    );
    await assert.rejects(
      hostedWindowExecutor(s.config, owner, id, { dispatch: s.dispatch })(scene(), edit),
      /reconciliation/,
    );
    assert.equal(s.dispatches(), 1);
    await assert.rejects(
      hostedWindowExecutor(s.config, owner, crypto.randomUUID(), { dispatch: s.dispatch })(
        scene(),
        edit,
      ),
      /reconciliation/,
    );
    assert.equal(s.dispatches(), 1);
  } finally {
    s.close();
  }
});
test("concurrent native claims execute once and completed candidates obey the daily limit", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const s = setup(async () => {
    await gate;
    return output();
  });
  try {
    const id = crypto.randomUUID(),
      a = hostedWindowExecutor(s.config, owner, id, { dispatch: s.dispatch })(scene(), edit);
    await new Promise((r) => setTimeout(r, 20));
    const b = hostedWindowExecutor(s.config, owner, id, { dispatch: s.dispatch })(scene(), edit);
    release();
    await Promise.allSettled([a, b]);
    assert.equal(s.dispatches(), 1);
    await hostedWindowExecutor(s.config, owner, crypto.randomUUID(), { dispatch: s.dispatch })(
      scene(),
      edit,
    );
    assert.equal(s.dispatches(), 2);
    await assert.rejects(
      hostedWindowExecutor(s.config, owner, crypto.randomUUID(), { dispatch: s.dispatch })(
        scene(),
        edit,
      ),
      /daily/,
    );
    assert.equal(s.dispatches(), 2);
  } finally {
    s.close();
  }
});
test("definitive geometry rejection is visible without publishing outputs, and the kill switch fails closed", async () => {
  const s = setup(async () => {
    throw new NativeRejection("The opening overlaps an existing window.");
  });
  try {
    await assert.rejects(
      hostedWindowExecutor(s.config, owner, crypto.randomUUID(), { dispatch: s.dispatch })(
        scene(),
        edit,
      ),
      /overlaps/,
    );
    const rows = await s.db
      .prepare("SELECT * FROM native_geometry")
      .all<{ status: string; id: string }>();
    assert.equal(rows.results[0].status, "failed");
    await assert.rejects(
      geometryArtifact(s.config, owner, rows.results[0].id, "model"),
      /not complete/,
    );
    assert.equal(s.objects.size, 1);
    assert.equal(
      geometryAvailable({ ...s.config, NATIVE_GEOMETRY_ENABLED: "false" }, owner),
      false,
    );
    await assert.rejects(
      hostedWindowExecutor(
        { ...s.config, NATIVE_GEOMETRY_ENABLED: "false" },
        owner,
        crypto.randomUUID(),
        { dispatch: s.dispatch },
      )(scene(), edit),
      /not enabled/,
    );
  } finally {
    s.close();
  }
});
test("the hosted SDK tool loop returns a real private candidate and durable replay reuses it", async () => {
  const s = setup();
  let calls = 0;
  try {
    const config = {
      ...s.config,
      OPENAI_API_KEY: "test-only",
      AGENT_ALLOWED_OWNERS: owner,
      BLACKBLEND_AGENT_TRACING: "off",
    };
    const service = hostedSceneAgent(
      config,
      async () =>
        agentResponse(
          ++calls === 1
            ? [agentCall("inspect_scene", {})]
            : calls === 2
              ? [agentCall("cut_window", edit)]
              : [agentMessage("Native window proposed.")],
        ),
      s.dispatch,
    );
    const input = { requestId: crypto.randomUUID(), prompt: "Cut a real window", scene: scene() };
    const reply = await service.run(owner, input);
    assert.ok(reply.scene.geometry?.id);
    assert.equal(s.dispatches(), 1);
    assert.equal((await geometryRecord(s.config, owner, reply.scene.geometry!.id)).owner, owner);
    assert.deepEqual(await service.run(owner, input), reply);
    assert.equal(calls, 3);
    assert.equal(s.dispatches(), 1);
    assert.equal(input.scene.geometry, undefined);
  } finally {
    s.close();
  }
});

test("an interrupted final chat response recovers the verified native candidate at the original revision", async () => {
  const s = setup();
  let calls = 0;
  try {
    const config = {
      ...s.config,
      OPENAI_API_KEY: "test-only",
      AGENT_ALLOWED_OWNERS: owner,
      BLACKBLEND_AGENT_TRACING: "off",
    };
    const service = hostedSceneAgent(
      config,
      async () =>
        agentResponse(
          ++calls === 1
            ? [agentCall("inspect_scene", {})]
            : calls === 2
              ? [agentCall("cut_window", edit)]
              : [agentMessage("Native window proposed.")],
        ),
      s.dispatch,
    );
    const input = { requestId: crypto.randomUUID(), prompt: "Cut a real window", scene: scene() };
    await service.run(owner, input);
    await s.db
      .prepare(
        "UPDATE agent_requests SET status='unknown',reply=NULL WHERE owner=? AND request_id=?",
      )
      .bind(owner, input.requestId)
      .run();
    const result = await service.status(owner, input.requestId);
    assert.equal(result.status, "completed");
    assert.ok(result.reply?.scene.geometry);
    assert.equal(result.reply?.scene.revision, input.scene.revision);
    assert.match(result.reply!.message, /Recovered/);
    assert.equal(calls, 3);
    assert.equal(s.dispatches(), 1);
    await assert.rejects(service.status(other, input.requestId), /not found/);
  } finally {
    s.close();
  }
});

test("an unfinished native edit cannot be reported as a successful unchanged chat proposal", async () => {
  const s = setup(async () => {
    throw new NativePending("Still running");
  });
  let calls = 0;
  try {
    const config = { ...s.config, AGENT_ALLOWED_OWNERS: owner, BLACKBLEND_AGENT_TRACING: "off" };
    const service = hostedSceneAgent(
      config,
      async () =>
        agentResponse(
          ++calls === 1
            ? [agentCall("inspect_scene", {})]
            : calls === 2
              ? [agentCall("cut_window", edit)]
              : [agentMessage("No candidate available yet.")],
        ),
      s.dispatch,
    );
    const requestId = crypto.randomUUID();
    await assert.rejects(
      service.run(owner, { requestId, prompt: "Cut a real window", scene: scene() }),
      /reconciliation/,
    );
    assert.equal((await service.status(owner, requestId)).status, "unknown");
    assert.equal(s.dispatches(), 1);
  } finally {
    s.close();
  }
});
