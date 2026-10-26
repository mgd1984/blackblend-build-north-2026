# Blender

Blender is the native modeling and animation engine behind Blackblend’s agentic CAD direction. The hosted prototype takes a geometry change through execution, export and review, preserving editable source files and reversible revisions.

## Current operation

The first supported operation creates a rectangular opening in the woodshed and returns an updated model for Preview, Apply and Undo. Broader scripted scene authoring is the next step.

## How the hosted tool works

1. Sol, running through the existing Agents SDK, calls `cut_window` with a wall and measurements.
2. The server checks the account and limits, saves a D1 job record and copies the selected source into a temporary OpenAI container.
3. A background Responses request tells hosted shell to run the fixed, reviewed command. This uses a model request because hosted shell execution is model-directed. The customer's prompt and scene document are not sent to that shell model.
4. Offline Blender 5.1 opens the copied scene, cuts the opening and exports a `.blend`, GLB and check report.
5. The server checks the results and saves them privately in R2 before requesting container deletion. Studio can preview and apply that model, or restore the original with Undo, without running Blender again.

This path runs without a Mac connection, tunnel, filesystem mount or access to desktop keys. Hosted access is limited to approved accounts. [Architecture](architecture.md) explains how it fits into Studio.

## What the tool checks

The inputs are a known wall ID, opening width/height, sill height and horizontal offset in source-local metres. The tool rejects overlap with an existing window or an earlier Blackblend opening before changing meshes.

It finds the wall surface from mesh faces, including walls whose rotation is already built into their mesh. It cuts intersecting wall meshes, checks removed volume and sends nine rays through the opening to check clearance. Four trim pieces must touch the exterior surface. Existing window glass and assembly IDs must be preserved.

Before making results available, the server checks output sizes, SHA-256 hashes, file signatures, Blender version, wall ID, clear rays, trim contact and retained glass. These checks establish that the intended visualization edit occurred. Load-bearing framing, weatherproofing, measured dimensions and construction suitability need separate engineering review.

Browser part changes, camera settings and animation remain in the scene document. The new opening follows its wall during explosion and reassembly. A missing saved model must show an error rather than silently displaying the original.

## Runtime and limits

- Blender 5.1.0 Linux x64 and its libraries are packaged in advance. The original archive checksum is in `infra/blender/Dockerfile`; the offline bundle checksum is in `apps/studio/lib/openai-blender.ts`.
- Upload the runtime once as a private OpenAI File with purpose `user_data`. New containers attach it as `runtime.tar.xz`. It contains no CAD or credentials. Network access, including package downloads, is disabled in the container.
- `scripts/package-openai-blender.py` packages four reviewed source files. Store the archive at private R2 key `scene-tools/blender-window-v1.zip` and keep its SHA-256 in server configuration.
- Each job uploads the selected source and tool archive. The fixed command checks both archive hashes, runs Blender with `--disable-autoexec` and enforces a 120-second process deadline. Inputs must pass the tool's dimension limits.
- The reported shell command must match exactly and exit successfully. An exclusive marker prevents it running twice in the same container. Customer-selected commands and generated Python are rejected.
- The expanded runtime is removed before shell returns, including on failure, to stay within OpenAI's container file limit.
- The 4 GiB container expires after 20 minutes of inactivity. Completed jobs request deletion after results are safely saved. Failed or uncertain jobs keep their resource IDs for investigation and expire automatically. The reusable runtime File remains until explicitly retired.
- Worker API keys never enter the container. Account allowlists, an enable flag, one active/uncertain job per user and a rolling daily limit remain required. These count jobs, not dollars. Settings are listed in [setup](setup.md#keys-and-settings).

## Recover an interrupted job

D1's `provider_receipt` stores the container ID, response ID, exact command and reported token usage. A background execution can continue after the browser disconnects. Recovery reads that same response and downloads its existing result; it never starts a replacement container or request.

If no response ID was saved, investigate the unknown outcome before doing anything billable again. If the final chat reply was lost but a checked model exists, the app can recover it at the original scene version and still require Apply. It labels the recovery and does not invent an assistant reply or make another model request.

This executor keeps the background response for recovery. Main scene chat uses `store:false`; SDK traces are separate again. Container deletion does not remove stored Responses. Review OpenAI retention requirements before extending access beyond the current operator setup.

`/api/scene-geometry?id=<uuid>&kind=status` returns the signed-in owner's saved job status. The fixed `model`, `blend`, `document` and `report` kinds serve only completed files belonging to that user. Callers cannot select arbitrary R2 keys or read credentials.

## Local execution

Local Studio runs the same reviewed Python in a separate Blender 5.1 process against `runs/scene-assets/woodshed-before-browser-export.blend`. It preserves the live Blender session and source snapshot. Re-export if assembly names change. `BLENDER_PATH` can select a compatible installed executable.

New files live under ignored `runs/scene-assets/revisions/<uuid>/`. The scene records that UUID; Apply/Undo changes which saved model it displays. Local routes check the loopback host and origin. Saving the local scene does not upload its geometry to hosted Studio.

Run the synthetic check with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tests/native-window.blender.py
```

It covers a rotated wall, overlap rejection, retained glass, clear opening, trim contact and exported part ID. Tests use mocked model calls; video generation is unnecessary.

## Set up another deployment

1. Pass dependency and code checks. Apply migrations through `0007_openai_native_receipts.sql` to the intended database, preserving existing data.
2. With explicit approval, upload the reviewed source to `scene-assets/woodshed-source.blend`, `scene-assets/woodshed.glb` and `scene-assets/woodshed.json`. Check existing objects before replacing them; local versions do not upload automatically.
3. Upload the reviewed tool archive and offline runtime. Record their hash and OpenAI File ID privately.
4. Set server-only `OPENAI_API_KEY`, `OPENAI_BLENDER_RUNTIME_FILE_ID`, `NATIVE_TOOL_SHA256`, `AGENT_ALLOWED_OWNERS`, `NATIVE_ALLOWED_OWNERS` and `NATIVE_GEOMETRY_ENABLED=true`. Missing configuration blocks execution.
5. Deploy and check sign-in, file ownership and access to existing results. Reuse saved files for Preview/Apply/Undo tests. A new paid edit needs explicit approval for that experiment.

Video access and customer billing are configured separately.

## Verification

Mocked tests cover ownership, limits, duplicate starts, interrupted replies, disabled networking, command/hash checks and output validation. Native fixture tests cover the opening, trim and exported part identity. Browser checks with a saved hosted result covered Preview, Apply, Undo and stable camera framing.

These checks validate a visualization edit. They do not establish structural suitability or fabrication accuracy.

Reference docs: [hosted shell](https://developers.openai.com/api/docs/guides/tools-shell), [background Responses](https://developers.openai.com/api/docs/guides/background), [Blender 5.1 downloads](https://download.blender.org/release/Blender5.1/).
