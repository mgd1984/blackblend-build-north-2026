# Billing

**Customer billing is not enabled.** The code records usage and supports a Stripe/Metronome sandbox. It has not created or sent a real invoice, payment or usage event, and no billing schedule is active.

The intended jobs are simple: Blackblend records completed work; Metronome calculates its price using a contract and rate card; Stripe collects payment. Clerk identifies the user, and a server-side mapping selects that user's billing accounts. D1 does not hold a second credit wallet.

## Existing code

Paths below are under `apps/studio/`.

| File | Job |
| --- | --- |
| `lib/metered-billing.ts` | Validate saved usage and send it to Metronome |
| `lib/billing-store.ts` | Store account mappings, pending usage and delivery attempts |
| `lib/billing-webhooks.ts` | Check Stripe/Metronome notification signatures and save notifications |
| `lib/billing-dispatch.ts`, `worker/index.ts` | Send a limited batch from a scheduled worker; no schedule is configured |
| `drizzle/0005_billing_persistence.sql` | Add billing tables without dropping pending usage |

The sender reads saved `usage_events`, not customer IDs or quantities supplied by a browser. It accepts at most 100 events per batch and uses a fixed Metronome HTTPS endpoint. Disabled settings, missing account mappings, wrong sandbox accounts or unsupported fields stop delivery.

One scheduled call processes at most 20 events. A database lease prevents overlapping calls from marking each other's events as delivered. Invalid or unmapped events stay pending, with a reason and an hourly retry delay. Unconfirmed delivery waits at least a minute before trying the same event again. Errors make the scheduled call fail so monitoring can detect them.

`GET /api/billing` requires a Clerk session and returns only that user's pending, accepted and attention counts, pending notifications and last delivery acknowledgement. It reports whether billing is disabled or configured for a sandbox. It does not expose vendor IDs, credentials, a balance or permission to spend.

## What a usage record means

| Event | Required fields |
| --- | --- |
| `generation.completed` | `model`, `duration_ms`, `resolution`, `reference_count` |
| `agent.completed` | `model`, `input_tokens`, `cached_input_tokens`, `output_tokens` |

Video usage currently accepts the configured fal 3D-to-video model, up to 15,000 ms and exact resolution labels `480P`, `768P`, `1080P`. Do not relabel 768P as 720P. Reference counts are limited. Cached input tokens are part of total input, not an additional quantity. Optional processing time is a performance measure, not a guessed charge.

Events exclude photos, prompts, media URLs, provider request IDs, Clerk IDs and unverified dollar costs. Each saved row has `id`, `owner`, `kind`, parsed `payload`, UTC `created_at` and nullable `delivered_at`. The generation UUID is also Metronome's `transaction_id`; agent usage gets one UUID when saved. Keep IDs, timestamps and body unchanged on retry.

`billing_scope` is the mapped Metronome contract UUID. Configure it as a billable-metric group key. Customers with several simultaneous contracts need matching `usage_filter` settings so one event is not billed to several contracts.

`delivered_at` means Metronome accepted the request. It does not prove that a price matched, an invoice was issued or payment succeeded. If the HTTP request or acknowledgement write fails, keep the event and resend the same ID/body. This safe usage retry never authorizes retrying a paid generation request with an unknown outcome.

The documentation checked on 21 October gives a 34-day deduplication/backfill window and a default 24-hour invoice grace period. Do not replay arbitrary older events. Late usage for an already finalized invoice needs explicit checks against the invoice; do not change timestamps or silently discard it. Monitor event age and delivery failures before serving paying customers.

## Payment notifications

Stripe's SDK checks its signature; Web Crypto checks Metronome's HMAC signature. Both use the original request bytes and a five-minute timestamp window. Live Stripe events and events from another Stripe account are rejected. The Metronome environment name must come from a verified sandbox notification; the tests use a fictional one.

The handler verifies the message, finds the customer through a trusted mapping, then saves a small notification record. A unique `(provider,eventId)` prevents duplicates. It returns success only after that write; a duplicate also returns success. Later processing must fetch current invoice/contract state from the vendor, rather than treating message arrival order as truth.

