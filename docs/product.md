# Product

Blackblend helps designers, engineers and agencies explain physical products through video. They bring an existing assembly or Blender animation, direct its motion, then use AI to explore a visual treatment. The original stays available for comparison.

## The workflow

1. **Animate:** inspect parts, ask for edits and choose camera and assembly motion.
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

## Where it stops

The browser can move parts, change settings and add simple shapes. The Blender tool cuts rectangular windows in the woodshed. General Blender scripting is a separate local experiment, excluded from this release. Reliable photo-to-CAD conversion, fabrication drawings and engineering verification are future work.

Generated video can change a part, a dimension or its motion. Comparison helps someone spot changes; it does not prove mechanical correctness. The example models also contain assumed dimensions.

## What comes next

First, make one useful product-video workflow reliable: reusable shots, clearer edits, saved references and consistent results across revisions. Measure time to an approved video, all failed attempts, correction time and repeat use.

Then expand model inputs and Blender editing. Stills, assembly guides and interactive viewers can follow when the same model supports them well. Digital twins and simulation need additional engineering data and a maintained connection to the physical product.

The business idea is software subscriptions plus generation usage, with optional design and engineering services. Demand, prices and margins still need customer evidence. A future credit balance should show a clear job price; the prototype charges the configured provider account directly.

Tenstorrent Blackhole is a research option for lowering inference costs. A compatible model, permission to use its weights and acceptable output quality must come first. No Blackblend model port or cost advantage has been demonstrated. The dated [inference](archive/inference.md) and [economics](archive/economics.md) notes keep the supporting research and assumptions.
