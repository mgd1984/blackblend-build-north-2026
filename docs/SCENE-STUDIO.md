# Interactive Scene Studio

Scene Studio brings the editable woodshed, assembly tree, choreography, chat, render review and comparison into the same application. Hosted native editing is a restricted operator preview.

**Start with…** offers the Woodshed, Massey-Harris 21 and PTZ camera rig when their private source exports are provisioned. The local PTZ example retains all 294 V0.10.1 native meshes in 91 selectable components across seven sections; small fasteners and electronics details are grouped for inspection. Its browser materials and explode choreography simplify the original presentation. **Watch the finished example** opens the corresponding existing video comparison, including the calibrated PTZ pair. No generation is needed to explore these examples. Private models remain under ignored `runs/scene-assets`; adding a local example does not provision its geometry on the hosted deployment.

## Try it

1. Start Studio with `npm run dev` and open `/studio`.
2. Inspect the woodshed on the canvas. The expanding prompt composer and playback float at the bottom of the canvas. One collapsible right sidebar has Parts, Chat and Scene tabs: assembly and saved scenes; conversation and proposals; camera, duration, background, separation and selected-part controls. Save, Undo/Redo and Render previs stay at the bottom of the sidebar. Canvas inspection tools sit on the left. On narrow screens the sidebar overlays the canvas.
3. Ask the scene agent for an edit. Replies with actual scene changes offer Preview, Apply or Dismiss and show the changed parts/settings. Clarifications and unsupported requests say “No scene changes” and have no Apply action. Sending a message uses the configured OpenAI API account.
4. Save the scene while signed in. Saved scene documents use owner-scoped D1 records with version checks. The browser also retains a local draft.
5. Render previs encodes the browser scene directly to a finalized H.264 MP4 when the browser supports WebCodecs AVC. It samples each frame at an explicit animation time, including assembled start/end poses, rather than recording wall-clock playback. Review the clip before saving it as a project take; its scene document is retained with the take.
6. Add appearance references and prepare hosted generation when operator access is configured. Studio freezes the reviewed inputs; a person checks the charge consent and approves the job in the project. Status and result comparison stay there. Preparing never submits generation. Native Blender jobs keep their selected desktop approval and receipt path. See [hosted generation](HOSTED-GENERATION.md).

In Parts, each part and section has an isolate control beside its visibility eye. Isolate shows only that component or section; selecting another isolate target keeps the original visibility snapshot. **Exit isolate** (or clicking the active isolate control again) restores that snapshot, including parts that were already hidden. The canvas toolbar also isolates the selected part. Isolation preserves the camera; use Focus separately to reframe. Manual visibility changes, Undo/Redo or loading a scene leave isolate mode. A dash and visible/total count indicate mixed visibility. **Show all** reveals every part. Section actions include every member even when search narrows the list. Visibility changes are undoable, saved with the scene and used by previs renders; the temporary isolate label and restore snapshot last for the current workspace session.

## Navigate the model

The left canvas toolbar's **View controls** opens camera settings without taking space from the model. Choose perspective or orthographic projection, seven axis/isometric views, Frame all or Frame selection. Perspective has a field-of-view slider; orthographic shows the visible height. Switching projection preserves apparent size. Reset view restores the camera from when the current example was opened.

Drag to orbit; Shift-drag or right-drag to pan. Middle-drag also orbits, Shift-middle-drag pans, and scrolling zooms toward the pointer. Pan mode makes ordinary dragging pan without selecting parts. The camera can orbit underneath the model; the floor hides for underside inspection. Framing adjusts both the orbit target and distance using visible geometry. Double-click frames the selected part, or all visible parts if none is selected.

With the canvas focused: **1** front, **3** right, **7** top; hold Ctrl for the opposite view. **5** switches projection, **F** (or numpad decimal) frames the selection, and **Home** frames all. These shortcuts do not intercept typing in the composer. Views follow the model's authored axes.

**Fit animation** in View controls encloses every visible component from assembled to fully exploded, with room for the complete orbit. It fits once and retains one target, radius, lens and orthographic height for playback/export. The envelope uses cached source bounds and both translation endpoints; it never zooms per frame. It covers the current viewport and the 16:9 MP4. Refit after changing geometry, visible parts, separation, lens, elevation or viewport shape. Ordinary Frame all still fits the current pose. Extremely large scenes beyond the supported camera range show an error rather than accepting a clipped fit.

