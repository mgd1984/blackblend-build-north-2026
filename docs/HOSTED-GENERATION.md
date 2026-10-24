# Hosted generation

Studio can capture an MP4 in the browser, save a private project take, freeze its reviewed inputs, approve a fal job and compare the saved result. The bounded native window edit runs in hosted Blender; detailed local authoring uses Blender and the optional desktop adapter. Browser capture does not require desktop encoding when H.264 WebCodecs is available; unsupported browsers receive an explicit WebM fallback.

This revision provides a restricted **operator preview**. It does not enable commercial customer spending. Preparation and status reads do not submit generation. Choose **Generate video** on a saved animation to see a compact cost confirmation. This first action records the selected source and freezes its inputs without calling fal. The priced **Generate** button authorizes submission; there is no separate review button or charge checkbox. Job details remain expandable. The displayed amount is the output-video base; input-video and image processing are additional, so it is not a spending cap.

The existing deployment is enabled for the verified operator account with one approved video job per rolling 24 hours. Other accounts remain denied. This activation was checked without a live fal submission; the stored credential has not been validated against the provider. Commercial billing remains disabled. See [keys and configuration](CONFIGURATION.md).

## Execution and recovery

- Clerk supplies the verified owner. Reads, media and mutations remain owner-scoped. Browser mutations require an exact same-origin request.
- A reviewed source hash binds the frozen request. References are retained privately. Editing inputs requires cancelling an unsubmitted approval or creating a new take.
- D1 claims the job before one provider POST. Concurrent/repeated approvals do not create additional submissions. A lost or malformed provider receipt is uncertain and blocks new submissions for that account until inspected. Never automatically retry a paid POST.
- A known receipt can be polled and downloaded independently. The completed MP4 is stored in private R2 and attached to its source take for comparison. A manual result upload cannot replace the result of a hosted job.
- Provider media capabilities expire after four hours and identify only the frozen source/reference. The browser receives authenticated local media routes, never provider asset URLs or API keys.
- Scene-agent requests have their own durable identities. The browser retains only an account-scoped request identity, source digest and revision for recovery. Recovery uses GET, preserves unapplied proposals and never repeats a paid POST. Uncertain abandoned claims expire to an explicit unknown state.

## Worker configuration

Set secrets through the Worker secret prompt or an approved private pipe. Keep local provider credentials in Keychain. Do not put values in source, browser variables, command-line arguments, environment files or run records.

| Setting | Purpose |
| --- | --- |
| `FAL_KEY` | Hosted generation provider credential |
| `GENERATION_MEDIA_SECRET` | Random signing secret, at least 32 characters |
| `GENERATION_ALLOWED_OWNERS` | Explicit comma-separated verified Clerk owner identifiers for operator preview |
| `GENERATION_DAILY_LIMIT` | Integer operator limit, defaults to three approvals per rolling day, maximum twenty |
| `APP_ORIGIN` | Exact HTTPS deployment origin; also used for provider media capabilities |
| `OPENAI_API_KEY` | Hosted scene-agent credential |
| `AGENT_ALLOWED_OWNERS` | Explicit hosted-agent allowlist; falls back to generation allowlist |
| `BLACKBLEND_AGENT_MODEL` | Structured scene-agent model, default `gpt-6.1-sol` |

D1 and R2 bindings and a configured Clerk issuer are also required. Local development overrides `APP_ORIGIN` with loopback for session checks, so hosted paid generation deliberately remains unavailable locally. Do not tunnel the desktop adapter or weaken the HTTPS requirement to enable it. Local Keychain-backed chat and native Blender execution remain available separately.

Apply migrations through `0007_openai_native_receipts.sql` to the intended environment before enabling its routes. Local migration tests and the local preview do not migrate production. Provision the private woodshed export under the fixed scene asset R2 keys only with explicit approval; absence of that private asset yields the labelled concept example.

## Billing

[Usage billing](METERED-BILLING.md) describes the sandbox mapping, signed notification inbox and scheduled usage dispatcher. The UI's **Usage & billing** panel reports owner-scoped pending and accepted usage. Acceptance is not invoicing or payment. The scheduled export has no activated cron trigger. Customer entitlement, verified external contracts, tax/payment reconciliation and commercial spending approval remain separate setup gates.

No pricing tiers, invoice or payment is created by these source changes. Connected Stripe browser/tool access does not supply Worker secrets or Metronome credentials.

## Validation boundaries

Unit/contract tests use mocked providers and real SQLite migrations. Browser approval/completion tests intercept all API calls in an isolated profile and use published demo media. They verify UI behavior, not a live fal generation or paid invoice. Test authenticated ownership separately from image/video geometry and appearance. Generated video can alter geometry or motion; it is not engineering verification.
