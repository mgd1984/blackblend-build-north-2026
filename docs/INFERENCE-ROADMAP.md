# Inference stack, economics and R&D roadmap

Strategic update: [Product film economics and competitive position](PRODUCT-FILM-ECONOMICS.md) reframes the opportunity around approved launch packages and adds the missing fal Blender/depth/edge competition. Use that analysis and the production v3 visuals for the current recommendation. The hypothetical arithmetic below is a sensitivity illustration, not market intelligence or a validated business case.

Research snapshot: 20 October 2026. Proposed roadmap, not a commitment to hardware purchase, training, provider experiments or spending.

## Thesis

Blackblend's inference opportunity is to preserve useful native camera/assembly motion while improving appearance at an acceptable cost per accepted take. Separate application workflow, conditioning pipeline, trained checkpoint and hardware runtime. A portable API wrapper alone does not reproduce a model or its behavior.

## Current stack

Prepared Blender scene → native MP4 → private review → local approval → fal H3 Max 3D-to-video → result comparison. Tenstorrent prompt/image generation is also integrated locally. Native rendering remains the exact source of part/camera transforms; generative video is evaluated against it. The hosted app does not yet execute provider jobs independently of the desktop adapter.

## What live documentation establishes

| Route | Evidence | Remaining question |
| --- | --- | --- |
| fal H3 Max 3D-to-video | Explicit Blender/previs animation input, appearance references, automatic reference creation and shot-related billing | Full internal orchestration, conditioning, checkpoint availability and reproducibility |
| Prodia H3 ref2vid | H3 reference inputs accept video as motion reference; self-hosted tiers are documented | Previs fidelity, actual backend hardware per tier, and equivalence to fal's workflow |
| Prodia Tenstorrent Wan 2.2 Lightning | Explicit image-to-video job type; listed price USD 0.084 per video | Useful supported output spec and suitability for the actual motion-preservation task |
| Tenstorrent MiniMax-H3 code | tt-metal release notes and PR 59338 reference H3 transformer/VAEs, a Ref2VA pipeline and tests, and Wormhole Galaxy memory fixes | Which checkpoint, modalities, precision, hardware and performance are supported by a pinned release |

The Prodia H3 tier is not established to run on Tenstorrent merely because Prodia also exposes a Tenstorrent Wan model. Different public benchmark models/configurations do not establish matched-quality speed or cost for our workload.

fal says H3 Max is its post-trained variant of the open-weight MiniMax H3 base and is co-designed with its inference engine. The 3D-to-video API describes multi-shot and reference behavior. These facts do not establish that there is a separately downloadable “3D-to-video post-train.” No usable fal H3 Max checkpoint/license package was verified in this research. Licensing the exact variant/pipeline, reproducing behavior from an available base, and hardware porting are distinct projects.

## Roadmap with decision gates

| Stage | Deliverable | Gate to continue |
| --- | --- | --- |
| 1. Measure current economics | Per-job ledger: endpoint/version, inputs, resolution, billed duration/shots, provider charge, stage timings, failures and review labor | Reconcile estimates to real provider receipts; retain ambiguous submission state; no automatic billable retries |
| 2. Define fidelity benchmark | Small permission-cleared set of woodshed/PTZ/mechanical sequences; fixed input hashes, references, settings and pass/fail rubric | Quantify camera motion, component count/orientation, trajectory, reassembly, temporal stability and appearance acceptance |
| 3. Evaluate API alternatives | Prodia H3 motion-reference candidate; Wan image-input candidate assessed separately | Approved fixed-budget experiment; compare equivalent tasks/specs and cost per accepted output, with manual review |
| 4. Establish port feasibility | Checkpoint + license inventory, fal pipeline questions, pinned TT release/code audit, hardware access and operator coverage | Obtain weights/permissions or select a different base; identify actual missing conditioning and kernels before estimating effort |
| 5. Prototype on Tenstorrent | Known input → target-device inference; reference encoder, transformer and video decode path checked separately | Numeric checks at matched precision, visual fidelity, memory, queue/encode overhead and measured throughput on stated hardware |
| 6. Optimize or post-train | Conditional: batching, caching, tiling/sharding, precision tuning or an independently developed conditioning/adaptation method | Cost/quality improvement on held-out assemblies; scoped training data rights and separate R&D budget |
| 7. Productionize | Durable execution, versioned artifacts, cost approval, observability, recovery and model routing | Service-level behavior and fully loaded economics justify ongoing operations |

