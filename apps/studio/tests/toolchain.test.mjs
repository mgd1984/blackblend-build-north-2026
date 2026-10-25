import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const studio = createRequire(new URL("../package.json", import.meta.url));
const plugin = createRequire(import.meta.resolve("@cloudflare/vite-plugin"));
const cli = createRequire(studio.resolve("wrangler/package.json"));
test("Vite and the database CLI share one local Workers storage runtime", () => {
  assert.equal(studio("wrangler/package.json").version, plugin("wrangler/package.json").version);
  assert.equal(cli("miniflare/package.json").version, plugin("miniflare/package.json").version);
  const cliRuntime = createRequire(cli.resolve("miniflare/package.json"));
  const viteRuntime = createRequire(plugin.resolve("miniflare/package.json"));
  assert.equal(
    cliRuntime("workerd/package.json").version,
    viteRuntime("workerd/package.json").version,
  );
});