**Material / Wireframe** in View controls selects the presentation. Wireframe uses a white background/surface and black feature edges, suppressing coplanar triangulation for clear technical inspection. **Show hidden edges** reveals the internal lines. Switching back restores authored materials. Display/projection changes preserve the paused timeline pose. The presentation setting is undoable, retained with saved scenes/takes and used in previs export; X-ray remains an inspection control.

The **XYZ orientation gizmo** sits at the upper right of the canvas and follows both manual navigation and animated orbits. Click a labelled axis for its standard view; clicking an aligned axis again reverses it. **ISO** restores an isometric orientation while retaining framing. The gizmo stays outside viewport image/MP4 pixels.

Navigation settles smoothly and saves its pose with the scene. Resizing or collapsing the inspector does not refit it. Paused timeline scrubbing evaluates the same orbit as playback and export; orbiting a paused pose updates the underlying starting camera. Previs capture freezes the current camera into the same scene document retained with the take, including projection and lens settings. This is an inspection/navigation toolset; mesh editing, fly mode and Blender's complete navigation preferences remain outside it.

Undo/Redo history is retained with the browser draft across navigation and reloads, bounded to 30 entries and 500 KB per stack. This preserves future edits; history lost before this change cannot be reconstructed from the draft.

## One workspace layout

The work areas are **Animate → Finish**. The Library opens saved takes in Finish. Direction stays on the canvas; supporting controls live in a collapsible right sidebar. Tab panels retain drafts and pending job state when switching sections.

- **Animate:** floating chat composer and playback; Parts / Chat / Scene in the inspector. Start with opens imported Blender MP4s or an existing comparison example.
- **Finish, source preparation:** a freshly rendered or imported animation opens appearance direction on the Source tab. Existing comparison examples open without a composer; New treatment opens it explicitly. Compare hides the composer and retains its draft. Prepare video retains source and direction privately, then opens generation controls within Finish. It does not submit generation.
- **Finish, saved takes:** browsing, generation status and comparison have no composer by default. New take in Generate opens a separate direction draft; Create take creates a record requiring its own source animation. Switching to Takes or Compare hides that draft and returning to Generate restores it. Cancel discards it. Takes / Generate / Compare hold history, references, output quality, approval, status and media imports. Finish returns to the active saved take; a new animation returns it to source preparation.
- **Compare:** Split, Blend, Side by side, Breathe, timing and alignment share the Compare tab. Fullscreen brings its controls back onto the full-screen viewer.

Playback stays near the bottom of the canvas when no composer is present and moves above it during composition.

Generation still uses the existing frozen-input approval and single-submit path. Layout changes do not change account access, billing or submission behavior.

## Credentials

Run `npm run agent:key` to save the OpenAI key through a hidden prompt. It uses macOS Keychain service `blackblend.openai`, account `api-key`. A “Key saved” indicator confirms local presence, not provider validity. Chat uses the OpenAI Agents SDK with `gpt-6.1-sol`, backed by the Responses API. The SDK runs a bounded tool loop: inspect the scene, propose validated part/settings edits, or request a native window cut. No model-generated code executes. Tests mock Responses requests. Traces include run/tool timing and usage with sensitive model/tool content disabled; the proposal shows its model, token count and trace ID. `BLACKBLEND_AGENT_TRACING=off` disables hosted tracing. Scene-agent Responses use `store:false`; SDK traces are a separate export. The hosted Blender executor uses stored background Responses for recovery, as described in [hosted Blender](HOSTED-BLENDER.md).

fal and Tenstorrent keep their existing separate Keychain entries. Local keys remain in Keychain; hosted keys are Worker secrets. No key is returned to browser code. Clerk remains the application sign-in. ChatGPT subscription authentication is not integrated.

## Try the native window edit

With explicitly authorized compute in local Studio or an enabled hosted operator account, ask: “Cut a real window in the rear wall, 0.8 m wide and 0.7 m high, sill 1 m, offset +0.85 m.” Preview the candidate before Apply. Undo restores the previous model. The window remains part of its authored wall during explosion and reassembly. Download the candidate `.blend` before applying, or the current native revision from the assembly panel afterward.

The native operation cuts rectangular openings only. Filling an existing opening, maze-shaped cuts and arbitrary mesh edits are unsupported. A reply that leaves the scene unchanged is informational, even if its wording sounds like an edit succeeded.

Local Blender runs in a separate background process against the saved woodshed snapshot; hosted Blender runs in an isolated OpenAI container against a frozen copy. It cuts through intersecting wall meshes and checks that nine rays pass through the opening. This is a visualization opening with trim; load-bearing framing, weatherproofing and engineering drawings are outside this milestone. See [native window execution](NATIVE-WINDOW.md). Local native revisions remain on this host. Hosted revisions are owner-scoped private R2 artifacts. Saving a local scene document does not upload its geometry; do not assume local UUIDs exist in hosted Studio.

