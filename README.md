# Blackblend

Turn a 3D assembly animation into a product video. Keep the original beside the AI version so you can see what changed.

[Open Studio](https://blackblend-studio.mgd1984.workers.dev/studio) · [Demo video](https://www.youtube.com/watch?v=-E_kNycUh-M) · [Walkthrough](docs/demo.md) · [Architecture](docs/architecture.md)

## Try it

1. **Animate:** inspect an assembly, isolate parts, and choose camera and explosion/reassembly motion. Detailed model examples require the operator's private geometry; published comparison films can be viewed without it.
2. **Render previs:** export an MP4 from the browser, or import an animation rendered in Blender.
3. **Finish:** add appearance instructions and reference images. Paid generation requires an approved account and a displayed price confirmation.
4. **Compare:** play the original and AI result together using Split, Blend or Breathe. Saved takes live in the Library.

Chat proposes scene changes for Preview, Apply and Undo. A restricted Blender tool makes a real rectangular window cut. General Blender scripting is a separate local experiment, excluded from this release. Generated video can change shape or motion; comparison helps people inspect those changes. Customer billing is not enabled.

## Stack

One vinext/React/TypeScript Studio, Three.js, Tailwind/shadcn/Radix, Clerk sign-in, and Cloudflare Workers with owner-scoped D1/R2 storage. Sol uses the OpenAI Agents SDK for scene proposals. The fixed window tool runs in offline OpenAI-hosted Blender 5.1; fal supplies the animation-conditioned video treatment. Stripe/Metronome adapters remain sandbox-only and inactive.

## Run locally

Use Node 22 LTS or 24+, with ffmpeg/ffprobe for media tests:

```sh
npm ci
npm run db:local
npm run dev
```

Open http://127.0.0.1:4331. The tests use synthetic fixtures and mocked providers; they need no private models or paid requests.

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npm run check:dependencies
```

For your own deployment, replace the D1, Clerk and application-origin placeholders in `apps/studio/wrangler.jsonc`. Set your own Clerk publishable identifier as `VITE_CLERK_PUBLISHABLE_KEY` in an ignored `apps/studio/.env.standalone.local` or your build environment. Provider secrets belong in Keychain or Worker secrets. See [setup](docs/setup.md), [Studio controls](docs/studio.md), [Blender](docs/blender.md) and [billing](docs/billing.md).

## Submission provenance

This public repository is the audited Build North source snapshot of release `c24340633f4089912488ed9bf296bbe9cd4a9468` (reviewed PR head `454a431`), merged on 25 October 2026. It has its own public history. Development and full recovery history remain in the private Blackblend repository. Public snapshots are refreshed deliberately after review; they do not follow private pushes automatically. `SUBMISSION-SOURCE.json` records source hashes, exclusions and publication changes.

The woodshed, PTZ and combine assets and earlier visualization experiments predate the hackathon software. During Build Week, development built and consolidated the Studio, browser animation capture, review/comparison, account boundaries and hosted agent/generation workflow, using AI coding assistance. Earlier model and video work is disclosed as demonstration input. Clerk provides identity; server-side checks enforce access to each user's projects and files.

Published demonstration encodes are included. Native CAD/Blender models, personal photos, provider result URLs, credentials, account data and run receipts are excluded. Historical strategy graphics and private operational notes are omitted. Application source, tests, migrations, lockfile and retained third-party licenses are included. The retained desktop test waits for its completed receipt before restarting; application behavior matches the release.

Project source is published for review; this snapshot grants no additional project license. Third-party license notices remain in their source directories.
