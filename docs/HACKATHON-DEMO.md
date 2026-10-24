# Blackblend submission focus

23 October 2026. Working positioning and demo plan; local changes are not a deployment.

## One sentence

Blackblend turns existing 3D assembly animations into AI-finished product films, with the native source beside the result for review.

The first user is a designer, agency or engineering team explaining a physical product. They supply the underlying design. The included woodshed makes the workflow immediately testable; an imported Blender MP4 enters at the finishing stage. General model creation is a later capability.

## The demo

1. Open **Animate**. Identify the existing woodshed and its components. Hide a roof section, inspect the assembly, then restore it. Show camera and explosion/reassembly controls.
2. **Render previs** records the browser animation and opens **Finish**. Alternatively, **Start with → Import Blender animation** opens a rendered MP4 directly in Finish.
3. Set appearance direction. **Prepare video** saves source and direction privately and opens generation controls, still inside Finish. Add appearance references. The priced Generate action authorizes the provider job.
4. Use an existing completed woodshed or PTZ pair to show synchronized split, blend and Breathe playback. Show the source comparison, not an implied geometry guarantee.
5. Open **Library** to revisit takes. Library stores work; Animate and Finish are the work areas.

Rehearse with existing results. No new paid run is needed to record the demo. Native Blender authoring and the browser's Three.js assembly view are distinct execution paths; the browser previs capture is a real animation input to the finishing pipeline.

## What is distinctive

Camera direction and assembly relationships originate in editable 3D work. Blackblend joins that authored motion, agent-assisted edits, appearance references, retained takes and synchronized review. The generative model supplies the visual treatment. The workflow helps people iterate on the explanation of a real product while inspecting what the treatment changed.

The current native agent tool is a bounded Blender window operation. General agent-authored scene editing, reliable photo-to-CAD reconstruction and automatic fabrication drawings remain roadmap items.

## Business and roadmap

- **Entry point:** product films and assembly explainers for teams with existing 3D assets. Proposed revenue is a workspace subscription plus generation usage; scoped expert production and engineering services are an additional offer.
- **Next product milestone:** broader model inputs, reusable shots, stable revision handoffs and repeatable fidelity checks. Measure time to an approved film, repeat use and contribution margin after inference, retries and support.
- **Inference milestone:** evaluate compatible video-conditioned models across providers/hardware. Track cost per accepted shot alongside part identity, camera fidelity, motion, latency and operational reliability. A cheaper image-to-video price alone does not establish equivalence to the current animation-conditioned pipeline.
- **Technical investigation:** Tenstorrent Blackhole is a credible candidate. Weight availability, licensing, required conditioning, operator support and fidelity are entry gates to a port. No Blackblend H3-on-Blackhole port or NVIDIA cost advantage has been demonstrated.

## Verified industry context

- [Prodia pricing](https://docs.prodia.com/reference/pricing/) lists `inference.tenstorrent.wan2-2-lightning.img2vid.v1`, a Tenstorrent Wan 2.2 Lightning image-to-video job, at $0.084/video when checked on 23 October 2026. This is a different workload from fal's H3 3D-to-video endpoint; do not use the price as a Blackblend pipeline cost estimate.
- [Tenstorrent TT-Deploy](https://tenstorrent.com/deploy) publishes its Prodia/Blackhole video demonstration and benchmarks. These are vendor-reported results for the named workloads.
- [Georgian's investment-team profile](https://georgian.io/team/ferris-symoom) explicitly names Tenstorrent among the firm's investments. This is relevant ecosystem context, not evidence of interest in Blackblend.
- [fal H3 Max 3D-to-video](https://fal.ai/models/minimax/h3-max/3d-to-video/api) documents the endpoint used for the current animation-conditioned workflow.