## Source and fidelity

### Massey-Harris 21 example

In Animate, choose **Start with… → Massey-Harris 21** to load seven source-derived assemblies: running gear, canvas header, separator, grain handling, process internals, operator station, and power/drives. Visibility, selection, bounded part edits, camera controls, explosion/reassembly and previs capture use the existing scene workflow. The shed-only native window tool is unavailable for this asset. Switching examples is undoable; the canonical Blender source stays outside this repository.

**Watch the finished example**, or select Massey-Harris 21 in Finish, opens the R04 native film paired with the owner's existing barn treatment. Both clips run 12 seconds at 24 fps; Split, Blend, Breathe and alignment controls use the existing comparison workflow. The generated framing and geometry still need review. An unrelated six-second image-guided clip that changes the machine is retained privately. This is a visualization reconstruction with assumed dimensions and schematic internals.

The private GLB and scene document are prepared with `node --experimental-strip-types scripts/prepare-massey-example.mjs INPUT.glb` from the preserved R03 assembled export. The script tags seven existing roots, preserves all 996 meshes and records source/derivative hashes under ignored `runs/scene-assets/`. Local Studio serves only fixed example filenames. Hosted model access uses the existing operator authorization and requires provisioning those assets in private R2; adding the local example does not provision or deploy them. Only the selected web video pair is public demonstration media.

The private woodshed export contains the existing Blender geometry in 23 named assembly groups. `scripts/export-studio-scene.py` exports an assembled GLB plus its scene document into ignored `runs/scene-assets/`. Source provenance and the recovery snapshot stay there too. Native scenes, photos and exports are not committed.

The browser simplifies native procedural materials. Source-derived means geometry came from the authored scene; it does not mean dimensions or structural performance have been verified. A new photo can guide a rough primitive scene proposal. Photo reconstruction quality and hidden geometry have not been validated.

The saved scene owns the camera pose. Preview, Back to current, Apply and Undo reload geometry without fitting the camera to model bounds. Sidebar resizing changes projection aspect only; it does not refit the camera. Deliberate orbit/zoom controls and camera proposals still change the view.

Explosion and camera motion use deterministic choreography with assembled start/end poses and a constant orbit radius. A generated treatment can still alter geometry or motion; compare it with the reviewed source.

## Local and hosted

The same Vite application supplies local development endpoints for Keychain access, the fixed private woodshed export, MP4 encoding and desktop approval preparation. These are loopback-only, token-protected development capabilities, not a second app or a publicly exposed service.

The hosted Studio has Clerk, project records, review, comparison and browser MP4 export. Without the private export it opens a labelled concept woodshed. Hosted scene-agent execution uses Worker secrets and an account allowlist; hosted video generation uses frozen human approval and durable job receipts. The native-window executor uses OpenAI hosted shell with the pinned offline Blender 5.1 runtime; Cloudflare Containers is absent. See [hosted Blender](HOSTED-BLENDER.md). Browser export needs no cloud encoder or Mac. If AVC encoding is unavailable, local Studio can convert its WebM fallback with ffmpeg; a hosted session offers that WebM as a download and explains the browser requirement. Builds and automated tests do not start paid generation.

The prior deployed checkpoint completed one explicitly authorized browser-to-container woodshed edit in 47.5 seconds, persisted the candidate and deleted its execution container. The opening was reviewed and applied, and Undo/Redo switched the native revisions without another provider run. Camera fix `cfa644d` was subsequently verified by replaying the existing candidate through Preview, Back, Apply, Undo, Redo and sidebar resizing; camera values stayed identical. That fix was deployed as Worker version `356281dc-d5c1-4157-908b-9d2b5aeda0de`. These are prior checkpoint results; the consolidated baseline has its own [verification and deployment record](BASELINE.md).

General agent-authored Blender scripts, arbitrary scene creation and iterative render inspection remain proposed. The released native executor accepts the reviewed window operation only.

Historical runs are never attached automatically. Only the selected proposal's matching source hash, project association and execution receipt are accepted. An uncertain paid submission is inspected, not resubmitted.

Browser encoding follows [Mediabunny’s CanvasSource and finalized MP4 output](https://mediabunny.dev/guide/writing-media-files). Export availability is checked at runtime; it is not inferred from a browser name. Codec initialization/encoding errors remain visible and never trigger a paid request.
