# Blender → Studio workflow

The Studio is the private review surface and workflow ledger. The local agent operates the user's existing Blender MCP and local helper. There is no cloud-to-desktop tunnel, hosted arbitrary Python, provider key transfer or unattended remote renderer.

## Stages

1. Open `/studio` and save a source to create a private project and render workflow. All project work stays in Studio.
2. Create a workflow with a fixed generation prompt and quality. The browser/hosted workflow action `prepare_render` returns a local-agent task; it does not claim the render is already running.
3. The agent reads the live Blender scene. `blender/workflow.py` saves a copy of unsaved work, records frame/camera metadata, and launches a native asynchronous PNG proof or animation render. Use a new ignored `runs/` subdirectory. Encode the frame sequence with ffmpeg; inspect start/end and duration. No scene geometry is changed by this helper.
4. Upload the PNG proof and native MP4 (25 MB maximum each). Media is stored in R2 and served only after caller ownership is checked. The .blend scene stays local. Review the source video before marking its SHA-256 reviewed.
5. `request_generation` returns a frozen local handoff; it does not submit or approve generation. The local agent supplies the reviewed MP4's `sourceFile` and optional local reference paths to `node scripts/workflow-handoff.mjs` on stdin. The helper verifies the reviewed SHA-256, reads only files inside the local runs directory, and prepares the loopback approval screen.
6. Record `link_local_approval` with the returned proposal ID and source hash. Studio can now link to the local approval page. A person reviews the exact animation, reference images, prompt and output quality there, then explicitly clicks **Approve and submit one paid job**. Agents must never click/POST that approval without explicit user authorization for that experiment. Auto-generated references are disabled. Provider pricing controls the final charge; no currency spending cap is enforced.
7. The local approval route freezes inputs before making a single submission through the existing fal adapter. Duplicate approval cannot submit twice. Unknown outcomes remain uncertain across restarts; inspect provider history instead of resubmitting. Poll/resume the existing job separately.
8. The agent reads the local proposal/job receipt, records `record_submission` in Studio, and uploads the completed result. Source/result comparison uses one timeline, Split/Blend/Dual and alignment controls. The upload is a caller-reported receipt, not independent provider attestation. Never substitute an older unrelated result as a new generation.

## Protocol

Browser tools in Studio: read render workflows, workflow action, refresh render workflows. The hosted MCP adds list render workflows and render workflow action. Inputs are validated server-side and owner-scoped. Updates use revision comparison to reject stale concurrent changes. A changed source invalidates render review; after a generation handoff, start a new workflow to change the animation.

Only local Node routes submit generation. Cloud workflow actions have no approve/submit operation, and hosted tool execution never reads macOS Keychain. The addon uses the desktop execution API; no second project interface is maintained.

## Local verification

Run `node --test tests/workflow.test.mjs` with Node 22+ and localhost test access. It tests frozen inputs, duplicate approval, source mutation, restart/unknown-submit behavior and the actual approval HTTP route with a mocked provider through paired result storage. Studio has `tests/workflow-contract.test.ts` plus a loopback-only `tests/render-http.mjs`; it generates synthetic ffmpeg media. No live provider call is a test.
