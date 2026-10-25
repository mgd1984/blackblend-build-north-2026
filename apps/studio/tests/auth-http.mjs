import assert from "node:assert/strict";
const base = process.env.BLACKBLEND_TEST_ORIGIN ?? "http://127.0.0.1:4331";
if (new URL(base).hostname !== "127.0.0.1") throw Error("Local QA only.");
for (const route of [
  "/api/workflows",
  "/api/briefs",
  "/api/generations",
  "/api/billing",
  "/api/generation-media?id=8f2a8b00-29d3-4ac7-97a4-9c7af6336ff1&kind=source",
  "/api/workflow-media?id=8f2a8b00-29d3-4ac7-97a4-9c7af6336ff1&kind=source",
]) {
  for (const headers of [
    {},
    {
      "oai-authenticated-user-id": "forged",
      "oai-authenticated-user-email": "forged@example.invalid",
      Cookie: "__sites_local_auth=1",
    },
  ]) {
    assert.equal((await fetch(base + route, { headers })).status, 401, route);
  }
}
const old = await fetch(base + "/workflows?flow=8f2a8b00-29d3-4ac7-97a4-9c7af6336ff1", {
  redirect: "manual",
});
assert.equal(old.status, 307);
assert.equal(old.headers.get("location"), "/studio?project=8f2a8b00-29d3-4ac7-97a4-9c7af6336ff1");
console.log(
  "Passed: private endpoints reject unsigned and forged platform identities; saved bookmarks resolve to Studio. No provider calls.",
);
