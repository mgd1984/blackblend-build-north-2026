# Blackblend agent instructions

## Product and docs

Blackblend is one Studio for agent-assisted physical design, starting with product visualization. Read README, `docs/product.md` and `docs/architecture.md` before changing direction. Physical AI is the broader opportunity: helping people and agents prepare, inspect and reuse digital models of physical products. Product video is the working workflow. General agentic CAD, drawing-to-CAD automation, simulation and connected twins are still proposed. Keep those capability boundaries explicit in public copy.

Write plain, direct English in docs, comments and help text. Say what happens, who does it and why it matters. Keep technical identifiers exact, and explain unfamiliar terms when needed. Use short, descriptive doc names. Update an existing guide rather than adding another plan or checkpoint document; put dated research and old decisions in `docs/archive/`.

## Code map

- `apps/studio/`: the only web app, using vinext/React/TypeScript, Clerk and Cloudflare D1/R2. One root npm install and lockfile. Editing, projects, review and comparison live here.
- `server.mjs`, `workflow.mjs`: optional desktop service on loopback port 4317. It has no editing UI or project database. Its browser page only approves a specific saved paid job; private run files record execution details.
- `fal-video.mjs`, `tt-video.mjs`, `scripts/keychain.swift`: provider calls and private-pipe Keychain access.
- `infra/blender/`: fixed-version private Blender image and HTTP service for the window tool. Exclude CAD and secrets from its build context.
- `lib/hosted-geometry.ts`, `lib/openai-blender.ts` under Studio: check model-job ownership, save private R2 files, prevent duplicate execution and run offline Blender through OpenAI hosted shell.
- `blender/`: scene/render helpers and addon source. Installed addon copies need separate verification.
- `public/workflow.*`: desktop approval page. Never add another lab or project interface here.
- Studio's `lib/generation-*`: hosted video jobs for approved accounts, fixed approval inputs, private media and HTTP routes. This does not grant customers commercial spending access.
- Studio's `lib/billing-*`: sandbox account mappings, usage delivery and verified provider notifications. No billing schedule is active. Accepted usage or a notification does not prove payment or authorize spending.
- `tests/`, `apps/studio/tests/`: mocked provider/approval tests and Studio API, session and comparison tests.
- `vendor/braces/`: documented security patch. Test the dependency path actually installed.
- `runs/`: ignored private job records, media and recovery archives. `assets/`: optional private examples.

The Convex app, Sites target, separate video-lab frontend and earlier Python client were removed. Do not restore parallel apps, databases, build targets or compatibility layers. Old bookmarks may redirect to Studio. Existing remote data is not automatically deleted or migrated.

## Work and checks

Use the primary checkout for the development server. Keep recovered worktrees as history/experiments; do not serve or deploy them as another current app. Release builds must come from a committed tree with no tracked changes. Check `/api/version` after startup and deployment; it must expose only the commit and development/release mode.

Run `npm run format` before committing JavaScript/TypeScript, styles or configuration; `npm run format:check` is required by CI. Keep formatting-only changes separate from behavior changes. Do not format generated files, migration metadata or vendored code.

Use Node 22 LTS or 24+. Run root `npm ci`, `npm run typecheck`, `npm test` and `npm run build`. `npm run dev` starts Studio on 4331; `npm run start:desktop` starts optional local execution on 4317. Media tests need ffmpeg/ffprobe; `FFMPEG_PATH`/`FFPROBE_PATH` can select executables. Compile changed addon Python with `python3 -m py_compile` and test changed operators with mocked submissions when appropriate. Never use paid provider calls as tests.

Run `npm run check:dependencies` before release. Only the documented, regression-tested local braces exception is accepted; new advisories block release. Local Workers has a compatibility-date mismatch: use an explicit local preview override rather than changing production settings. Builds and tests never deploy.

Check live Git/GitHub state and stage only the intended files. Preserve unrelated work and secrets. Use gh-stack for dependent PRs; merge only with explicit user authorization. Restricted tools can falsely report gh auth failure: compare a read-only call with approved normal network/Keychain access before suggesting credential changes. Never change credentials, global PATH or remotes as a workaround.

## Spending and secrets

Every new paid experiment needs explicit user authorization. The user has asked to stop speculative generation spending; an API balance is not permission. Use existing media and mocked endpoints. Never retry a paid POST whose outcome is unclear. Save the unknown outcome and inspect or resume that same remote job. Polling and downloads can be retried separately.

Keep API keys in Keychain and out of command arguments, browser code, logs and source. Never commit environment files, run metadata, provider asset URLs, private photos, personal CAD or native scenes. Only deliberately published demo encodes are allowlisted under `apps/studio/public/media`; other video stays ignored. Source manifests must not contain personal absolute paths. Keep source records and recovery archives in ignored `runs/`.

Keep loopback host/origin checks, the local action token and fixed media allowlists. Never expose the desktop service as a hosted server. Verify provider availability and accepted request fields in live documentation rather than guessing from model names.

## Blender and geometry

Read the live scene first. Before meaningful edits, save a named copy of unsaved work and keep revisions separate. Check relationships using actual geometry and renders. A scaled model or generated movie is not proof of measured dimensions, structural correctness or fabrication readiness.

Keep live Python work small. Fit cameras from sampled bounds and an analytic calculation, not nested frame/vertex projection searches; heavy scripts previously froze Blender. Start native renders asynchronously. Never force-terminate Blender without user approval, even after backup. Background Blender can crash on this host; check actual files rather than trusting the exit code.

When relevant, inspect frames/video for assembled first/last poses, correct wall motion, clipping and fixed camera radius. Photos guide appearance; they do not guarantee the first frame or lock the geometry.

The general Blender code experiment is parked on `codex/parked-blender-agent-2026-10-24` and excluded from the submission release. Do not reconnect it during release work; preserve its private models and job records under ignored `runs/`.

Hosted Blender costs money. Keep the account allowlist, enable flag, daily cap, process deadline and container expiry. Never give the container application secrets, arbitrary customer commands, network access or host filesystem mounts. Keep the exact approved offline runtime/tool hashes and save resource IDs before checking execution. Investigate unknown outcomes rather than running again. Cloudflare plan changes require the user; never buy or upgrade a subscription automatically.

## Completion and old runs

Report changes, checks, limits and exact file paths. Distinguish local tests from live provider, deployment and external-user evidence. Keep public docs current and operating rules here rather than expanding README.

Local project associations live beside media in private `ui.json` files. Never assign old runs automatically or move them between projects. Addon submissions stay unassigned until explicitly imported. New submissions retain appearance images locally; old fal jobs may have counts without recoverable photos. Never fetch old provider URLs to reconstruct them automatically.
