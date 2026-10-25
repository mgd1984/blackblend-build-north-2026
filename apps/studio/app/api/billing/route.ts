import { env } from "cloudflare:workers";
import { requestOwner } from "../../../lib/identity";
import { billingStatusResponse } from "../../../lib/billing-http";
import type { BillingEnv } from "../../../lib/billing-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return billingStatusResponse(request, env as BillingEnv, requestOwner);
}
