# Blackblend agent instructions

## Scope and truth

Blackblend is one product visualization Studio. Read README, docs/PRODUCT.md and docs/ARCHITECTURE.md for current direction. One source of geometry feeds reviewed visual outputs; product film is the first working slice. Drawing-to-CAD automation, interactive outputs, simulation and connected twins remain proposed.

## Repository map

- apps/studio/: the only web application, vinext/React/TypeScript with Clerk and Cloudflare D1/R2. One root workspace install and lockfile. Browser tools, projects, review and comparison live here.
- server.mjs and workflow.mjs: desktop execution adapter on loopback 4317. It has no project UI/database; private run files are execution receipts. The only local browser surface is frozen paid-job approval.
- fal-video.mjs, tt-video.mjs, scripts/keychain.swift: provider adapters and private-pipe Keychain access.
- infra/blender/: pinned private native-execution image and fixed window operation HTTP boundary. No CAD or secrets enter its build context.
- apps/studio/lib/hosted-geometry.ts and openai-blender.ts: owner-scoped native jobs, private R2 artifacts, single execution claims and offline OpenAI hosted-shell execution.
- blender/: native scene preparation/render helpers and addon source. Installed Blender copies are separate and need verification.
- public/workflow.*: narrow desktop approval screen; never add another lab/project interface here.
- apps/studio/lib/generation-*: owner-scoped hosted operator jobs, frozen approval, HTTP boundary and private media; no commercial customer entitlement.
- apps/studio/lib/billing-*: sandbox account mappings, usage delivery and signed notification inbox. The scheduled export has no activated cron; do not infer payment or spending rights from accepted usage or webhook receipt.
- tests/: mocked provider, approval and HTTP tests. apps/studio/tests contains Studio contract/session/comparison tests.
- vendor/braces/: retained documented security patch; test the installed dependency path.
- runs/: private ignored records, media and recovery archives. assets/: optional private examples.

The Convex app, original Sites target, standalone lab frontend and earlier Python client are removed. Do not reintroduce parallel apps, databases, build targets or compatibility layers. Old bookmark routes may redirect to Studio. Existing remote data is not automatically deleted or migrated.

## Work and validation

Use the primary checkout for the canonical dev server. Recovery worktrees are preserved history and experiments; do not serve or deploy them as a competing current app. `/api/version` exposes only the build commit and development/release mode; verify it after startup and deployment. Builds intended for release must come from a committed, clean tracked tree.

Use Node 22 LTS or 24+. Run npm ci from the root, npm run typecheck, npm test and npm run build. npm run dev opens the only app on 4331. npm run start:desktop starts optional local execution on 4317. ffmpeg/ffprobe are required for media tests; FFMPEG_PATH/FFPROBE_PATH may name explicit executables. Compile addon syntax with python3 -m py_compile and exercise changed operators with mocked submissions when appropriate. Never use paid provider calls as tests.

Run npm run check:dependencies before release. Only the documented, regression-tested local braces advisory exception is accepted; newly reported advisories block readiness. The local Workers runtime has a compatibility-date mismatch; use an explicit local preview override, never change production config merely to force local preview. Builds/tests never deploy.

Use scoped staging and live git/GitHub evidence. Preserve unrelated work and secrets. Use gh-stack for dependent review layers; never merge without explicit authorization. A restricted context may falsely report gh authentication failure: compare a read-only call with approved normal network/Keychain access before recommending credential changes. Never alter credentials, global PATH or remotes as a workaround.

## Spending and secrets

No new paid generation without explicit user authorization for that experiment. User has asked to stop speculative generation spending. API balance is not authorization. Test with existing media and mocked endpoints. Don't retry ambiguous billable POSTs; save the uncertain outcome and inspect/resume an existing remote job. Retry polling/download separately.

Keep API keys in Keychain, off argv, browser code, logs and source. No environment files, run metadata, provider asset URLs, private photos, personal CAD or native scenes in Git. Deliberately published demonstration encodes are allowlisted under apps/studio/public/media; other video stays ignored. A source manifest must not expose personal absolute paths. Keep local source provenance and recovery archives under ignored runs/.

Maintain loopback host/origin checks, local action token and fixed media allowlists. Do not expose this server as a hosted service. Provider availability and accepted schemas need live documentation, not assumptions from model names.

## Blender and geometry

Read live scene state first. Preserve a named snapshot of unsaved work before meaningful edits; save revisions separately. Use native geometry/renders to verify CAD relationships. Do not describe a scaled model or generated movie as measured, structurally verified or fabrication ready.

Keep live Python operations small. Camera fitting should use sampled bounds and an analytic fit, not nested per-frame/per-vertex projection searches. Heavy scripts previously froze the UI. Use native asynchronous render jobs. Don't force-terminate Blender without user approval, even if a backup exists. Background Blender may crash on this host; verify actual outputs rather than trusting process status.

Verify start/end closure, wall motion, clipping and constant camera radius when relevant. Inspect frames/encoded video. Photo references supply appearance, not a guaranteed starting frame or geometry lock.

## Completion

Report what changed, tests performed, material limitations and exact artifact paths. Separate local tests from provider behavior, deployment and external-user validation. Keep public documentation current; put operational rules here rather than bloating README.

Local run associations live with media in private ui.json records. Never auto-assign historical runs or move a run between projects. Existing addon submissions remain unassigned until imported explicitly. New submissions retain appearance images locally; older fal runs may have reference counts without recoverable files. Do not fetch old provider URLs to reconstruct them automatically.

Hosted native jobs are metered compute. Keep the operator allowlist, activation flag, daily cap, process deadline and container expiry. Never grant the container application secrets, arbitrary customer commands, network access or host filesystem mounts. Preserve pinned offline runtime/tool hashes and save resource IDs before observing execution. Unknown outcomes require reconciliation, not another execution. Cloudflare account plan changes require the user; never purchase or upgrade a subscription automatically.
