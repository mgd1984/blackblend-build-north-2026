import handler from "vinext/server/fetch-handler";
import {dispatchBillingUsage} from '../lib/billing-dispatch';
import type {BillingEnv} from '../lib/billing-store';
export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Sites identity headers are never trusted on the independent deployment.
    const headers = new Headers(request.headers);
    for (const key of [...headers.keys()])
      if (key.startsWith("oai-authenticated-")) headers.delete(key);
    return handler.fetch(new Request(request, { headers }), env, ctx);
  },
  async scheduled(_controller:ScheduledController,env:Cloudflare.Env){
    const result=await dispatchBillingUsage(env as BillingEnv);
    // Surface failures to the scheduler without logging private event bodies or credentials.
    if(result.status==='retry_pending'||result.attentionRequired)throw Error('Billing usage requires reconciliation.');
  },
};
