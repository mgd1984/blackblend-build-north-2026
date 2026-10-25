> Historical note. Start with the [current guides](../../README.md#docs). Dates, plans and test results below describe the earlier work.

> Historical decision log. Superseded decisions are retained as history; current architecture is in [ARCHITECTURE.md](../architecture.md).

# Blackblend — decisions and next slice

2026-10-20 · discussion draft

## Accepted from the user

- Registered for Build North; currently solo.
- Audience is people using CAD for visualization, including fabrication shops and builders. Neither vertical alone defines the product.
- Interested in business model, stack and judges; has used and likes Clerk.
- Wants a project home in Obsidian and GitHub.
- Stop speculative paid generations while diagnosing fidelity.

## Recommendations awaiting discussion

- Promise: CAD to a visual story you can review and share.
- Core authority: native geometry and rendering; generative appearance optional and reviewable.
- First shared workflow: author -> version -> compare -> approve -> deliver.
- First cloud slice: hosted review of existing media with Clerk identity and explicit project access.
- Sponsor priority: Clerk and a simple Render deployment. Expo/mobile and agent-memory integrations deferred absent a real need.
- Charge for workflow/authoring/review, meter generation separately. Pricing and customer demand unvalidated.

## Proposed delivery tasks — not GitHub issues yet

1. Initial source package: synthetic fixtures, sanitized manifest and source-only validation complete; final publication/license decision remains. README and AGENTS.md split; prepared for initial GitHub publication.
2. Choreography preset: expose opening/explosion/hold/reassembly/orbit controls in addon; preserve revisions and source association.
3. Project/take model: source IDs, immutable settings, provider submit outcomes and approval state.
4. Clerk reviewer slice: sign-in, selected-project authorization, media access and one invited reviewer; no paid generation necessary.
5. Customer evidence: three next-deliverable conversations across fabrication, building and CAD visualization; measure baseline work/time and test willingness to pay.
6. Submission package: exact build-week disclosure, two-minute video, live link if available, public source after review.

## Open questions worth answering next

- When someone already has CAD, which handoff creates the largest recurring pain: animation authoring or getting a client to understand/approve it?
- Would the same person pay for this monthly, or is per-project pricing more natural?
- Can we get one external user to run a real project before the deadline?

Private GitHub repo created October 20: https://github.com/mgd1984/blackblend. Authentication verified as mgd1984. Initial publication targets the private repository main branch; consult live Git history for publication state. A separate Blackblend Clerk development application and a local Convex deployment are now configured. No website deployment or domain purchase.

## Implemented architecture slice — October 20

Selected TypeScript + vinext/Cloudflare + Clerk + Convex. The new studio runs beside the existing local lab. Convex owns project access and free simulated job state; Render is deferred to heavy media work. Hosted media review and invitations remain future work. See STACK.md for exact setup and limits.

## 21 October 2026 — consolidate around product geometry

The owner clarified the north star in the Devpost draft: one source of product geometry feeds multiple visual experiences. Keep one Studio (`apps/studio`), one Clerk identity path, one D1 project ledger and one root npm lockfile. Remove the older Convex app, Sites target and independent lab UI. The desktop adapter is an execution dependency for Blender, Keychain and approved jobs. Existing remote data is not deleted or migrated. The first milestone is one traceable product-film workflow; broader outputs and Blackhole inference remain separate future tracks.
