> Historical note. Start with the [current guides](../../README.md#docs). Dates, plans and test results below describe the earlier work.

# Product film economics and competitive position

Research snapshot: 20 October 2026. Commercial thesis and proposed tests, not validated customer demand or a production capability claim.

## The purchase Blackblend could unlock

A product team buys an approved launch package: a directed film, feature shots, social cutdowns and stills. Its cost includes creative development, asset preparation, look development, animation, rendering, compositing, editing, sound, revisions and delivery. Advertising distribution is a separate purchase.

Apple's product films are a useful craft benchmark. No reliable disclosed budget for a modern iPhone commercial was established in the sources checked. Neither a generic agency estimate nor Apple's advertising expenditure establishes that budget. We should not publish a guessed Apple price or promise equivalent results at a fraction of it.

## Published offers: scope matters

These are providers' own public prices, not paid invoices, market averages or estimates of Apple's costs. The pages below use dollar signs; confirm invoice currency and usage rights before financial comparison. No FX conversion has been applied.

| Provider | Public offer | Included scope / boundary | What it establishes |
| --- | --- | --- | --- |
| [BIRAN](https://biranmedia.com/en/pricing/) | $8,000 for 30 seconds | Supplied usable CAD; 1080p master, three 4K stills, music, graphics, reviews and revision allowance; approximately two weeks. Complex simulation and TVC-level work require a custom quote. | A directly relevant product CGI service offer with meaningful preparation and finishing included. |
| [Demo Duck](https://demoduck.com/who-we-are/) | $20,000–25,000 custom 2D animation; $40,000–60,000+ scripted live action | Different production categories; typical production timeline across their work is 6–12 weeks. | Adjacent businesses sell creative production at substantial budgets. These are not interchangeable product-CGI quotes. |
| [FutureDeluxe Apple case](https://futuredeluxe.com/work/apple) | No budget published on the case page | MacBook Air work for Apple. | Specialist creative production exists at the quality target; the case provides no basis for an iPhone budget. |

The defensible conclusion is that the buyer's alternative can be a substantial production engagement. Our own price ceiling, quality and savings require customer evidence. The earlier CAD 1,500 Production proposal should be treated as a narrowly scoped pilot hypothesis, not a demonstrated price for a complete launch campaign.

## Technical competition changes the strategy

| Path | Primary evidence | Fit for this workflow | Unresolved gate |
| --- | --- | --- | --- |
| Native Blender | Explicit scene geometry and animation in our workflow | Baseline for product shape, camera and assembly motion; retain native rendering for critical product details | Artist effort, lighting/material quality and delivery time |
| [fal H3 Max 3D-to-video](https://fal.ai/models/minimax/h3-max/3d-to-video/api) | Previs video and appearance-reference inputs | Current experiment route | Measured drift, correction work, billing reconciliation and reproducibility |
| [fal LTX 2.3 reference V2V](https://fal.ai/models/fal-ai/ltx-2.3-22b/reference-video-to-video/api) | Video input, depth/canny preprocessors, conditioning controls | Strong candidate for a same-scene structural-conditioning comparison | Quality at equal deliverable specifications; weights/license and serving work are separate questions |
| [fal's own Blender extension](https://github.com/fal-ai/fal-blender-extension/blob/main/README.md) | Depth and edge animation workflows; LTX and Wan model choices; VSE import | A direct substitute for the basic addon-to-generation interaction | No evidence from the README alone of our desired product fidelity or full campaign delivery |
| [Prodia H3 ref2vid](https://docs.prodia.com/job-types/inference-minimax-h3-fast-ref2vid-v1/) | Video motion references | API candidate, requiring the same fidelity benchmark | Equivalence to fal's pipeline and backend hardware remain unverified |
| [Tenstorrent H3 runtime work](https://github.com/tenstorrent/tt-metal/pull/59338) | Existing H3 pipeline/runtime engineering | Potential foundation for future inference R&D | Exact weights, rights, conditioning parity, operator coverage and measured full serving cost |

An input modality is not a fidelity guarantee. A provider's image-to-video price is not a price for an equivalent previs-conditioned film. A Blender integration is already competitive table stakes. The useful differentiation hypothesis is dependable art direction, product correctness, source revisions and finished delivery across models.

## Production design

Use native geometry and animation as the authority for the product. Evaluate generative treatments shot by shot, retaining native product renders or compositing where text, logos, small features and motion must remain exact. Explore environments, lighting directions and appearance where generation earns its place. Human review must establish whether each final shot is suitable for its intended use.

The woodshed remains a good assembly-motion benchmark. Add a permission-cleared manufactured product before claiming product-launch readiness: reflective materials, precise edges, branding, a macro shot and a feature demonstration expose different failure modes.

## Economics to measure

Contribution per package = collected revenue − artist/delivery labor − all provider attempts − rendering/infrastructure − licensed assets − payment costs − revision/support allowance.

Track the accepted package, including failed attempts and corrections. A cheaper generated second only improves this equation if it reduces total delivery cost at acceptable quality.

Illustration in CAD, entirely hypothetical: a CAD 3,000 package with 15 hours at CAD 80/hour, CAD 100 compute and CAD 300 other delivery costs leaves CAD 1,400 contribution (46.7%) before fixed overhead and sales costs. At 30 hours it leaves CAD 200 (6.7%). Saving CAD 50 of compute changes the first margin by only 1.7 percentage points. This is a sensitivity example, not pricing advice, a forecast or a measured result.

Early customers to test: hardware brands with usable CAD and an upcoming launch; product marketing teams with repeated revisions; small studios seeking additional delivery capacity. Learn who owns the budget, their current alternative, exact deliverables, review process and willingness to pay. Agency partners may also provide a distribution channel. None of these segments is validated yet.

## Sequence and gates

1. Produce one tightly scoped, reviewed product film and asset package. Record every human hour, correction and expense.
2. Sell a fixed-scope pilot with explicit deliverables and revision rounds. Establish actual customer approval and contribution.
3. Productize repeated scene preparation, choreography, approvals, versioning and export work. Charge software customers for repeated utility; price directed service separately around delivery capacity.
4. Benchmark inference alternatives only with an approved experiment budget. Use the same scene, resolution, duration, references and pass/fail criteria; include camera path, part count/orientation, temporal stability, branding and correction time.
5. Consider a Tenstorrent port after access/rights and quality parity are established. Recover fixed R&D and ongoing maintenance from demonstrated net savings at credible volume. Improved latency, privacy or acceptance may matter more than raw price, but each needs evidence.

No paid video calls, training, hardware procurement or outreach were performed for this research. The new visuals are explanatory strategy artifacts, not proof that Blackblend can yet deliver Apple-level production.

---

# Submission focus

## The working slice

**Direct an editable assembly, animate it, then compare an AI video treatment against its source.**

Show the woodshed in one Studio: inspect parts, direct an edit, play explode/reassemble motion, capture the animation, add appearance references, generate and compare. Use the existing native candidate and matched video for the submission recording. Do not spend on another demonstration run without explicit authorization.

Blender supplies actual native geometry for the bounded window operation. The browser handles assembly direction and choreography. fal supplies the visual treatment. Generated output can change geometry and motion; comparison makes those differences inspectable. Broader scene construction, CAD reconstruction and structural validation are outside this submission.

## Generation experience

Generate video → compact cost confirmation → generation progress → source/result comparison.

Selecting Generate uses the displayed animation and freezes it internally. The final priced button authorizes provider charges. Authentication, input hashes, single-submit claims and recovery remain server responsibilities. No separate review ceremony or charge checkbox is required. A hash and execution details belong in expandable job details.

## Commercial model to validate after submission

Use prepaid **render credits** as a customer denomination, following Phantasmo's separation of provider usage, provider cost, customer quote and settlement. Credits are not raw LLM tokens. Video has duration, resolution and input-processing costs; chat and native execution have different meters. Customers should see the job price and balance, while the server handles those meters.

The intended paid loop is quote → reserve → execute → settle or release. A customer quote should cap the credit debit; supplier cost variability is Blackblend's pricing responsibility. Keep the existing usage outbox and inactive billing adapters for that work. Do not build a second wallet or activate subscriptions, credit purchases or invoices for the hackathon.

Current operator mode charges the connected fal account directly. Its output base estimate excludes input-video and image usage; it is not a full customer quote, credit balance or hard dollar cap. No credits have been sold or granted. fal's published 5-second 768p example totals about USD 0.96 including input processing, despite an output base of USD 0.40. Do not copy Phantasmo's image credit prices onto video.

The initial value proposition is controlled assembly visualization and reusable source assets. Software usage and optional expert project work are the commercial paths to test. For now, prove one useful woodshed workflow; keep new tiers, enterprise contracts, infrastructure changes and general Blender agents off the submission's critical path.

Sources checked 22 October 2026: [fal 3D-to-video pricing](https://fal.ai/models/minimax/h3-max/3d-to-video), [Stripe/Metronome billing responsibilities](https://docs.stripe.com/billing/how-metronome-works-with-stripe). Phantasmo's local economics contracts and generation UI supplied the comparison pattern; no deployed Phantasmo behavior was assumed.
