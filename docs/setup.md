# Setup

Use this guide for local development, keys and deployment. [Studio](studio.md) covers the controls; [Blender](blender.md) covers the window tool.

## Run Studio

Install Node 22 LTS or 24+ and ffmpeg/ffprobe. Then run from the repository root:

```sh
npm ci
npm run db:local
npm run dev
```

Open http://127.0.0.1:4331. Use the primary checkout for this server. Keep recovered worktrees for reference rather than running competing copies.

Put your Clerk **publishable** key in ignored `apps/studio/.env.standalone.local` as `VITE_CLERK_PUBLISHABLE_KEY`. Local Clerk settings such as `CLERK_ISSUER` and `APP_ORIGIN` belong in ignored `apps/studio/.dev.vars`. Vite sets the local origin to `http://127.0.0.1:4331`. The deployed app currently uses a Clerk development instance.

`npm run db:local` applies migrations only to the local database. Remote migrations need a deliberate target and approval. Keep the existing production D1/R2 identifiers when deploying the existing app.

Without private model exports, Studio uses a labelled concept woodshed. Adding a model locally does not upload it to production. [Studio](studio.md#examples) lists the preparation scripts and [Blender](blender.md) covers private source storage.

## Check a build

```sh
npm run typecheck
npm test
npm run build
npm run check:dependencies
npm run preview
```

Tests mock provider calls. They never buy generation or deploy. A passing build alone does not establish security, provider availability or correct geometry. New dependency advisories block release; the documented local `braces` patch has its own regression tests.

The installed Workers runtime supports an earlier compatibility date than production. Development and `npm run preview` use an explicit local override. Keep production's date unchanged. Vite and Wrangler share the same runtime version and local database format.

## Keys and settings

An environment variable is a way to pass a value to code. It may hold a public setting or a secret. Only public values belong in the browser's `VITE_` variables.

| Setting | Where it belongs | What it does |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Local build file or Cloudflare build variable | Public Clerk application identifier, included in browser code |
| `CLERK_ISSUER`, `APP_ORIGIN` | Wrangler config; local overrides for development | Select the Clerk issuer and allowed site origin |
| `DB`, `BUCKET` | Wrangler bindings | Give the Worker access to D1 and R2; their resource IDs are not passwords |
| `OPENAI_API_KEY` | Worker secret | Pay for hosted chat and the supported Blender tool |
| `FAL_KEY` | Worker secret | Pay for hosted video generation |
| `GENERATION_MEDIA_SECRET` | Random Worker secret, at least 32 characters | Sign temporary links through which fal reads the approved source and references |
| `GENERATION_ALLOWED_OWNERS` | Worker secret | List the Clerk users allowed to submit video jobs |
| `GENERATION_DAILY_LIMIT` | Worker secret | Limit approvals per rolling 24 hours; code defaults to 3, with a maximum of 20 |
| `AGENT_ALLOWED_OWNERS` | Worker secret | List allowed chat users; falls back to the generation list if absent |
| `NATIVE_ALLOWED_OWNERS`, `NATIVE_GEOMETRY_ENABLED`, `NATIVE_DAILY_LIMIT` | Worker secrets | Control access to Blender edits and their daily limit; code defaults to 10, configurable from 1 to 20 |
| `OPENAI_BLENDER_RUNTIME_FILE_ID`, `NATIVE_TOOL_SHA256` | Worker secrets | Identify the uploaded Blender runtime and approved tool archive hash |
| `BLACKBLEND_AGENT_MODEL` | Server setting | Scene model; defaults to `gpt-6.1-sol` |
| `BLACKBLEND_AGENT_TRACING` | Server setting | Set to `off` to disable hosted traces |

The existing operator deployment was configured for one video approval per rolling day. These limits count attempts, not dollars. Changing the video allowlist does not enable Blender access or customer billing.

Keep provider keys in macOS Keychain for local work and in Worker secrets for hosted work. The two stores do not update each other. Never put provider keys in command arguments, browser code, logs, environment files or Git.

All local Keychain entries use account `api-key`:

| Service | Used for |
| --- | --- |
| `blackblend.openai` | Local chat |
| `blackblend.fal.ai` | Local fal jobs |
| `blackblend.tenstorrent.console` | Optional Tenstorrent adapter |

Use the hidden prompts:

```sh
npm run agent:key
node tt-video.mjs key set --provider fal
node tt-video.mjs key check --provider fal
node tt-video.mjs key set
node tt-video.mjs key check
```

`key check` confirms local access to a key, not that the provider accepts it. The helper passes keys through a private process pipe; do not run its `get` operation in a visible terminal.

For Worker secrets, use Wrangler's hidden prompt or an approved private pipe. `wrangler secret list` shows names and types without values. Keep existing secrets and storage bindings during deployment. The fal Worker secret was copied from Keychain during setup; renewing the Keychain copy does not update the Worker. Replace the hosted copy separately, then revoke the retired key. Prefer separate development and production keys when supported.

The media-signing secret creates temporary access links, not provider credentials. Anyone holding a link can read its selected file until expiry. Rotating this secret invalidates existing links, so check active jobs first.

Chat uses the OpenAI Agents SDK and Responses API, billed to the API account. ChatGPT subscription sign-in is not connected. Scene chat uses `store:false`. SDK tracing is separate: sensitive message/tool content is disabled, but trace IDs, timing and usage still need restricted access. The Blender tool stores its background response so interrupted jobs can be recovered; deleting its container does not delete that response.

## Paid jobs and recovery

On a saved animation, **Generate video** saves the selected inputs and opens a cost confirmation. The priced **Generate** button submits the job. Preparing it does not call fal. The displayed amount covers output video only; input video and image processing cost extra. It is not a full customer quote or a dollar cap.

The server saves the exact source, references, prompt and quality, checks the user and daily limit, then makes one submission. Repeated approval cannot create another job. The returned job ID lets the app check progress and download the result separately. Temporary provider access links expire after four hours. Browser job records never contain provider keys or private provider URLs.

If submission times out, investigate the existing job. Do not send another paid request just because the response was lost. A known job can be checked or downloaded again. After an uncertain approval, saved inputs remain available for investigation. Changing inputs requires cancelling an unsubmitted approval or making a new take. Old runs are never assigned to projects automatically.

Chat can also cost money. The browser retains the current account's request ID, source hash and scene version so it can recover an interrupted reply with status reads. It does not resend the original request automatically. An abandoned request eventually becomes explicitly unknown.

Hosted generation requires a public HTTPS origin, so it remains disabled on local HTTP development. Keep the desktop service private rather than tunnelling it or removing these checks. fal animation input uses `minimax/h3-max/3d-to-video`; the optional Tenstorrent adapter has only been verified for prompt/image input.

## Optional Blender addon

For local Blender work on macOS, install Xcode Command Line Tools and start:

```sh
npm run start:desktop
```

The service listens on `127.0.0.1:4317`; opening it sends you to Studio on port 4331. To use it with the deployed Studio, explicitly set `BLACKBLEND_STUDIO_URL=https://blackblend-studio.mgd1984.workers.dev/studio`. It serves local approval and job files. It has no separate editing interface or project database.

Install `blender/blackblend.py` through Blender Preferences → Add-ons → Install from Disk. Existing installed copies do not update when repository source changes. In the 3D View, press N, choose Blackblend, then Connect / refresh.

For Animation file / fal, choose a rendered MP4, MOV or WebM of at most 15 seconds and 50 MB. **Use scene animation output** selects an existing movie; encode PNG sequences first. The addon can submit approved local jobs and check existing ones. Moving a result into a Studio project is an explicit step, with no account/project sync inside the addon.

### Local render and upload steps

1. Save a private Studio project. A `prepare_render` workflow action returns instructions for the local agent; it does not start a render.
2. Read the live Blender scene. `blender/workflow.py` saves unsaved work to a copy, records camera/frame settings and starts a background proof or animation render. Use a new ignored `runs/` folder. Encode frames with ffmpeg and inspect the first/last frames and duration.
3. Upload the PNG proof and MP4, at most 25 MB each, to the project. The `.blend` stays local. Mark the exact source SHA-256 as reviewed.
4. `request_generation` returns saved job settings. Pass the reviewed `sourceFile` and optional local reference paths to `node scripts/workflow-handoff.mjs` through stdin. It checks the source hash, reads files only inside the local runs directory and prepares the local approval page.
5. Record `link_local_approval` with its proposal ID and source hash. A person checks the video, references, prompt and quality, then explicitly approves that paid experiment. Generated references are disabled; no currency cap is enforced.
6. The local service submits once. After completion, record `record_submission` and upload the matching result to Studio. This record comes from the caller; it is not independent confirmation from the provider. Never pass off an unrelated older video as a new result.

Workflow actions check ownership and scene version. A changed source needs another review; after requesting generation, start a new workflow to change the animation. Browser/MCP workflow tools cannot approve a paid submission or read Keychain. Hosted generation uses the separate server route described above.

Local verification: `node --test tests/workflow.test.mjs`, `apps/studio/tests/workflow-contract.test.ts` and `apps/studio/tests/render-http.mjs` use mocked requests and synthetic media. No live provider call is a test.

## Deploy and publish

Work in the private repository. Check a PR before merging; Cloudflare builds and deploys `main`. Its build settings are root `/`, `npm run build`, `npm run deploy`, Node 22 and the Clerk publishable build key. GitHub CI checks tests and dependencies separately. A cloud build does not replace those checks.

Release builds must come from a committed tree with no tracked changes. Check `/api/version` locally and on the deployed app after startup/deployment; it exposes only the commit and development/release mode. Builds never apply remote migrations. Migrations through `0007_openai_native_receipts.sql` are required for the current hosted features.

The public hackathon repository is a separately reviewed source copy. It does not follow private pushes automatically. Refresh it deliberately if the submitted demo changes, exclude private history/data/models/secrets, and record the originating commit. The first copy used placeholders for production resource IDs. There is no automatic publication command yet.

Customer billing remains disabled; see [billing](billing.md) before connecting a sandbox or selling access. A connected Stripe tool or dashboard session does not configure Worker credentials.
