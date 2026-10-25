import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const expected = fileURLToPath(new URL("../vendor/braces/index.js", import.meta.url));
if (
  require.resolve("braces") !== expected ||
  require("braces/package.json").version !== "3.0.3+blackblend.1"
)
  throw Error("Expected local braces security patch is not installed.");
// Run the real dependency-chain regression checks before accepting this one local patch.
const tests = spawnSync(
  process.execPath,
  ["--test", fileURLToPath(new URL("../tests/dependencies.test.mjs", import.meta.url))],
  { stdio: "inherit" },
);
if (tests.status !== 0) process.exit(1);
const npm = process.env.npm_execpath;
const treeResult = npm
  ? spawnSync(process.execPath, [npm, "ls", "braces", "--all", "--json"], {
      encoding: "utf8",
    })
  : spawnSync("npm", ["ls", "braces", "--all", "--json"], { encoding: "utf8" });
if (treeResult.status !== 0) throw Error("Installed braces dependency tree is invalid.");
const tree = JSON.parse(treeResult.stdout);
function verifyTree(node) {
  for (const [name, child] of Object.entries(node.dependencies ?? {})) {
    if (name === "braces" && child.version !== "3.0.3+blackblend.1")
      throw Error("An unpatched braces copy is installed.");
    verifyTree(child);
  }
}
verifyTree(tree);
const result = npm
  ? spawnSync(process.execPath, [npm, "audit", "--json"], { encoding: "utf8" })
  : spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw Error("npm audit did not return a valid report.");
}
if (report.error || !report.metadata?.vulnerabilities)
  throw Error("Dependency audit unavailable; refusing to pass.");
const vulnerabilities = report.vulnerabilities ?? {};
const unexpected = [];
for (const [name, item] of Object.entries(vulnerabilities)) {
  if (!item.via?.length) unexpected.push(name);
  for (const via of item.via ?? []) {
    if (typeof via === "string") {
      if (!vulnerabilities[via]) unexpected.push(via);
      continue;
    }
    if (via.name !== "braces" || via.url !== "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm")
      unexpected.push(`${name}: ${via.url ?? via.title}`);
  }
}
if (unexpected.length) {
  console.error("Unresolved dependency advisories:", unexpected);
  process.exit(1);
}
console.log(
  `Dependency audit passed. Raw npm findings: ${report.metadata.vulnerabilities.total}; only the documented, regression-tested local braces patch is accepted.`,
);
