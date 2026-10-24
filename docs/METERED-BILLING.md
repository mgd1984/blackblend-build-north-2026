# Usage billing boundary

Blackblend records completed work. Metronome meters and prices that work using contracts and rate cards. Stripe collects payment on the resulting invoices. Clerk supplies the authenticated owner; server-side mappings bind that owner to its billing customer. There is no second credit wallet in D1.

This change supplies billing persistence, verified notification endpoints and a bounded dispatcher. Billing remains disabled by default. No Metronome workspace, customer, rate card, contract, webhook endpoint or Stripe product was created. No real invoice, payment or usage event was sent. The Studio's restricted operator preview remains separate from commercial customer spending authorization.

## Implemented

- `apps/studio/lib/metered-billing.ts` validates product usage and maps a trusted outbox record to an ingestion event. A batch contains up to 100 events and is sent only to the fixed Metronome HTTPS endpoint. Disabled configuration, missing owner mappings, wrong sandbox accounts and unsupported dimensions stop delivery.
- `createUsageDelivery` takes `resolveAccount(owner)` and `markDelivered(ids, acceptedAtISO)` interfaces. Its input is the durable `usage_events` outbox, never a browser-supplied customer ID or usage quantity. Parse the persisted JSON payload before calling it. A scheduled or queued server worker owns invocation; it is not a public browser action.
- `apps/studio/lib/billing-webhooks.ts` uses Stripe's official SDK for snapshot-event signatures and Web Crypto for Metronome's documented HMAC signature. Both require original bytes and a five-minute replay window. Production and cross-account Stripe events are rejected. The Metronome environment label must be configured from a verified sandbox notification; the tests use an explicitly fictional fixture label.
- Combined webhook handlers validate the signature and sandbox, resolve the resource's customer through a trusted mapping, then enqueue a minimal reconciliation hint. The inbox has a unique `(provider,eventId)` key. Success follows the durable write; duplicate insertion returns success. Missing mappings or failed writes remain retriable failures.
- Migration `0005_billing_persistence.sql` adds insert-only application provisioning for unique owner/customer/contract mappings, a durable notification inbox, a dispatcher lease and usage delivery attempts/backoff/error fields. Historical pending usage is retained. No migration is applied remotely by tests or builds.
- `GET /api/billing` requires the Clerk session and returns only that owner's pending, accepted and attention counts, unreconciled notification count, last ingestion acknowledgement and honest disabled/sandbox configuration state. It never returns vendor IDs, credentials, money balances or commercial spending permission.
- `POST /api/billing/stripe` and `POST /api/billing/metronome` read at most 1 MB of original bytes, verify signatures, resolve customer ownership and commit the unique inbox record before returning success. They intentionally use server signatures instead of a browser session or CSRF token. Disabled configuration and storage/mapping failures return retriable 503 responses. Signature failures return 400; oversized notifications return 413.
- The Worker exports a gated scheduled handler but **no cron trigger is configured**. One invocation leases delivery and considers at most 20 events. Invalid/unmapped usage remains pending with an attention marker and hourly backoff; unconfirmed ingestion retries after at least one minute, retaining the original IDs and timestamps. Overlapping invocation cannot acknowledge another lease's records. Accepted ingestion clears the delivery error and records `delivered_at`.
- Webhooks do not create a credit balance or authorize generation. Queue processing must fetch current authoritative invoice and contract state, rather than applying events in delivery order. Stripe invoice IDs and first-class customer ownership determine identity; browser metadata and arbitrary checkout metadata do not.

## Event contract

Outbox records have `id`, `owner`, `kind`, parsed `payload`, `created_at` (UTC ISO timestamp), and nullable `delivered_at`. The stable generation job UUID becomes both the outbox ID and Metronome `transaction_id`; create an agent usage UUID once with its completion record. Never regenerate either ID on retry. Do not replay arbitrary historical events after Metronome's 34-day deduplication/backfill window.

