import { test } from "node:test";
import assert from "node:assert/strict";
import { readStudioLocation, studioProjectUrl, legacyWorkflowUrl } from "../lib/studio-location.ts";
import { studioExamples } from "../lib/studio-examples.ts";
import { existsSync } from "node:fs";
const id = "8f2a8b00-29d3-4ac7-97a4-9c7af6336ff1";
test("one Studio route handles examples, saved work and preserved project links", () => {
  assert.deepEqual(readStudioLocation(""), {
    view: "build",
    projectId: null,
    example: "woodshed",
  });
  assert.equal(readStudioLocation("?example=ptz").example, "ptz");
  assert.equal(readStudioLocation("?example=ptz").view, "examples");
  assert.equal(readStudioLocation("?example=massey-harris-21").example, "massey-harris-21");
  assert.equal(readStudioLocation("?example=massey-harris-21").view, "examples");
  assert.equal(readStudioLocation("?view=review").view, "examples");
  assert.equal(readStudioLocation("?view=projects").view, "projects");
  assert.equal(readStudioLocation("?project=" + id).projectId, id);
  assert.equal(readStudioLocation("?flow=" + id).projectId, id);
  assert.equal(legacyWorkflowUrl({ flow: id }), "/studio?project=" + id);
  assert.equal(legacyWorkflowUrl({ flow: ["invalid", id] }), "/studio?view=projects");
  assert.equal(studioProjectUrl("https://evil.example"), "/studio?view=projects");
  assert.equal(readStudioLocation("?project=<script>").projectId, null);
});
test("public examples have real media and only attach available comparisons", () => {
  assert.equal(studioExamples.length, 3);
  for (const example of studioExamples) {
    assert.notEqual(example.source, example.result);
    for (const media of [example.source, example.result].filter(Boolean))
      assert.ok(existsSync(new URL("../public" + media, import.meta.url)));
  }
  assert.equal(
    studioExamples.find((example) => example.id === "massey-harris-21")?.result,
    "/media/massey-harris-21-result.mp4",
  );
});
