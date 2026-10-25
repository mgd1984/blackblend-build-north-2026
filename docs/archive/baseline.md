# Baseline

This public repository contains the reviewed submission release recorded in `SUBMISSION-SOURCE.json`. It is a source snapshot, with deployment resource identifiers replaced by placeholders. Private native models, execution receipts, credentials and development history are excluded.

## Review order

1. `apps/studio/lib/scene-document.ts` and `scene-camera.ts`: scene data and animation framing.
2. `apps/studio/lib/native-assembly.ts` and `app/studio/scene-viewer.tsx`: authored dimensions and material restoration.
3. `apps/studio/app/studio/scene-workspace.tsx`, `editor.tsx`, `generation-panel.tsx` and `comparison.tsx`: editing, finishing and comparison.
4. `apps/studio/lib/identity.ts`, `generation-service.ts`, `hosted-geometry.ts` and `openai-blender.ts`: ownership, saved job state and the fixed native tool.
5. `apps/studio/db/schema.ts`, `drizzle/`, root lockfile and `.github/workflows/ci.yml`: storage and checks.

One web app and one root npm workspace. Tests use mocked providers. Commercial billing and general Blender code execution remain outside this release. See the [demo guide](../demo.md) and [README](../../README.md).
