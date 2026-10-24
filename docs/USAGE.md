# Setup and usage

## Studio

Use Node 22 LTS or 24+. From the repository root:

```sh
npm ci
npm run db:local
npm run dev
```

Open http://127.0.0.1:4331. There is one application and one install. Root commands run the `@blackblend/studio` workspace.

Clerk's public build key is `VITE_CLERK_PUBLISHABLE_KEY`; put it in ignored `apps/studio/.env.standalone.local`. Configure `CLERK_ISSUER` and `APP_ORIGIN` for the actual local origin in ignored `apps/studio/.dev.vars`. Provider keys do not belong in these files. Keep the same D1/R2 resource IDs in `apps/studio/wrangler.jsonc`; database migrations require an explicit local or remote target. The existing live deployment uses a Clerk development instance.

Examples are public. Save a source or open Your projects to sign in with Clerk. New projects stay within `/studio?project=…`. Uploads are private and limited to 25 MB per file. Prepared animations supply motion; reference photos supply appearance. Comparison clips selected while exploring examples stay browser-local; saving uploads the native source only.

Studio now opens its interactive Scene view. See [Scene Studio](SCENE-STUDIO.md) for assembly editing, reviewed agent proposals, local animation capture and the handoff into Review. The authored woodshed export remains private to this computer; a fresh checkout uses a labelled concept model.

For a production build:

```sh
npm run typecheck
npm test
npm run build
npm run check:dependencies
npm run preview
```

The Vite development server uses its installed workerd compatibility date and local auth origin automatically. Wrangler is pinned to the same release used by the Vite plugin so local D1/R2 state has one runtime format. Its production-build preview needs a local compatibility date; deployment config retains 2026-10-20. For a local-only production-build preview, run from `apps/studio`:

```sh
npm run preview
```

This override does not alter deployment settings. Build/test commands never deploy. Dependency advisories still block release readiness; do not treat a passing functional build as a security clearance.

## Blender and desktop execution

macOS execution requires ffmpeg/ffprobe and Xcode Command Line Tools. Start the desktop adapter:

```sh
npm run start:desktop
```

The API binds to 127.0.0.1:4317. Opening its root sends you to the local Studio on port 4331. Set `BLACKBLEND_STUDIO_URL=https://blackblend-studio.mgd1984.workers.dev/studio` when deliberately using the deployed app instead. Approval returns to the same configured Studio. It has no separate lab or project interface. Native scenes and local run records remain on the computer.

Install `blender/blackblend.py` through Blender Preferences → Add-ons → Install from Disk. Existing installed addon copies do not update automatically. In the 3D View press N, choose Blackblend and Connect / refresh. Render a movie before selecting Animation file / fal. Choose an MP4, MOV or WebM of at most 15 seconds and 50 MB. Use scene animation output selects an existing movie; PNG sequences need encoding first.

The addon supports local generation and checking existing jobs. Its browser button opens Studio. Install changes here are source changes; verify the installed copy separately. There is no account/project sync inside the addon yet. Importing its result into a Studio project is explicit and agent-mediated.

## Credentials

Store keys through the hidden interactive prompt:

```sh
node tt-video.mjs key set --provider fal
node tt-video.mjs key check --provider fal
node tt-video.mjs key set
node tt-video.mjs key check
npm run agent:key
```

fal uses Keychain service `blackblend.fal.ai`; Tenstorrent uses `blackblend.tenstorrent.console`; the scene agent uses `blackblend.openai`, all with account `api-key`. `key check` tests local access, not provider validity. Keys pass through private pipes, never command arguments, browser code or project files.

## Generation and recovery

The Studio review flow prepares a source-bound request. In local development it can freeze the reviewed MP4 and appearance references directly through the desktop adapter. Agent-mediated Blender handoffs can still use `scripts/workflow-handoff.mjs`. A narrow local approval screen shows the exact animation, references, prompt and quality. A person must explicitly approve a specific paid experiment. Balance or a prior approval does not authorize a new experiment.

fal animation input currently uses `minimax/h3-max/3d-to-video`. Tenstorrent's verified integration accepts prompt/image input; an equivalent animation-input endpoint is unverified. Do not infer capability from a model slug.

Never retry an ambiguous submission. Resume polling/downloading a known job, or inspect provider history when no remote ID was returned. Local files remain under ignored `runs/`; deletion there does not delete provider assets. Do not assign old runs to projects automatically.

[Detailed approval protocol](WORKFLOW.md) · [Product milestone](PRODUCT.md)

## Hosted execution preview

The latest Studio includes frozen hosted generation controls and owner-scoped usage status. See [hosted generation setup](HOSTED-GENERATION.md) and [sandbox billing setup](METERED-BILLING.md). Local development keeps hosted paid submission disabled because provider media requires a configured public HTTPS origin. Keys stay in Keychain locally and Worker secrets when hosted.
