# Hackathon MVP checkpoint

Target: the Build North submission deadline, 25 October 2026 at 11:59 PM Eastern. The current integration source was merged on 24 October; this copy is a submission snapshot.

## The demo we are finishing

Open the woodshed in one Studio, inspect its component geometry, review an agent-proposed change, animate the assembly, and compare a rendered source with its appearance treatment. The editable source and reviewed output belong to the same project.

Use the existing successful native edit and completed video for rehearsal and recording. Another inference request requires its own spending approval. A prepared generation is a frozen proposal; it is not a submitted or paid job.

## Release checks

PR #21 was merged into `main` at `f39f985` and deployed on 22 October. Its review repair adds cookie-origin enforcement for private MCP tools, input-bound project retries, bounded request streams and complete native migration metadata.

| Check | Evidence / acceptance |
| --- | --- |
| Account boundary | HTTP regressions reject missing identity and foreign origins; valid bearer MCP remains supported. Existing Clerk signature tests cover issuer, expiry, session and authorized party. |
| Project safety | Real SQLite tests cover normalized retries, changed-input 409s, owner isolation, scene save conflicts and valid media uploads. |
| Upload limits | Unknown and understated lengths stop during streaming, cancel the reader and return 413; UTF-8 byte limits apply before parsing. |
| Database baseline | Journal covers all eight SQL files. Native snapshots reproduce 0006/0007; the final snapshot generates no further schema changes. Tests use disposable in-memory databases. |
| Build gate | Run root `npm run typecheck`, `npm test`, `npm run build`, `npm run check:dependencies`; require green GitHub checks on the exact candidate commit. |
| Release identity | After authorized deployment, compare `/api/version` with the approved commit. A passing build does not update the hosted app. |

## Final rehearsal

1. Open the deployed `/studio` in a fresh browser session. Check the public example and sign-in entry before using the operator account. Confirm that a judge can see the published comparison without private project access.
2. On the operator account, load the saved woodshed and existing native candidate. Preview, Apply and Undo it. Check that the camera stays fixed and the opening is actual geometry. Retain the original scene.
3. Play the complete choreography. Check assembled start/end, wall orientation, framing and clipping. Capture a browser previs and reopen it in Review; verify duration and playback.
4. Open the existing completed generation in the same project. Inspect the source/result slider, blend and timing. Explain any geometry/motion differences honestly.
5. Inspect a prepared generation's frozen source, references, prompt and quality. Stop at approval during rehearsal. Reopening or refreshing a completed/uncertain job must never submit another job.
6. Record the short walkthrough and keep its file plus the working source. Use it as the fallback if sign-in or a provider is unavailable during judging.

These browser steps are acceptance criteria, not claims that a fresh external judge session has passed. Local browser checks and mocked provider tests do not establish deployed behavior.

## Remaining release work

- Baseline merge, deployment and migrations through `0007_openai_native_receipts.sql` are verified. Earlier branches and drafts remain preserved. Keep subsequent deployment identities aligned with `/api/version`.
- Operator fal access is now configured with a one-job rolling daily cap; rehearse its approval boundary without submitting a paid job.
- Complete the recording, Devpost text, repository/demo links and event-required materials. Check them from the judge's access path.

## Scope through submission

Keep the current Studio and woodshed workflow stable. General Blender scripting, reliable photo-to-CAD reconstruction, customer billing activation and new hosting infrastructure remain subsequent work. The native tool is a bounded window operation; commercial billing is inactive and hosted inference is operator-restricted. Describe those boundaries in the submission and show the working slice.
