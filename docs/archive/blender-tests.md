> Historical note. Start with the [current guides](../../README.md#docs). Dates, plans and test results below describe the earlier work.

# Hosted native geometry

22 October 2026. The hosted implementation uses OpenAI's hosted shell. Cloudflare Containers has been removed from the deployment target; no Workers Paid subscription is required by this execution path. The prior deployed Studio completed an explicitly authorized browser-to-container woodshed window edit, with candidate review and native revision Apply/Undo/Redo. Access remains restricted to the verified operator account. Arbitrary agent-authored Blender scripts and general scene creation remain proposed.

## One Studio, one agent

Sol runs through the existing Agents SDK and calls `cut_window`. Studio admits an owner-scoped D1 native job, uploads private input to an OpenAI container, and submits a background Responses request to execute the fixed Blender tool. The executor uses Sol with hosted shell because command execution in this environment is model-mediated. It is one bounded execution request underneath the Studio agent, with no second conversation or alternative app.

The reviewed tool cuts the opening and exports an editable `.blend`, GLB and verification report. Studio validates the output and persists it in private R2. Existing Preview, Apply and Undo switch the candidate geometry revision. The deployed path has no Mac connection, tunnel, filesystem mount or desktop key access.

## Runtime and execution

- Blender 5.1.0 Linux x64 and its native libraries are packaged offline. The original Blender archive is checksum-pinned in `infra/blender/Dockerfile`; the released offline bundle is independently checksum-pinned in `apps/studio/lib/openai-blender.ts`.
- The runtime is uploaded once with purpose `user_data` as a private OpenAI File. New containers attach that file. CAD and credentials are absent from it. Containers have network access explicitly disabled, including package downloads.
- `scripts/package-openai-blender.py` packages the four reviewed source files. Provision that archive at the fixed private R2 key `scene-tools/blender-window-v1.zip`, with its SHA-256 in server configuration. No generated Python or customer-selected shell command is accepted.
- Each request uploads its frozen source packet and the small tool archive. The fixed command checks both bundle hashes before extraction. Blender runs with `--disable-autoexec`, a 120-second process deadline and the existing bounded dimensions.
- OpenAI limits container file counts. The expanded Blender runtime is removed in a `finally` block before shell returns, retaining only the uploaded archive and bounded job artifacts. The first live probe hit this limit after expansion; its candidate was not recovered. Do not count that probe as a verified native result.
- The shell model sees the fixed command and input paths, not the customer's prompt or scene document. Returned shell activity must match the exact command and confirm exit zero. An exclusive execution marker prevents repeating the fixed command in the same container.
- OpenAI API credentials remain in the Worker, outside the container. The 4 GiB container expires after 20 minutes of inactivity. Successful jobs request container deletion after private output persistence; failed/uncertain jobs retain their recorded IDs for reconciliation and expire automatically.
- The operator allowlist, activation flag, one active/uncertain job per owner and rolling daily limit remain enforced. Default admission is ten native edits per day, configurable from one to twenty. These are application limits, not a provider-enforced dollar budget.

## Durable recovery

D1 records the container ID, response ID, exact execution command and reported token usage in `provider_receipt`. The background execution can finish after an HTTP observer disconnects. Recovery reads that same response and downloads its existing output; it never creates a replacement response or container. Ambiguous submission without a saved response ID requires operator reconciliation.

If the final chat turn is interrupted, the existing request status can recover a verified native candidate at the original base revision. It labels this recovery and preserves human Apply. It does not invent the missing assistant's final message or run another model request.

Background execution uses stored Responses state for recovery. This differs from the main scene agent's `store:false`; apply the project's OpenAI retention requirements before broadening access. Container deletion and Responses retention are separate lifecycle controls. The released runtime File is retained for subsequent jobs and can be removed explicitly when retired.

Output lengths, SHA-256 hashes, GLB/native signatures, Blender version, selected wall, nine-ray opening clearance, four trim contacts and preservation of existing glazing are validated before publication. These are visualization edits; they do not supply engineered framing or structural certification.

## Deployment checkpoint

The initial operator Worker deployment was version `fac2351d-c39f-4aad-964e-6d8c45647046` at https://blackblend-studio.mgd1984.workers.dev/studio. D1 migrations through 0007 were applied, the private source/tool R2 objects matched their local hashes, and server secrets were configured. Admission was restricted to the verified Clerk operator with a two-edit rolling daily cap. Anonymous agent POSTs and native downloads returned 401; the private example returned 404 anonymously. No Cloudflare plan change, fal key or commercial billing activation was performed.

A later, separately authorized browser submission completed the woodshed window edit in 47.5 seconds. Studio displayed the candidate and the applied native opening. Undo restored the original geometry, and Redo restored the same candidate without another provider call. The container was deleted after persistence. This established the signed-in browser-to-container path for this bounded operation; live cross-account access and interrupted-request recovery were not exercised by that run.

The test found camera auto-fit changing the saved radius. Fix `cfa644d` removed automatic fitting on geometry loads and viewport resize. A browser replay of the existing source and candidate verified identical camera values through Preview, Back to current, Apply, Undo, Redo and sidebar resizing with zero additional inference calls. The fix was deployed as Worker version `356281dc-d5c1-4157-908b-9d2b5aeda0de`; the signed-in Studio restored the existing applied geometry after refresh. This is the prior verified deployment, not a claim about the consolidated baseline version. Its exact commit, CI and deployment alignment belong in [the baseline record](../demo.md).

## Activation recipe

1. Pass the existing dependency release gate. Local functional tests do not waive inherited advisories.
2. Apply additive D1 migrations through `0007_openai_native_receipts.sql` to the intended deployment. Preserve existing project data.
3. Provision the reviewed source under private R2 keys `scene-assets/woodshed-source.blend`, `scene-assets/woodshed.glb` and `scene-assets/woodshed.json`. Inspect existing objects before replacing them. Local revisions are not uploaded automatically.
4. Provision the reviewed tool archive and retain its SHA-256. Upload the offline runtime once with purpose `user_data` through OpenAI's Files API; retain the returned File ID privately. The runtime file's uploaded name is `runtime.tar.xz`.
5. Reuse the authorized Blackblend OpenAI key as a server-only Worker secret through a private pipe. Configure `OPENAI_BLENDER_RUNTIME_FILE_ID`, `NATIVE_TOOL_SHA256`, exact `AGENT_ALLOWED_OWNERS` and `NATIVE_ALLOWED_OWNERS`, then enable `NATIVE_GEOMETRY_ENABLED=true`. Missing configuration fails closed.
6. Deploy the existing Studio target and verify authentication, existing candidate access and revision review. Use saved artifacts for Preview/Apply/Undo regression checks. A new live edit requires explicit authorization for that experiment. Cross-account artifact denial and interrupted-request recovery need their own checks; retain the mocked coverage until those live cases are exercised. Keep video generation and commercial billing activation separate.

The owner-checked `/api/scene-geometry?id=<uuid>&kind=status` reads the existing native receipt summary. The fixed `model`, `blend`, `document` and `report` kinds serve only completed owned artifacts. No endpoint exposes arbitrary R2 keys or OpenAI resource credentials.

## Verification evidence

The same fixed tool has passed an actual private woodshed run in a local Linux/amd64 container with networking disabled: Blender 5.1.0, sixteen affected meshes, nine clear opening rays, four seated trim members and the existing window preserved. Local Docker establishes binary compatibility only; it is not OpenAI-hosted or deployed Studio evidence.

The corrected live OpenAI test used `openaiBlender` directly, including background Responses, durable resource checkpoints, fixed-command auditing and binary/hash validation. It produced the actual woodshed GLB and editable Blender file with all nine opening rays clear, four trim contacts and existing glazing preserved. Usage reported 2,112 input and 456 output tokens. The test container was deleted after verified download. The offline runtime File is provisioned for the deployed executor. Private execution receipts and artifacts remain in ignored local storage. This direct executor test is separate from the later signed-in browser test described above.

Contract tests cover disabled networking, command auditing, resource checkpoints, read-only resume, ambiguous POST protection, altered archives and output bounds. D1/R2 tests cover ownership, duplicate admission, private persistence, daily limits and recovery of a verified native candidate.

Sources: [OpenAI hosted shell](https://developers.openai.com/api/docs/guides/tools-shell), [background responses](https://developers.openai.com/api/docs/guides/background), [official Blender 5.1 archive](https://download.blender.org/release/Blender5.1/).

---

# Native window milestone

The local Studio can create a candidate window opening in the authored woodshed. The operation runs static Python in a separate Blender 5.1 background process against a saved private snapshot. No generated code runs, and the live Blender session and original snapshot are untouched.

The tool accepts an authored wall ID, opening width/height, sill height and horizontal offset in source-local metres. It subtracts a cutter from the wall's meshes, checks removed volume and nine rays through the clear opening, adds visualization trim, then exports a new `.blend` and assembled GLB with the original assembly IDs. Browser transforms, camera and choreography remain separate and are retained in the scene document. Engineering adequacy of the changed framing is not verified.

Geometry revisions are private immutable candidates in ignored `runs/scene-assets/revisions/<uuid>/`. Scene documents reference the UUID; Apply/Undo switches the reference. Fixed artifact routes serve the model, native file and verification report with loopback host/origin checks. A missing revision must fail rather than display the original geometry as if it were edited.

Local Studio retains its background Blender executor. The hosted implementation uses pinned offline Blender in OpenAI hosted shell and private R2 revision artifacts. The operator-only deployment is enabled; its full browser submission remains an operator test. See [hosted native geometry](../blender.md). The source snapshot must be `runs/scene-assets/woodshed-before-browser-export.blend`; re-export if assembly names drift. `BLENDER_PATH` can select an explicitly installed compatible executable.

Verified on the private woodshed with Blender 5.1: the initial test removed approximately 0.0398 cubic source units across 27 intersecting meshes and passed nine clear-opening ray checks. Source dimensions are not independently measured. Tests use mocked model requests; no video generation is needed to test geometry.

The cutter rejects overlap with existing glazing or a prior Blackblend opening before changing meshes. The suggested rear-wall offset is +0.85 m to preserve its existing window. Nine-ray clearance verifies an opening, not a structural framing design.

The wall plane is recovered from native mesh faces, including baked rotations. Four trim members are seated with exterior surface raycasts. Run the synthetic regression with `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tests/native-window.blender.py`. It checks a rotated wall, rejected overlap, retained glazing, opening clearance, trim contact and the exported native part ID.
