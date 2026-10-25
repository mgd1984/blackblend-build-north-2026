import handler from "vinext/server/fetch-handler";
import {dispatchBillingUsage} from '../lib/billing-dispatch';
import type {BillingEnv} from '../lib/billing-store';
export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // The standalone app must verify identity itself; ignore Sites identity headers.
    const headers = new Headers(request.headers);
    for (const key of [...headers.keys()])
      if (key.startsWith("oai-authenticated-")) headers.delete(key);
    return handler.fetch(new Request(request, { headers }), env, ctx);
  },
  async scheduled(_controller:ScheduledController,env:Cloudflare.Env){
    const result=await dispatchBillingUsage(env as BillingEnv);
    // Report scheduler failures without logging private events or credentials.
    if(result.status==='retry_pending'||result.attentionRequired)throw Error('Billing usage requires reconciliation.');
  },
};
