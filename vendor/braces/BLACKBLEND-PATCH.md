# Local security patch

Upstream: `braces` 3.0.3, MIT license retained in LICENSE.
Local revision: `3.0.3+blackblend.1`. This is not an upstream release.

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published patched version as of 2026-10-20. The upstream source is retained here so clean installs do not depend on postinstall mutation or an external fork.

Changes: a fixed depth limit of 128 at parser brace/parenthesis entry and at each recursive compile, expand and stringify AST step. Excessive nesting throws a controlled SyntaxError before native stack exhaustion. The limit cannot be disabled through options. Normal brace lists/ranges and escaped literals retain upstream behavior. This addresses the reported nesting fault; it is not a claim to eliminate all possible expansion resource exhaustion.

The private vendor workspace supplies `braces` to the glob dependency chain. Its build metadata identifies the local patch while retaining compatible upstream semver ranges. npm audit does not assess local source patches; passing audit must be considered together with `tests/dependencies.test.mjs`. Replace this workspace and vendor directory when an upstream patch is available, after rerunning those tests and the Cloudflare build.

`npm run check:dependencies` fails on audit service errors and all advisories except this exact locally fixed GHSA. It first verifies the installed workspace path/version and runs the real glob-chain regression tests. npm 10 may report seven high findings propagated from this one advisory, while npm 11 omits the local workspace. The raw report is not treated as proof that local code was assessed.
