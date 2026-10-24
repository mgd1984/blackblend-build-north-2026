# Keys and configuration

Blackblend has one Studio and two execution environments: your Mac during local work, and the Cloudflare Worker for the deployed app. Keychain and Worker secrets are separate stores. Saving a key in Keychain does not automatically configure the hosted app.

## What lives where

| Setting | Location | Purpose / exposure |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Ignored `apps/studio/.env.standalone.local`; embedded at build time | Public Clerk application identifier. Browser exposure is intentional; it does not authorize a project or provider call. |
| `CLERK_ISSUER`, `APP_ORIGIN` | `apps/studio/wrangler.jsonc`; local origin override in Vite | Public deployment configuration. The Worker verifies the Clerk signature, issuer, session and authorized party; mutations also check origin. |
| `DB`, `BUCKET` | Wrangler D1/R2 bindings | Runtime access to project records and private files. Resource IDs in config are identifiers, not database passwords. Routes enforce owner access. |
| `OPENAI_API_KEY` | Cloudflare Worker secret | Hosted Sol/Agents SDK proposals and the bounded hosted Blender executor. These consume OpenAI API usage, independently of a ChatGPT subscription. |
| `FAL_KEY` | Cloudflare Worker secret | Hosted fal video generation. Browser requests never contain this key. |
| `GENERATION_MEDIA_SECRET` | Cloudflare Worker secret, generated randomly | Signs short-lived source/reference URLs for fal. It is not a provider API key. Signed URLs are bearer capabilities: anyone holding one can access that frozen asset until expiry. They are available only after job approval. |
| `GENERATION_ALLOWED_OWNERS`, `GENERATION_DAILY_LIMIT` | Worker secrets (operational configuration) | Exact verified Clerk owner allowlist and rolling 24-hour approved-job limit. Currently one operator and one video approval per rolling day. The limit counts attempts; it is not a dollar budget. |
| `AGENT_ALLOWED_OWNERS` | Worker secret | Separate admission for hosted chat. If absent, code falls back to the generation allowlist; keep it explicitly configured when enabling video access. |
| `NATIVE_ALLOWED_OWNERS`, `NATIVE_GEOMETRY_ENABLED`, `NATIVE_DAILY_LIMIT` | Worker secrets | Admission and limits for the bounded Blender window operation. Video activation does not change these. |
| `OPENAI_BLENDER_RUNTIME_FILE_ID`, `NATIVE_TOOL_SHA256` | Worker secrets | Pinned runtime file and tool integrity identifier. These identify execution assets; they are not API credentials. |
| `BLACKBLEND_AGENT_MODEL`, `BLACKBLEND_AGENT_TRACING` | Optional server configuration | Default model is `gpt-6.1-sol`; tracing is on unless set to `off`. The runner sets `traceIncludeSensitiveData:false`; trace identifiers and execution metadata still require controlled platform access. Native execution uses stored Responses state for recovery; see [hosted Blender](HOSTED-BLENDER.md) for retention boundaries. |

“Environment variable” describes how code receives a value, not whether the value is secret. Only the Clerk **publishable** key belongs in the `VITE_` browser namespace. Provider keys belong in server secret bindings, never client-prefixed variables.

### Local keys

All three Keychain items use account `api-key`:

| Service | Used for |
| --- | --- |
| `blackblend.openai` | Local scene-agent proposals |
| `blackblend.fal.ai` | Explicitly approved desktop fal jobs; source for the hosted credential installed during operator setup |
| `blackblend.tenstorrent.console` | Optional desktop Tenstorrent adapter; not the deployed 3D-to-video path |

Use `npm run agent:key` for hidden OpenAI entry, or `node tt-video.mjs key set --provider fal` for hidden fal entry. `node tt-video.mjs key check --provider fal` checks Keychain access without contacting fal. Never paste keys in chat or put them in shell commands. The Swift helper returns secrets over a private process pipe; don't run its `get` operation directly in a visible terminal.

Local provider keys stay in Keychain. Ignored `.dev.vars` can contain local non-secret configuration such as issuer and origin; don't copy production provider keys there. Local Studio's HTTP origin intentionally fails the hosted generation HTTPS gate. The desktop adapter remains loopback-only, with its own action token and approval screen.

## Before a video can cost money

1. Sign in as an allowlisted account and save a source animation in a private project.
2. Choose **Generate video**. This records your selected source and freezes its hash, references, prompt and quality in D1/R2; it makes no fal submission.
3. Check the compact duration, quality and cost confirmation. Job details are available on demand. Input-video and image processing are additional to the displayed output base.
4. Press the priced **Generate** button to authorize fal charges. This is the only hosted video submit path. The server checks the owner, input hash, expiry, active-job guard and rolling limit, then claims the job before one fal POST.
5. Follow the saved receipt. A repeated approval cannot create another submission. An uncertain outcome blocks further submits until inspected; polling a known job is separate from retrying a paid POST.

This approval applies to fal video jobs. Sending an in-app chat message can consume OpenAI usage, and invoking the hosted native tool can consume container usage; Preview/Apply/Undo of an existing candidate does not rerun inference. The MCP workflow tools cannot submit a paid video job.

## Hosted setup and rotation

Use Wrangler's secret prompt or an approved process pipe to configure the existing Worker. Secret values must stay off argv, logs, source, build assets, environment files and private receipts. `wrangler secret list` lists names/types only. Preserve existing bindings and unrelated secrets when deploying.

The current operator setup copied the existing fal Keychain credential into `FAL_KEY` and generated a new media-signing secret. No new provider credential was created. Provider acceptance/expiry was not tested with a live generation. Rotating or renewing the Keychain copy later does **not** update the Worker: replace its `FAL_KEY` separately and then revoke the retired provider key. Ideally use separately scoped development and production provider credentials when the provider supports that setup. Rotating the media-signing secret invalidates outstanding signed source URLs, so reconcile active jobs first.

Treat Worker deployment access, the provider dashboards and the Apple login Keychain as privileged access. Account allowlists control who may cause spend with a shared server key; they do not create per-user provider keys. Never expose raw environment/config dumps from diagnostic endpoints. `/api/version` returns only the code revision/runtime, and `/api/generations` returns the caller's availability without secrets.

## Billing remains separate

Stripe/Metronome sandbox code is present but inactive. It expects `BILLING_MODE=sandbox`, `BILLING_STRIPE_ACCOUNT_ID`, `METRONOME_SANDBOX_ENVIRONMENT`, `METRONOME_API_TOKEN`, `STRIPE_WEBHOOK_SECRET` and `METRONOME_WEBHOOK_SECRET`, plus a verified server-owned customer mapping. Webhook secrets verify incoming signatures; they are different from API keys. No live payment key or customer charging was activated here. An operator generation charges the configured fal provider account; the Studio does not collect payment from a customer.

The deployed Clerk application is still a development instance. Commercial release also needs production identity configuration, customer entitlements, reconciled billing and operating budgets. This document describes the current restricted operator setup.