`POST /api/billing/stripe` and `POST /api/billing/metronome` read at most 1 MB. They use signature checks instead of browser sessions or CSRF tokens. Invalid signatures return 400, oversized messages 413, and disabled settings or failed storage/mapping 503 so the sender can retry.

Notifications stay pending until an operator or future worker checks the vendor's current state. Receiving one does not create credits, prove payment or authorize generation. Stripe invoice IDs and trusted customer ownership identify the account; arbitrary browser/checkout metadata does not.

## Sandbox setup

Keep `BILLING_MODE` unset until setup is verified. These values must come from trusted server configuration:

| Setting | Value |
| --- | --- |
| `BILLING_MODE` | Exactly `sandbox`; live mode is unsupported |
| `DB` | Existing D1 database, migrated through 0005 |
| `BILLING_STRIPE_ACCOUNT_ID` | Verified Stripe sandbox account |
| `METRONOME_API_TOKEN` | Secret for the verified Metronome sandbox workspace |
| `STRIPE_WEBHOOK_SECRET` | Stripe endpoint's signing secret |
| `METRONOME_WEBHOOK_SECRET` | Metronome endpoint's signing secret |
| `METRONOME_SANDBOX_ENVIRONMENT` | Exact verified `environment_type`; never `PRODUCTION` |

Use server-only `provisionSandboxBillingAccount(db, account, expectedStripeAccountId)` or a reviewed parameterized migration. Required fields are `owner` (`clerk:` plus verified user ID), `environment:'sandbox'`, `stripeAccountId`, `stripeCustomerId`, `metronomeCustomerId`, `metronomeContractId` and `usageConfigured:true`.

The helper validates and inserts a new mapping. Uniqueness prevents silently replacing an owner, customer or contract. There is no browser provisioning route, email match or automatic customer creation. Confirm the dashboard, metrics, rates and contract first. Keep mapping files private; changing an existing mapping requires an explicit audited migration that accounts for pending usage.

## Work remaining before charging customers

1. Verify a Metronome sandbox and its Stripe connection. A connected Stripe tool does not provide Worker secrets or Metronome access. Isolate Blackblend's customers/products if sharing a sandbox; prefer a dedicated one when available.
2. Define completed-video and chat-token metrics, rates, contracts and filters. Use actual provider bills to check margins. A catalog of LLM token prices does not price fal video.
3. Store API/signing secrets in Worker secrets, or Keychain for local server use. Never put them in SQL, logs, command arguments, Git or public Vite variables. Verify the Metronome workspace instead of guessing from a token prefix.
4. Create the verified user/customer/contract mappings. Test signed deliveries, duplicates, forged events, late messages, failed payments, wrong accounts and wrong environments.
5. After sandbox checks, add a separately reviewed delivery schedule, alerts and checks against current invoices/contracts. Builds and migrations do not activate a schedule.
6. Add customer spending checks: a valid allowance/contract, a fixed visible job price, a reservation for concurrent work and settlement/refund rules. Deny spending when permission is unknown. The present operator mode only charges the configured provider account.
7. Configure tax registrations and an invoice tax provider before collecting payment. Reconcile the final Stripe invoice total, including tax, rather than an estimated provider cost or pre-tax subtotal.

The earlier documentation described Checkout-to-Metronome prepaid purchases as private preview. It is not implemented here. Verify access and a supported payment flow in sandbox rather than adding another wallet.

## Evidence

Documentation checked 21 October 2026: [Stripe/Metronome](https://docs.stripe.com/billing/how-metronome-works-with-stripe), [token billing](https://docs.stripe.com/billing/token-billing), [prepaid Checkout preview](https://docs.stripe.com/payments/checkout/metronome-credit-purchases), [Stripe webhooks](https://docs.stripe.com/webhooks), [Metronome ingest API](https://docs.metronome.com/api-reference/usage/ingest-events), [usage events](https://docs.metronome.com/guides/events/send-usage-events), [Stripe invoice integration](https://docs.metronome.com/integrations/invoice-integrations/stripe) and [Metronome signatures](https://docs.metronome.com/guides/platform-configuration/setup-webhooks).

Tests use mocked delivery and signed fixtures with the real Stripe SDK. They do not establish a working external sandbox, actual invoice pricing, tax setup or payment collection.