Stages 1–2 begin with existing media/records. Paid benchmark runs, model training and hardware rental/purchase each need explicit authorization. Partnership questions can be drafted now; no outreach is authorized by this document.

A strong technical milestone would be: reproduce a defined CAD/previs-conditioned task on Tenstorrent at a measured fidelity threshold and demonstrate lower fully loaded cost or latency. Report the existing H3 runtime work as the foundation, with our contribution scoped to conditioning, adaptation, evaluation and optimization actually implemented.

## Economics

All provider figures below are USD. Blackblend's proposed retail prices are CAD; convert using the actual transaction FX and include tax/payment costs where applicable.

fal's detailed 3D-to-video pricing block lists USD 0.50 processing/request, USD 0.05/0.08/0.16 per generated second at 480p/768p/1080p, a five-second minimum per shot, excess input tokens at USD 0.02/1,000 after the included allowance, and USD 0.10 per generated reference. The same page has a conflicting introductory summary about reference prices and example totals. Treat this as a quote-estimation uncertainty; reconcile actual billed usage before displaying a firm customer price.

For one 14-second single-shot output, generation plus the detailed block's processing fee is USD 1.20 at 480p, USD 1.62 at 768p or USD 2.74 at 1080p, before excess input tokens and generated references. Multi-shot minimums can increase the bill. These are estimates derived from the detailed block, not reconciled costs of our existing runs.

Prodia's USD 0.084 Tenstorrent Wan image-to-video price cannot be treated as the price of an equivalent H3 previs-conditioned output. Prodia's H3 reference-video pricing separately charges input-video duration; include that in any comparison. Prodia documents `?price=true` for obtaining the charged product and amount.

Useful formulas:

- Cost per accepted take = total paid attempts / accepted takes, plus associated review, preparation and variable infrastructure costs.
- For an independent repeated-attempt approximation with acceptance probability p: expected attempt cost per acceptance = cost per attempt / p. Real attempts are correlated; measure the actual job set.
- Serving cost per clip = provisioned hourly cost / sustained clips per hour at observed utilization, plus host/CPU, storage, transfers, operations and support.
- Porting break-even volume = incremental fixed R&D cost / net saving per equivalent accepted take, provided that saving is positive. Ongoing maintenance belongs in net savings.

Illustration only: a USD 2.42 attempt (1.62 base estimate + 0.60 excess tokens + 0.20 generated references) with 25% acceptance implies USD 9.68 generation cost per accepted take. Three review minutes per attempt at USD 75/hour adds USD 15 per acceptance under the same assumption, for USD 24.68 before other preparation/delivery costs. None of these acceptance/labor values were measured.

A USD 50,000 port saving USD 1 per equivalent accepted output needs 50,000 accepted outputs just to recover fixed porting cost, before financing and ongoing maintenance. A better business case may come from faster iteration, privacy/local deployment or improved acceptance, but each needs buyer and technical evidence. These figures illustrate the decision rule; they are not a project estimate.

## Research sources

- fal endpoint and detailed pricing: https://fal.ai/models/minimax/h3-max/3d-to-video
- fal input schema: https://fal.ai/models/minimax/h3-max/3d-to-video/api
- fal post-training and runtime: https://fal.ai/minimax-h3-max and https://blog.fal.ai/introducing-h3-max-by-fal/
- Prodia motion-reference schema: https://docs.prodia.com/job-types/inference-minimax-h3-fast-ref2vid-v1/
- Prodia price table: https://docs.prodia.com/reference/pricing/
- Tenstorrent public video claims (vendor benchmark): https://tenstorrent.com/solutions/real-time-video
- TT release notes: https://github.com/tenstorrent/tt-metal/releases
- H3 pipeline/runtime work: https://github.com/tenstorrent/tt-metal/pull/59338
- Base model license, to review for intended deployment and derivatives: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE
