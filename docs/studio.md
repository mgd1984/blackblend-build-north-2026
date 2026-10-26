# Studio

Studio has two work areas: **Animate** for the model and its motion, and **Finish** for video direction, generation and comparison. **Library** opens saved takes.

## Edit and animate

The chat box and playback controls float over the canvas. The right sidebar holds **Parts**, **Chat** and **Scene**. It can collapse; on small screens it sits over the canvas. Save, Undo/Redo and Render previs are at its bottom. Inspection tools sit on the left.

Ask for a supported edit, inspect the proposed change, then choose **Preview**, **Apply** or **Dismiss**. A reply without an actual change says “No scene changes” and offers no Apply button. Sending chat uses the configured OpenAI API account.

Saving while signed in writes your scene settings to your private account. The browser also keeps a draft and up to 30 Undo/Redo entries, limited to 500 KB per stack. Earlier history that was never saved cannot be recovered.

### Parts

The eye button shows or hides a part or section. The isolate button shows just that selection. **Exit isolate**, or clicking the active isolate button again, restores the previous visibility, including anything already hidden.

Switching the isolated selection keeps the original restore point. Manual visibility changes, Undo/Redo or loading a scene leave isolate mode. Section actions affect all its parts even when search hides rows. A partial count shows mixed visibility; **Show all** reveals every part.

Visibility changes can be undone, saved and used in exported video. The temporary isolation restore point lasts only for the current workspace session. Isolation leaves the camera in place; frame the selection separately if needed.

### Camera

Open **View controls** on the left toolbar:

| Control | Effect |
| --- | --- |
| Perspective / Orthographic | Switch between a camera-like view and a view without perspective foreshortening; keep the apparent model size |
| Standard views / ISO | Look along a model axis or from an isometric angle |
| Frame all / Frame selection | Fit visible geometry or the selected part at the current animation time |
| Fit animation | Fit the whole explosion and orbit once, keeping camera distance fixed during playback and export |
| Field of view / Visible height | Adjust the perspective lens or orthographic viewing area |
| Reset view | Restore the camera from when the example was opened |
| Material / Wireframe | Switch between materials and white surfaces with black feature edges |
| Show hidden edges | Reveal internal lines in wireframe |

Drag to orbit; Shift-drag or right-drag to pan; scroll to zoom toward the pointer. Middle-drag orbits and Shift-middle-drag pans. Pan mode makes ordinary dragging pan. Double-click frames the selected part, or all visible parts if none is selected. The floor hides when inspecting underneath the model.

With the canvas focused: **1** front, **3** right, **7** top; hold Ctrl for the opposite view. **5** switches projection, **F** or numpad decimal frames the selection, and **Home** frames all. Typing in chat does not trigger these shortcuts.

The **XYZ** control follows the camera. Click an axis for that view; click an aligned axis again to reverse it. **ISO** changes orientation while keeping the framing. These controls are omitted from exported images and video.

**Fit animation** checks assembled and fully separated part bounds, allows for the full orbit and fits both the current canvas and a 16:9 export. It does not zoom each frame. Refit after changing the geometry, visibility, separation, lens, elevation or canvas shape. Oversized scenes show an error rather than accepting a clipped view.

Preview, Apply, Undo and sidebar resizing keep the saved camera. Material/projection changes keep the paused animation position. Wireframe restores the original materials when switched off; its setting is saved with scenes/takes and used in video export. X-ray is an inspection setting.

## Export and finish

**Render previs** exports frames at fixed animation times, including the assembled first and last poses. Supported browsers produce an H.264 MP4 without a cloud encoder or a Mac. If the browser cannot encode H.264, it offers WebM; local development can convert that with ffmpeg. Encoding failures are shown and never start a paid request.

The exported take keeps the scene and camera settings used to create it. You can also choose **Start with… → Import Blender animation** to use a rendered MP4.

A new source opens appearance instructions on **Source**. **Prepare video** saves the source and instructions, then opens generation controls in Finish. It does not submit to fal. Add reference images, select quality and check the priced confirmation before generating. [Setup](setup.md#paid-jobs-and-recovery) explains costs and interrupted jobs.

Existing examples, saved takes, job status and comparison open without a chat box. **New treatment** or **New take** opens an appropriate draft. Switching sidebar tabs keeps that draft; Cancel discards it. A new take needs its own source animation.

### Compare

Use **Split reveal**, **Blend**, **Side by side** or **Breathe** to inspect both videos. Breathe fades between them. Playback speed, result timing offset and source scale/position are in the Compare tab and saved for that pair. Fullscreen brings the controls into the viewer. Compare hides the direction box while keeping its draft.

Generated footage may alter geometry, framing or motion. Alignment controls help inspection; they do not repair those changes.

## Examples

**Start with…** offers the woodshed, Massey-Harris 21 and PTZ rig when their private model files are available. **Watch the finished example** opens the matching published comparison without buying another generation.

| Example | Included geometry | Preparation |
| --- | --- | --- |
| Woodshed | 23 assembly groups from the existing Blender scene | `scripts/export-studio-scene.py` |
| Massey-Harris 21 | 7 assemblies and 996 meshes from the R03 GLB | `node --experimental-strip-types scripts/prepare-massey-example.mjs INPUT.glb` |
| PTZ rig | 91 components, 294 meshes and 7 sections from V0.10.1 exports | `node --experimental-strip-types scripts/prepare-ptz-example.mjs SOURCE_DIRECTORY` |

The combine sections are running gear, canvas header, separator, grain handling, process internals, operator station and power/drives. Its R04 source and existing barn-treatment pair run 12 seconds at 24 fps. The PTZ groups small fasteners and electronics for inspection. Browser materials and animation simplify the original presentations.

Models, scene settings and source hashes stay under ignored `runs/scene-assets/`. Hosted access requires separately uploading the approved files to private R2 and allowing the account. Saving local settings does not upload the model. Only selected demonstration videos are public.

These are visualization models with assumed dimensions. Browser materials simplify Blender materials. Photos can guide rough proposals; reliable reconstruction and hidden-part accuracy have not been established.

## The window tool

With explicit approval for paid compute, ask: “Cut a real window in the rear wall, 0.8 m wide and 0.7 m high, sill 1 m, offset +0.85 m.” Preview before applying. Undo restores the previous model; the opening stays with its wall during explosion and reassembly. The Blender file can be downloaded before or after Apply.

This tool supports rectangular cuts in the woodshed. Filling openings, maze cuts and arbitrary mesh edits are unsupported. It adds visual trim, not verified structural framing. See [Blender](blender.md) for execution, checks and recovery.
