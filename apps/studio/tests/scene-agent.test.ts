import { test } from "node:test";
import assert from "node:assert/strict";
import { createSceneAgent } from "../lib/scene-agent-runner.ts";
import { validateAgentReply } from "../lib/scene-agent.ts";
import { conceptWoodshed, sceneDocument } from "../lib/scene-document.ts";
import { agentResponse, agentCall, agentMessage } from "./agent-fixture.ts";
const request = () => ({
  requestId: crypto.randomUUID(),
  prompt: "Use a white background.",
  scene: conceptWoodshed(),
});
const settings = {
  yaw: null,
  elevation: null,
  radius: null,
  target: null,
  orbit: null,
  duration: null,
  spread: null,
  background: "white",
};
test("SDK executes typed tools, returns a source-bound proposal, usage and a trace ID without duplicate POSTs", async () => {
  let calls = 0;
  const agent = createSceneAgent({
    tracing: false,
    getKey: async () => "test-only-secret",
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(options!.body));
      assert.equal(body.store, false);
      assert.equal(body.model, "gpt-6.1-sol");
      assert.ok(body.tools.some((x: { name: string }) => x.name === "cut_window"));
      return agentResponse(
        calls === 1
          ? [agentCall("set_scene", settings)]
          : [agentMessage("White background proposed.")],
      );
    },
  });
  const input = request();
  const [a, b] = await Promise.all([agent(input), agent(input)]);
  assert.deepEqual(a, b);
  assert.equal(calls, 2);
  assert.equal(a.scene.background, "white");
  assert.equal(input.scene.background, "studio");
  assert.equal(a.scene.revision, input.scene.revision);
  assert.ok(a.agent!.traceId.startsWith("trace_"));
  assert.equal(a.agent!.inputTokens, 200);
  assert.ok(!JSON.stringify(a).includes("test-only-secret"));
  await assert.rejects(agent({ ...input, prompt: "Changed" }), /different inputs/);
});
test("native window tool uses a verified executor, never a model-invented revision", async () => {
  const source = sceneDocument.parse({
    ...conceptWoodshed(),
    asset: "woodshed",
    fidelity: "source-derived",
    parts: [
      {
        ...conceptWoodshed().parts[0],
        id: "native-3",
        node: "native-3",
        shape: "native",
        name: "Original shed · wall 1 -1.001",
        size: [3, 2.7, 0.2],
      },
    ],
  });
  const edit = { partId: "native-3", width: 0.8, height: 0.7, sill: 1, offset: -0.5 },
    id = crypto.randomUUID();
  let calls = 0,
    cuts = 0;
  const agent = createSceneAgent({
    tracing: false,
    getKey: async () => "test",
    cutWindow: async (scene, args) => {
      cuts++;
      assert.deepEqual(args, edit);
      return {
        scene: { ...scene, geometry: { id, ...edit } },
        report: { removedVolume: 0.04, openingClear: true, blenderVersion: "5.1.0" },
      };
    },
    fetchImpl: async () =>
      agentResponse(
        ++calls === 1
          ? [agentCall("cut_window", edit)]
          : [agentMessage("Verified native opening proposed.")],
      ),
  });
  const reply = await agent({
    requestId: crypto.randomUUID(),
    prompt: "Cut a window",
    scene: source,
  });
  assert.equal(cuts, 1);
  assert.equal(reply.scene.geometry?.id, id);
  assert.equal(source.geometry, undefined);
  assert.match(reply.agent!.actions[0], /Verified window/);
});
test("uncertain requests never repeat and invalid replies cannot mutate source", async () => {
  let calls = 0;
  const agent = createSceneAgent({
    tracing: false,
    getKey: async () => "test",
    fetchImpl: async () => {
      calls++;
      throw Error("network");
    },
  });
  const input = request();
  await assert.rejects(agent(input), /no retry/i);
  await assert.rejects(agent(input), /no retry/i);
  assert.equal(calls, 1);
  const source = conceptWoodshed();
  assert.throws(
    () =>
      validateAgentReply({ message: "Wrong revision", scene: { ...source, revision: 1 } }, source),
    /different scene revision/,
  );
  assert.throws(
    () =>
      validateAgentReply(
        { message: "Claim", scene: { ...source, fidelity: "source-derived" } },
        source,
      ),
    /cannot claim/,
  );
  assert.throws(
    () =>
      validateAgentReply(
        {
          message: "Node",
          scene: {
            ...source,
            asset: "woodshed",
            parts: [{ ...source.parts[0], shape: "native", node: "invented" }],
          },
        },
        source,
      ),
    /unavailable/,
  );
});
test("a completed reply with no tool edits remains informational and spends no native execution", async () => {
  const source = conceptWoodshed();
  let calls = 0,
    cuts = 0;
  const agent = createSceneAgent({
    tracing: false,
    getKey: async () => "test",
    cutWindow: async () => {
      cuts++;
      throw Error("must not execute");
    },
    fetchImpl: async () => {
      calls++;
      return agentResponse([
        agentMessage("No changes proposed. The requested shape is unsupported."),
      ]);
    },
  });
  const reply = await agent({
    requestId: crypto.randomUUID(),
    prompt: "Cut a maze shape",
    scene: source,
  });
  const { sceneChanges } = await import("../lib/scene-changes.ts");
  assert.equal(sceneChanges(source, reply.scene).changed, false);
  assert.deepEqual(reply.agent!.actions, []);
  assert.equal(calls, 1);
  assert.equal(cuts, 0);
});
