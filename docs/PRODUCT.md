# Blackblend direction

23 October 2026. This is the implementation north star, grounded in the owner's Devpost draft, “BlackBlend - Accelerated Product & Engineering Visualization.”

## The product

**Turn existing 3D assembly animations into AI-finished product films, with source and result reviewed together.**

A designer, engineer or agent directs a component scene in Studio. Chat proposes changes beside the interactive assembly; the person reviews them before applying. Blender supplies the detailed authoring path. Blackblend keeps the source scene, animation, appearance direction, reviewed takes and comparison together.

Primary audience: designers, engineers, agencies and product teams explaining physical products and assemblies. The first path starts with the editable woodshed or a rendered Blender MP4. Photo-guided model creation and broad CAD import are subsequent capabilities. Expert engagements can develop supplied CAD and drawings through Blender. The interactive flow is a working prototype with a restricted hosted execution path; reliable photo reconstruction and automatic drawing-to-CAD conversion remain unverified.

## What the user does

1. Open **Animate**. Inspect the existing woodshed; direct bounded edits beside it in chat. **Start with** also accepts an already-rendered Blender animation.
2. Review and apply changes, choreograph the assembly, then **Render previs** to enter **Finish**.
3. Set appearance direction. **Prepare video** saves the source privately within **Finish**. Add real reference images.
4. Inspect frozen inputs and explicitly approve a paid job in Studio, when hosted operator access is configured.
5. Follow status and compare the result against the native source in **Finish**. Revisit saved takes through **Library**, a storage utility rather than another workflow step.

The browser workflow freezes reviewed source and reference inputs and tracks one approved hosted job. Local Blender jobs retain their selected desktop approval/receipt path. The bounded native window operation runs in offline OpenAI-hosted Blender; broader scene scripting remains proposed. Generated video may alter parts, shape or motion; visual review does not certify engineering correctness.

## Current implementation

- One Studio application with public matched-video examples and signed-in project review.
- Interactive assembly editing, recoverable chat proposals, undo, deterministic choreography and browser MP4 capture; see [Scene Studio](SCENE-STUDIO.md) for boundaries.
- Clerk identities; owner-scoped D1 records and private R2 rendered media.
- Sol/Agents SDK scene proposals and owner-scoped hosted native window candidates, plus the local Blender preparation/render helper and addon.
- A desktop adapter for files, Keychain, approved provider jobs and local execution receipts.
- Source-hash review gates, frozen hosted approval inputs, durable single-submit claims and no automatic billable POST retry.
- Sandbox billing adapters, durable customer mappings, usage outbox and signed webhook inbox; external activation and commercial entitlement remain unconfigured.
- Synchronized comparison, including the calibrated PTZ pair.

There is one project ledger: D1. The internal `briefs` table is project metadata and `workflows` holds takes/stages; these names do not represent separate products. Local run records are execution receipts and cached media, not another project database. Historical run associations remain unchanged.

## Validation milestone: one complete product-film workflow

Use the existing woodshed assets to demonstrate one traceable project: editable source → reviewed proposal → animation → explicitly approved treatment → recorded result → comparison. Contract tests mock jobs; browser validation and deployment are separate. Only spend on a specifically authorized experiment.

Success means another person can understand and complete that flow without choosing an app, a database or a “bridge.” Improve that flow before adding deliverables or infrastructure.

## Subsequent tracks

- Repeatable production: scene preparation, reusable choreography, retained references and revision-linked outputs.
- More outputs: stills, technical illustrations, assembly guides and interactive viewers, each with its own acceptance criteria.
- Tenstorrent Blackhole investigation: identify available weights and rights; check operators, compiler support and memory; measure a working inference path before proposing an economics advantage. Porting fal's particular pipeline or post-training is unproven and may require unavailable weights or permissions.
- Connected twins and simulation: require appropriate engineering data, validation and maintained physical-world linkage. They remain research.

Software is the core product. Production assistance and engineering/design consulting are optional service levels around it. Prices, recurring demand and unit economics remain hypotheses. The hackathon demonstration should show a coherent working slice and label research honestly.

The submission scope, commercial hypothesis and sourced inference roadmap are in [the demo brief](HACKATHON-DEMO.md).
