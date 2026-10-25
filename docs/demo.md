# Demo

**Blackblend is building a workspace for agent-assisted physical design. Product visualization is the first working application.** Show the opportunity through that application, using the existing release and results.

## Story

Physical AI needs usable digital models of products, machines and environments. Preparing and updating those models involves specialist work. Blackblend explores how agents can help people inspect, revise and reuse assemblies, beginning with visual explanations.

The first customer hypothesis is a design studio or engineering team with an existing assembly and a product to explain. The proposed business combines workspace subscriptions, separately priced execution and scoped expert support. Pilot projects must establish demand, time saved, correction effort and total cost per accepted deliverable.

Agentic CAD is the authoring direction; richer assemblies can support later engineering and digital-twin workflows. Simulation, robot control and connected twins need additional capabilities and validation. The demo proves the current visualization workflow.

## Walkthrough: about 2½ minutes

| Time | Show | Explain |
| --- | --- | --- |
| 0–20s | Existing woodshed source/result comparison | The physical-AI opportunity begins with digital models people and agents can use. Blackblend starts with inspecting, editing and explaining an assembly. |
| 20–40s | Inspect and isolate parts; show the complete model | A design or engineering team already has geometry. Turning it into a useful explanation involves preparation, motion and review. |
| 40–70s | Existing chat proposal; Preview, Apply and Undo if the saved result is available | Supported changes are inspectable and reversible. The native window result demonstrates a bounded Blender edit. General authoring remains on the roadmap. |
| 70–95s | Scrub explosion/reassembly and show the source animation in Finish | The user directs the camera and motion. An MP4 rendered in Blender can also enter here. Show browser export only if rehearsed. |
| 95–115s | Existing generated result; Split and Breathe | The AI treatment can change parts or motion. Compare it against the source. This is an existing result; no paid request is needed. |
| 115–135s | PTZ/combine comparison, then the same project | The customer hypothesis is repeated work from existing assemblies. Explain subscription, execution usage and scoped expert services; commercial billing is not enabled. |
| 135–150s | Product/roadmap page | Next: broader agent editing and dependable revisions, then engineering reuse and simulation-ready assets. The current prototype demonstrates the first application. |

The existing [YouTube video](https://www.youtube.com/watch?v=-E_kNycUh-M) remains a fallback until a replacement has been recorded, uploaded and checked. The silent comparison reel supports the walkthrough; it is not a recording of the UI.

## Recording boundaries

- Use existing scenes, proposals and generated footage. Do not submit chat or paid jobs during recording or rehearsal.
- Rehearse saved Preview, Apply and Undo before recording; if the saved result is unavailable, describe the supported operation without staging a new success.
- Check assembled first/last poses, wall orientation, clipping and constant camera distance if exporting again.
- Keep private files, account settings, keys, provider URLs and billing details off screen.
- Keep the stack explanation brief. The [architecture guide](architecture.md) covers implementation; the [product guide](product.md) separates current capabilities from the roadmap.

## Release checklist

- Run `npm run typecheck`, `npm test`, `npm run build` and `npm run check:dependencies`. Check GitHub CI on the exact commit.
- After an authorized deployment, compare local and hosted `/api/version`. Building alone does not update the site.
- Verify sign-in, access to the operator's model and public example videos. A signed-in browser test is not a test of a new judge's account.
- Rehearse Preview, Apply, Undo, animation export and comparison using existing results. Check that refreshing a completed or uncertain job never submits it again.
- Keep private CAD, photos, keys, project data and run records out of public source. Check the public source link and live demo from the judge's access path.
- Disclose pre-existing woodshed/PTZ/combine assets, earlier experiments, AI assistance, third-party code and Clerk integration. Distinguish software built during the event from earlier input assets.
- Review the Devpost text, thumbnail, video and rules before accepting terms and submitting. The documented deadline is **25 October 2026, 11:59 PM Eastern**; confirm the registered portal before submission.

## Submission source

This snapshot follows the reviewed release recorded in `SUBMISSION-SOURCE.json`. Private geometry and job records remain excluded. The demo script leads with the physical-AI opportunity and demonstrates the existing visualization workflow. Recording and rehearsal need no new paid generation.
