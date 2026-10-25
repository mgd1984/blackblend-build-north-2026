import { env } from "cloudflare:workers";
import { billingWebhookResponse } from "../../../../lib/billing-http";
import type { BillingEnv } from "../../../../lib/billing-store";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return billingWebhookResponse("stripe", request, env as BillingEnv);
}