| Kind | Required quantities | Pricing interpretation |
| --- | --- | --- |
| `generation.completed` | `model`, `duration_ms`, `resolution`, `reference_count` | One finished video, with dimensions available to its rate card |
| `agent.completed` | `model`, `input_tokens`, `cached_input_tokens`, `output_tokens` | Separate scene-agent consumption; cached input is a subset of input |

Generation currently accepts the specific fal 3D-to-video model, exact resolution labels `480P`, `768P`, `1080P`, durations up to 15,000 milliseconds, and bounded reference counts. Resolution labels are preserved without converting 768P to 720P. Optional processing time is omitted when unavailable and is an operational dimension, not an inferred charge. Provider request IDs, photos, prompts, asset URLs, Clerk IDs and unverified dollar costs are excluded from billing events.

`billing_scope` is the mapped Metronome contract UUID. Configure it as a billable-metric group key. If a customer has concurrent contracts, every contract needs the matching `usage_filter` so one event is not charged against several contracts. Define prices in rate cards, and create the matching billable metrics before enabling ingestion.

`delivered_at` means **Metronome accepted the ingestion request**. HTTP 200 does not establish that a metric matched, the event was rated, an invoice was issued or payment succeeded. If the request times out or the database acknowledgement fails, retain the outbox records and retry the same IDs and body. This retry policy applies to usage ingestion; it does not permit retrying an ambiguous paid generation POST.

Monitor pending event age and delivery failures. Metronome's default invoice grace period is 24 hours; its 34-day ingestion window does not extend a finalized invoice. Late usage requires explicit invoice reconciliation, not silently changing the timestamp or dropping the record. Configure alerts before serving paying customers.

The notification inbox remains pending until an operator or a future reconciliation worker fetches authoritative vendor state. This milestone records durable hints; it does not automatically reconcile invoices, create entitlements or update any monetary balance. A scheduler result with delivery errors/attention fails the invocation so it can be monitored, without exposing private payloads in logs.

## Configuration and operator provisioning

All the following server-side configuration must be present before any dispatcher or webhook runs. Leave `BILLING_MODE` unset until the sandbox setup is verified. No browser request can enable these bindings.

| Binding | Required value/source |
| --- | --- |
| `BILLING_MODE` | Exactly `sandbox`; production is unsupported |
| `DB` | Studio's existing D1 binding, migrated through 0005 |
| `BILLING_STRIPE_ACCOUNT_ID` | Verified chosen Stripe sandbox account ID |
| `METRONOME_API_TOKEN` | Secret for the independently verified Metronome sandbox workspace |
| `STRIPE_WEBHOOK_SECRET` | This Stripe sandbox endpoint's signing secret |
| `METRONOME_WEBHOOK_SECRET` | This Metronome sandbox endpoint's signing secret |
| `METRONOME_SANDBOX_ENVIRONMENT` | Exact `environment_type` from a verified sandbox notification; never `PRODUCTION` |

Provision mappings through the server-only `provisionSandboxBillingAccount(db, account, expectedStripeAccountId)` helper or an operator-reviewed parameterized deployment migration. The account object requires `owner` (`clerk:` plus verified Clerk user ID), `environment:'sandbox'`, `stripeAccountId`, `stripeCustomerId`, `metronomeCustomerId`, `metronomeContractId`, and `usageConfigured:true`. The helper validates the identifiers and expected sandbox account, then performs a plain INSERT. Uniqueness rejects replacing an existing owner, Stripe customer, Metronome customer or contract. There is no public provisioning route, email-based matching, customer creation or update/upsert path.

First validate the mapping against the actual sandbox dashboards, metrics, contract and rate-card configuration. Invoke provisioning only from a trusted operator process with the D1 binding. Keep any provisioning material private and outside Git. Do not paste API tokens into commands, SQL, mapping objects or logs. A changed mapping requires an explicit audited migration that accounts for pending usage; do not edit live rows to redirect a pending charge.

