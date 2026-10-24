# Blackblend

Turn 3D assembly animations into AI-finished product films, with the source beside the result for review.

[Open Studio](https://blackblend-studio.mgd1984.workers.dev/studio) · [Demo video](https://www.youtube.com/watch?v=-E_kNycUh-M) · [Architecture](docs/ARCHITECTURE.md) · [Demo walkthrough](docs/HACKATHON-DEMO.md)

## Try the working slice

1. Open **Animate** to inspect an existing assembly, isolate components and direct camera and explosion/reassembly motion. Detailed examples require the operator's private geometry; published example films can be viewed without that access.
2. **Render previs** creates a deterministic MP4 in the browser and opens **Finish**. A Blender-rendered animation can also be imported directly into Finish.
3. Add appearance direction and reference images. Hosted generation requires an allowlisted account and an explicit priced confirmation.
4. Compare the source and existing AI result with synchronized Split, Blend and Breathe playback. **Library** holds saved takes.

The editable geometry supplies motion and structure. Generative video supplies appearance treatment and may introduce drift; comparison makes that visible. General photo-to-CAD reconstruction, arbitrary agent-written Blender scripts, fabrication verification and commercial customer billing are future work.

## Stack

One vinext/React/TypeScript Studio, Three.js, Tailwind/shadcn/Radix, Clerk identity, and Cloudflare Workers with owner-scoped D1/R2 storage. Sol uses the OpenAI Agents SDK for validated scene proposals. A separately gated native tool performs a bounded window edit in offline OpenAI-hosted Blender 5.1. fal provides the animation-conditioned finishing pipeline. Stripe/Metronome adapters are sandbox-only and inactive.

## Run and verify

Use Node 22 LTS or 24+ and ffmpeg/ffprobe for media tests:

```sh
npm ci
npm run db:local
npm run dev
```

Studio runs on http://127.0.0.1:4331. The test suite uses synthetic fixtures and mocked providers; it needs no paid API calls or private models.

```sh
npm run typecheck
npm test
npm run build
npm run check:dependencies
```

To configure your own account, replace the placeholder D1 identifier, Clerk issuer and application origin in `apps/studio/wrangler.jsonc`. Set your own Clerk **publishable** identifier as `VITE_CLERK_PUBLISHABLE_KEY` in an ignored `apps/studio/.env.standalone.local` or your build environment. Provider keys belong only in Keychain or Worker secrets; see [configuration](docs/CONFIGURATION.md). Paid features stay unavailable until separately configured and authorized. This snapshot does not provide access to Blackblend's accounts, private assets or execution runtime.

## Submission provenance

This is a clean, single-history snapshot of the Blackblend source merged on 24 October 2026, corresponding to source commit `89b6579c9c1aaf68cf59abc706efd96f4b1da2b4` (the tested integration is `18cefa2`). The private development repository and its full history are preserved separately. `SUBMISSION-SOURCE.json` records file hashes, publication changes and boundaries.

The woodshed, PTZ and combine assets and earlier visualization experiments predate the hackathon software. Development during Build Week built and consolidated the Studio, browser animation capture, review/comparison, account boundaries and hosted agent/generation workflow, using AI coding assistance. Existing model and video work is disclosed as demonstration input. Clerk is used for identity and server-side authorization checks. Published demonstration encodes are included; personal photographs, native CAD/Blender geometry, private provider result URLs, credentials, project records and run receipts are excluded.

Historical strategy graphics and abandoned implementation notes are omitted from this submission copy. Application source, tests, migrations, lockfile and retained dependency licenses are included. Project source is published for review; no additional project license is granted by this snapshot. Third-party license notices remain in their source directories.
