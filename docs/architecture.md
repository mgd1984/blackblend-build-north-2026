# Architecture

Blackblend has one web app for agent-assisted physical design. Product visualization is its first working workflow. The browser displays and animates the model. The server saves projects, checks access and calls paid services. Blender handles the supported geometry edit.

The physical-AI roadmap builds on these responsibilities: richer model editing, reusable assembly information and eventually simulation-ready assets. OpenUSD exchange, physics simulation, robot control and connected digital twins are not implemented. The broader positioning does not introduce another app or execution service.

## The pieces

| Piece | Job | Code under `apps/studio/`, unless noted |
| --- | --- | --- |
| Studio: React, TypeScript and vinext | Editing, chat, animation, review and comparison | `app/` |
| Three.js and browser video encoder | Display the assembly and export its animation | `app/studio/scene-viewer.tsx`, `lib/browser-previs.ts` |
| Clerk | Sign-in and session identity | `lib/identity.ts`, `app/providers.tsx` |
| Cloudflare Worker | Check access, save data and call providers | `worker/`, `app/api/`, `lib/` |
| Cloudflare D1 | Store projects, scenes, takes and job records | `db/schema.ts`, `drizzle/` |
| Cloudflare R2 | Store private models, references and videos | Storage calls in `lib/` and `app/api/` |
| OpenAI Agents SDK and Sol | Read scene details and propose supported edits | `lib/scene-agent-runner.ts` |
| OpenAI hosted shell and Blender 5.1 | Run the fixed window tool in a temporary container | `lib/openai-blender.ts`, `lib/hosted-geometry.ts` |
| fal | Generate a visual treatment from animation and reference images | `lib/generation-service.ts`, `lib/fal-queue.ts` |
| Optional desktop service | Use local Blender files, Keychain and approved jobs on a Mac | Root `server.mjs`, `workflow.mjs`, `blender/` |

## From edit to video

Chat receives scene details: named parts, transforms, camera and animation settings. It proposes supported changes. The app checks them against the scene version before offering Preview and Apply. Undo restores an earlier version.

The browser animates parts and exports an MP4 when its encoder supports H.264. The take keeps the scene settings used for that export. The video model receives this authored motion as input, though it can still change the result.

Before a fal job starts, the server saves the selected video, references, prompt and quality. It checks ownership and approval, then records that submission has started before making one provider request. This prevents two clicks from creating two jobs. If the outcome is unclear, it keeps that state for investigation. Checking an existing job does not submit another one.

The result is saved privately and paired with its source. See [Studio](studio.md) for comparison and [setup](setup.md#paid-jobs-and-recovery) for interrupted jobs.

## Where Blender runs

For the hosted window tool, the Worker starts a temporary OpenAI container with a fixed Blender version and reviewed Python. The container has no network access, application secrets or connection to the user's Mac. Results are checked and saved to R2 before the app requests container deletion. [Blender](blender.md) explains the checks and limits.

Local development can instead use a background Blender process and keys from macOS Keychain. The optional desktop service listens only on `127.0.0.1:4317`. Its browser page handles approval; projects and editing stay in Studio on port 4331. The cloud app does not connect to the Mac automatically.

## Access and storage

Clerk identifies the user; the server checks ownership on private reads and writes. Browser changes must come from the configured site origin. Signed provider notifications and server-to-server bearer tokens have their own checks.

D1 is the project database. Its `briefs` table holds project details; `workflows` holds takes and their stages. Local run folders contain files and saved job details. Files are never assigned to a project automatically.

The scene document stores part changes, camera, animation settings and the selected geometry version. GLB and Blender files stay private. Saving a local scene does not upload its geometry. A checkout without private models uses a labelled concept woodshed.

## Billing and deployment

D1 stores usage awaiting delivery. Metronome is intended to price it; Stripe would collect payment. Current code supports sandbox tests only, with no active billing schedule or customer spending permission. See [billing](billing.md).

There is one root npm install, lockfile and Studio deployment. GitHub runs checks; Cloudflare builds and deploys `main`. `/api/version` reports the running commit. Building locally does not deploy.

The earlier Convex app, Sites deployment and separate video-lab interface were removed. `/workflows` and `/workspace` redirect old bookmarks to Studio. Historical remote data has not been automatically deleted or migrated.
