# Product

Blackblend is building a workspace for agent-assisted physical design. People and agents work with the same digital assembly: inspecting parts, proposing changes and explaining how the product fits together. Product visualization is the first working workflow.

## The opportunity

Physical AI concerns systems that interact with the physical world. Useful digital models support that work: geometry, component relationships and, for simulation, physical properties and behavior. Preparing and maintaining those assets is a potential business opportunity for Blackblend.

The industry direction is concrete. [Autodesk Assistant](https://help.autodesk.com/view/fusion360/ENU/?contextId=LEARNINGPANEL) can inspect and edit Fusion designs. [NVIDIA's Omniverse tools](https://developer.nvidia.com/omniverse) support agent workflows for scene preparation, physics and simulation. These are adjacent platforms and potential competitors or integration paths; neither is integrated with Blackblend today.

Our hypothesis is that teams will pay to make existing 3D work easier to revise, review and reuse across disciplines. Product films provide an immediate application. Engineering review, assembly instructions and digital-twin preparation offer further applications to validate. Customer demand and time savings have not yet been established.

## First customers and value

Start with design studios and engineering teams that already have an assembly to explain. A product film or assembly explanation gives them a concrete deliverable and gives us a bounded workflow to improve.

The longer-term opportunity is repeat use of the same reviewed model: a product update, a technical sales explanation, an assembly procedure or preparation for simulation. This requires richer assembly information and reliable revision handling. The intended advantage is continuity across tasks and tools, with evidence of what changed and human review.

## The working workflow

1. **Animate:** inspect parts, ask for supported edits and choose camera and assembly motion.
2. **Render previs:** export a preview animation from the browser. A rendered Blender movie can also be imported directly.
3. **Finish:** add appearance instructions and reference images. Check the displayed cost before submitting a paid generation.
4. **Compare:** play the original and generated videos together. **Library** holds saved takes.

A take is a saved animation and its treatment. Keeping both makes it easier to revisit a choice or see where the generated video changed the product.

## What works today

- Woodshed, PTZ rig and combine examples, with private model access and published comparison videos.
- Part selection, hiding, isolation, camera controls, explosion and reassembly.
- Chat suggestions that can be previewed, applied or undone. A reply without a scene change has no Apply button.
- Browser video export, private projects and saved takes.
- A real rectangular window cut in the woodshed through Blender, including Preview, Apply and Undo.
- Video generation for approved accounts, with one cost confirmation and saved job status.

Clerk handles sign-in. The server checks that each private project, file and job belongs to the signed-in user. Customer billing is not enabled. Chat and paid tools consume the configured provider account's balance.

The browser can move parts, change settings and add simple shapes. The Blender tool cuts rectangular windows in the woodshed. General Blender scripting is a separate local experiment, excluded from this release. Generated video can change a part, a dimension or its motion. Comparison helps someone spot changes; it does not prove mechanical correctness. The example models contain assumed dimensions.

## Roadmap

| Stage | Useful outcome | Evidence needed before expanding |
| --- | --- | --- |
| Working prototype | Inspect, animate and compare an existing assembly | Complete a real customer brief; measure accepted results and corrections |
| Broader agent authoring | Prepare and revise more models through supported tools | Reliable imports, geometry checks, repeatable edits and recovery across revisions |
| Engineering reuse | Carry part identities and relationships into reviews and procedures | Reviewed dimensions, assembly relationships and dependable document updates |
| Physical-AI preparation | Exchange assets for simulation and digital-twin workflows | Format compatibility, physical properties, validated behavior and relevant physical-system data |

OpenUSD exchange, physics simulation, robot control, connected twins, reliable photo-to-CAD conversion and fabrication drawings are future work. Each requires its own validation; a visualization model alone is insufficient evidence.

## Business model

The proposed model combines a workspace subscription, separately priced execution and scoped expert design/engineering engagements. Customers pay for a useful workflow and accepted deliverables. Provider tokens and compute are underlying costs.

Expert projects can reveal repeatable preparation and review tasks to bring into the software. Test whether those tasks recur across customers before expanding the product. Demand, prices and margins still need pilot evidence; the prices shown on the site are proposals, and customer checkout is not enabled.

Measure time and total cost per accepted deliverable, including inference, Blender compute, failed attempts, correction, storage and human review. Track repeat use and how much prior work survives a product revision. Authoring, rendering and later viewing have different costs.

## Inference research

Tenstorrent Blackhole is a research option for lowering inference costs. A compatible model, permission to use its weights and acceptable output quality must come first. No Blackblend model port or cost advantage has been demonstrated. The dated [inference](archive/inference.md) and [economics](archive/economics.md) notes keep the supporting research and assumptions.
