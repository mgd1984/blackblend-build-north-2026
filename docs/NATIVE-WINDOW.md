# Native window milestone

The local Studio can create a candidate window opening in the authored woodshed. The operation runs static Python in a separate Blender 5.1 background process against a saved private snapshot. No generated code runs, and the live Blender session and original snapshot are untouched.

The tool accepts an authored wall ID, opening width/height, sill height and horizontal offset in source-local metres. It subtracts a cutter from the wall's meshes, checks removed volume and nine rays through the clear opening, adds visualization trim, then exports a new `.blend` and assembled GLB with the original assembly IDs. Browser transforms, camera and choreography remain separate and are retained in the scene document. Engineering adequacy of the changed framing is not verified.

Geometry revisions are private immutable candidates in ignored `runs/scene-assets/revisions/<uuid>/`. Scene documents reference the UUID; Apply/Undo switches the reference. Fixed artifact routes serve the model, native file and verification report with loopback host/origin checks. A missing revision must fail rather than display the original geometry as if it were edited.

Local Studio retains its background Blender executor. The hosted implementation uses pinned offline Blender in OpenAI hosted shell and private R2 revision artifacts. The operator-only deployment is enabled; its full browser submission remains an operator test. See [hosted native geometry](HOSTED-BLENDER.md). The source snapshot must be `runs/scene-assets/woodshed-before-browser-export.blend`; re-export if assembly names drift. `BLENDER_PATH` can select an explicitly installed compatible executable.

Verified on the private woodshed with Blender 5.1: the initial test removed approximately 0.0398 cubic source units across 27 intersecting meshes and passed nine clear-opening ray checks. Source dimensions are not independently measured. Tests use mocked model requests; no video generation is needed to test geometry.

The cutter rejects overlap with existing glazing or a prior Blackblend opening before changing meshes. The suggested rear-wall offset is +0.85 m to preserve its existing window. Nine-ray clearance verifies an opening, not a structural framing design.

The wall plane is recovered from native mesh faces, including baked rotations. Four trim members are seated with exterior surface raycasts. Run the synthetic regression with `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tests/native-window.blender.py`. It checks a rotated wall, rejected overlap, retained glazing, opening clearance, trim contact and the exported native part ID.
