import {billingEnabled,billingStore,type BillingEnv} from './billing-store.ts';
import {createUsageDelivery,toMetronomeEvent,type UsageOutboxRecord,type SandboxBillingAccount} from './metered-billing.ts';

type Row=Omit<UsageOutboxRecord,'payload'>&{payload:string};
const LIMIT=20,LEASE_MS=60_000;
/** Send one limited batch when scheduled. Exporting this function does not enable a schedule. */
export async function dispatchBillingUsage(env:BillingEnv,dependencies:{fetchImpl?:typeof fetch;now?:()=>number}={}){
  if(!billingEnabled(env))return {status:'disabled' as const,accepted:0,attentionRequired:0};
  const db=env.DB!,now=dependencies.now??Date.now,at=now(),token=crypto.randomUUID();
  const claimed=await db.prepare(`INSERT INTO billing_dispatch_leases (id,token,expires_at) VALUES ('usage',?,?)
    ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE billing_dispatch_leases.expires_at<?`)
    .bind(token,at+LEASE_MS,at).run();
  if(!claimed.meta.changes)return {status:'busy' as const,accepted:0,attentionRequired:0};
  let attentionRequired=0;
  async function flag(ids:string[],code:string,delay:number){
    await db.batch(ids.map(id=>db.prepare(`UPDATE usage_events SET delivery_attempts=delivery_attempts+1,delivery_error=?,next_attempt_at=?
      WHERE id=? AND delivered_at IS NULL AND EXISTS(SELECT 1 FROM billing_dispatch_leases WHERE id='usage' AND token=?)`)
      .bind(code,now()+delay,id,token)));
  }
  try{
    const selected=await db.prepare(`SELECT id,owner,kind,payload,created_at,delivered_at FROM usage_events
      WHERE delivered_at IS NULL AND next_attempt_at<=? ORDER BY created_at,id LIMIT ?`).bind(at,LIMIT).all<Row>();
    const store=billingStore(db,env.BILLING_STRIPE_ACCOUNT_ID!),accounts=new Map<string,SandboxBillingAccount>(),valid:UsageOutboxRecord[]=[];
    for(const row of selected.results){
      try{
        let account=accounts.get(row.owner);
        if(!account){const found=await store.byOwner(row.owner);if(!found)throw Error('Mapping unavailable');account=found;accounts.set(row.owner,account);}
        const record={...row,payload:JSON.parse(row.payload)};
        toMetronomeEvent(record,account,at);valid.push(record);
      }catch{
        attentionRequired++;await flag([row.id],'reconciliation_required',60*60*1000);
      }
    }
    if(!valid.length)return {status:'idle' as const,accepted:0,attentionRequired};
    const deliver=createUsageDelivery({config:{enabled:true,environment:'sandbox',stripeAccountId:env.BILLING_STRIPE_ACCOUNT_ID!,token:env.METRONOME_API_TOKEN!},
      resolveAccount:async owner=>accounts.get(owner)??null,now,fetchImpl:dependencies.fetchImpl,
      async markDelivered(ids,acceptedAt){
        const results=await db.batch(ids.map(id=>db.prepare(`UPDATE usage_events SET delivered_at=?,delivery_attempts=delivery_attempts+1,
          delivery_error=NULL,next_attempt_at=0 WHERE id=? AND delivered_at IS NULL
          AND EXISTS(SELECT 1 FROM billing_dispatch_leases WHERE id='usage' AND token=?)`).bind(acceptedAt,id,token)));
        if(results.some(result=>result.meta.changes!==1))throw Error('Usage delivery lease changed.');
      }});
    try{const result=await deliver(valid);return {status:'accepted' as const,accepted:result.accepted,attentionRequired};}
    catch{
      await flag(valid.map(record=>record.id),'delivery_unconfirmed',60_000);
      return {status:'retry_pending' as const,accepted:0,attentionRequired:attentionRequired+valid.length};
    }
  }finally{
    await db.prepare(`DELETE FROM billing_dispatch_leases WHERE id='usage' AND token=?`).bind(token).run();
  }
}
