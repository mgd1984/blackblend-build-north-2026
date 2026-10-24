import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Resolve through Studio's installed lint -> glob chain, not merely vendor source.
const studioRequire = createRequire(new URL('../apps/studio/package.json', import.meta.url));
const lintRequire = createRequire(studioRequire.resolve('eslint-config-next/core-web-vitals'));
const nextRequire = createRequire(lintRequire.resolve('@next/eslint-plugin-next'));
const globRequire = createRequire(nextRequire.resolve('fast-glob'));
const matchRequire = createRequire(globRequire.resolve("micromatch"));
const braces = matchRequire("braces");
test("installed glob dependency rejects excessive brace and parenthesis nesting", () => {
  assert.equal(
    matchRequire("braces/package.json").version,
    "3.0.3+blackblend.1",
  );
  for (const [open, close] of [
    ["{", "}"],
    ["(", ")"],
  ]) {
    const pattern = open.repeat(4000) + "a,b" + close.repeat(4000);
    for (const method of ["parse", "compile", "expand", "stringify"])
      assert.throws(() => braces[method](pattern), {
        name: "SyntaxError",
        message: /nesting/,
      });
  }
});
test("AST callers cannot bypass the nesting bound", () => {
  for (const method of ["compile", "expand", "stringify"]) {
    let ast = { type: "text", value: "x" };
    for (let n = 0; n < 8000; n++) ast = { type: "root", nodes: [ast] };
    assert.throws(() => braces[method](ast), {
      name: "SyntaxError",
      message: /nesting/,
    });
  }
});
test("normal glob lists, ranges, nested patterns and escaped literals remain compatible", () => {
  assert.deepEqual(braces.expand("a/{b,c}/{1..3}"), [
    "a/b/1",
    "a/b/2",
    "a/b/3",
    "a/c/1",
    "a/c/2",
    "a/c/3",
  ]);
  assert.deepEqual(braces.expand("{a,{b,c}}"), ["a", "b", "c"]);
  assert.deepEqual(braces.expand(String.raw`\{literal\}`), ["{literal}"]);
  assert.deepEqual(
    globRequire("micromatch")(
      ["app/page.tsx", "app/style.css"],
      "app/*.{ts,tsx}",
    ),
    ["app/page.tsx"],
  );
});