After local fixture tests, apply 0005 in a separately authorized deployment step. Configure the sandbox webhook destinations with only the supported Stripe invoice events and selected Metronome contract/commit/credit/invoice notifications. Verify real signed deliveries and ownership with `BILLING_MODE` still managed by the operator. The dispatcher supports completion-event schemas already defined above, not arbitrary historical records. Only after successful sandbox verification should a separate reviewed change add a cron trigger and alerting. No schedule is activated in this patch.

## Secure setup still required

1. Obtain access to a dedicated Metronome sandbox and connect it to the chosen Stripe sandbox. A Stripe MCP connection grants neither a Worker API credential nor Metronome access. Keep the existing shared sandbox isolated by products, customers and configuration; a dedicated Blackblend sandbox is preferable once available.
2. Set up the completed-video and agent-token billable metrics, rate cards, Contracts and billing filters. Review fal's actual invoice/cost data before deciding margin and retail prices. Stripe's automatic OpenAI/Anthropic/Google token-price catalog does not establish the price of fal's video pipeline.
3. Store the Metronome sandbox API token and the two endpoint signing secrets in Worker secrets. Local development secrets stay in Keychain and are injected server-side. Nothing goes into a public Vite variable, browser bundle, committed environment file or log. Metronome tokens have no assumed test prefix: verify their workspace separately before enabling delivery.
4. Provision and store a unique server-owned mapping: Clerk owner, Stripe sandbox account/customer, Metronome customer/contract, sandbox environment and explicit `usageConfigured`. The adapter does not create billing customers or infer account ownership from email. Keep mappings immutable during pending outbox delivery or perform an explicit audited migration.
5. Verify the durable outbox dispatcher and signed inbox with real sandbox deliveries, then configure a reviewed schedule and monitoring. Add authoritative invoice/contract reconciliation before using notifications as an entitlement signal. Verify forged, duplicate, delayed, failed-payment, cross-owner and wrong-environment cases before exposing checkout.
6. Add authoritative spending authorization before commercial generation: configured contract/allowance, a frozen customer-visible quote, concurrent exposure controls, and denial when entitlement is unknown. Accepted usage events or a successful redirect are not spending permission. The current restricted operator preview is not customer billing.
7. Configure tax registrations and the invoice tax provider before collecting payments. Do not enable automatic tax on the assumption that a flag alone registers the business. Reconcile payment against the final Stripe invoice total, including tax; never a guessed provider cost or pre-tax Metronome subtotal.

Stripe's automatic Checkout-to-Metronome prepaid commit flow is **private preview**. It is intentionally not implemented or presented as available. Without that access, choose a supported Metronome contract/payment flow explicitly and validate it in sandbox. Do not add a competing custom wallet to fill the gap.

## Evidence

Official documentation checked 21 October 2026:

- [Stripe: how Metronome works with Stripe](https://docs.stripe.com/billing/how-metronome-works-with-stripe)
- [Stripe: bill for LLM tokens](https://docs.stripe.com/billing/token-billing)
- [Stripe: prepaid credits with Checkout, private preview](https://docs.stripe.com/payments/checkout/metronome-credit-purchases)
- [Stripe: webhook verification and duplicate delivery](https://docs.stripe.com/webhooks)
- [Metronome: ingest event API](https://docs.metronome.com/api-reference/usage/ingest-events)
- [Metronome: send usage events](https://docs.metronome.com/guides/events/send-usage-events)
- [Metronome: Stripe invoice integration](https://docs.metronome.com/integrations/invoice-integrations/stripe)
- [Metronome: webhook signatures and notification identity](https://docs.metronome.com/guides/platform-configuration/setup-webhooks)

The installed Stripe CLI predates its `docs` command. Documentation was verified through the connected official documentation search; no global CLI or login settings were changed. Adapter tests use mocked ingestion and signed fixtures with the real Stripe SDK. They do not establish live sandbox access, model availability, invoice rating or payment collection.
