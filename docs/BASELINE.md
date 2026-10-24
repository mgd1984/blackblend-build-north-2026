# Studio baseline

The current Studio integration was merged on 24 October 2026 at source commit `89b6579c9c1aaf68cf59abc706efd96f4b1da2b4`, with the same application tree as tested commit `18cefa2`. The earlier 18 draft PRs were closed as superseded; their branches and a verified recovery bundle remain in the private development repository.

This public repository is a frozen submission snapshot, not another application or deployment target. See [submission provenance](../README.md#submission-provenance) and `SUBMISSION-SOURCE.json` for its publication boundary. Production resource identifiers in Wrangler configuration are replaced by placeholders. Private native geometry, account data, execution receipts and secrets are not included.

## Review order

1. `apps/studio/lib/scene-document.ts` and `scene-camera.ts`: validated scene state and deterministic animation framing.
2. `apps/studio/app/studio/scene-workspace.tsx`, `scene-viewer.tsx` and `prompt-composer.tsx`: editable assembly and canvas interaction.
3. `apps/studio/app/studio/editor.tsx`, `generation-panel.tsx` and `comparison.tsx`: Finish, priced consent and synchronized review.
4. `apps/studio/lib/identity.ts`, `generation-service.ts`, `hosted-geometry.ts` and `openai-blender.ts`: ownership, single-submit receipts and bounded native execution.
5. `apps/studio/db/schema.ts`, `drizzle/`, root lockfile and `.github/workflows/ci.yml`: persisted state and verification.

One web app, one root npm workspace and one lockfile. Run the checks listed in the README. Providers are mocked during automated tests. Commercial billing and arbitrary Blender execution remain outside the demonstrated scope.
