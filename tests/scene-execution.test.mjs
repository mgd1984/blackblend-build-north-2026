import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prepareSceneApproval, readSceneExecution } from "../scene-execution.mjs";
const id = "8f2a8b00-29d3-4ac7-97a4-9c7af6336ff1",
  proposal = "9f2a8b00-29d3-4ac7-97a4-9c7af6336ff1";
const bytes = Buffer.from("mock-reviewed-source"),
  hash = createHash("sha256").update(bytes).digest("hex");
const input = {
  siteWorkflowId: id,
  expectedSourceHash: hash,
  source: "data:video/mp4;base64," + bytes.toString("base64"),
  prompt: "Natural materials",
  resolution: "480P",
  images: [],
};
test("scene handoff binds the reviewed source and only prepares an approval", async () => {
  const calls = [];
  const result = await prepareSceneApproval(input, {
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "error");
      if (url.endsWith("/config")) return Response.json({ token: "a".repeat(64) });
      const payload = JSON.parse(options.body);
      assert.equal(payload.siteWorkflowId, id);
      assert.equal(payload.source, input.source);
      assert.equal(options.headers["X-Local-Token"], "a".repeat(64));
      return Response.json({
        id: proposal,
        sourceHash: hash,
        siteWorkflowId: id,
        inputHash: "b".repeat(64),
        status: "awaiting_approval",
        referenceCount: 0,
      });
    },
  });
  assert.equal(result.approvalUrl, "http://127.0.0.1:4317/workflow.html?id=" + proposal);
  assert.deepEqual(calls, [
    "http://127.0.0.1:4317/api/config",
    "http://127.0.0.1:4317/api/workflows",
  ]);
  assert.ok(!JSON.stringify(result).includes("a".repeat(64)));
  let accessed = false;
  await assert.rejects(
    prepareSceneApproval(
      { ...input, expectedSourceHash: "wrong" },
      {
        fetchImpl: async () => {
          accessed = true;
        },
      },
    ),
    /differs/,
  );
  assert.equal(accessed, false);
});
test("execution reads use a fixed target, expose only an exact job, and never submit", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:4317/api/jobs");
    assert.equal(options.redirect, "error");
    return Response.json([
      { id: "run-other", status: "completed", video: "/media/run-other" },
      {
        id: "run-mine",
        status: "completed",
        video: "/media/run-mine",
        remoteId: "private-provider-id",
        directory: "/private/source",
      },
    ]);
  };
  const record = await readSceneExecution("job", "run-mine", { fetchImpl });
  assert.equal(record.hasVideo, true);
  assert.equal(record.id, "run-mine");
  assert.equal(record.directory, undefined);
  assert.equal(record.remoteId, undefined);
  await assert.rejects(readSceneExecution("result", "../source"), /Invalid/);
});
