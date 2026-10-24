import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {sqliteD1} from './sqlite-d1.ts';
import {billingStore,provisionSandboxBillingAccount,ownerBillingStatus,type BillingEnv} from '../lib/billing-store.ts';
import {dispatchBillingUsage} from '../lib/billing-dispatch.ts';
import {billingStatusResponse,billingWebhookResponse} from '../lib/billing-http.ts';

const owner='clerk:user_alice',other='clerk:user_other',now=Date.parse('2026-10-21T22:00:00Z');
const account={owner,environment:'sandbox',stripeAccountId:'acct_sandbox',stripeCustomerId:'cus_alice',
  metronomeCustomerId:'a4512a54-b401-4d7f-9e9f-0a0c4197174c',metronomeContractId:'f8f25723-b700-4250-abf8-7cf3ea56b13e',usageConfigured:true};
const stripeSecret='whsec_test_only_secret',metronomeSecret='test-only-secret';
const payload={model:'minimax/h3-max/3d-to-video',duration_ms:6000,resolution:'768P',reference_count:2};
async function fixture(){
  const {db,close}=sqliteD1();const env:BillingEnv={DB:db,BILLING_MODE:'sandbox',BILLING_STRIPE_ACCOUNT_ID:account.stripeAccountId,
    METRONOME_API_TOKEN:'test-only-token',STRIPE_WEBHOOK_SECRET:stripeSecret,METRONOME_WEBHOOK_SECRET:metronomeSecret,METRONOME_SANDBOX_ENVIRONMENT:'TEST_FIXTURE'};
  await provisionSandboxBillingAccount(db,account,account.stripeAccountId);
  async function usage(recordOwner=owner,data:unknown=payload){const id=crypto.randomUUID();
    await db.prepare('INSERT INTO usage_events (id,owner,kind,payload,created_at) VALUES (?,?,?,?,?)')
      .bind(id,recordOwner,'generation.completed',JSON.stringify(data),new Date(now-1000).toISOString()).run();return id;}
  return {db,close,env,usage};
}
function raw(value:unknown){return new TextEncoder().encode(JSON.stringify(value));}
const stripeEvent=()=>({id:'evt_test',object:'event',type:'invoice.paid',created:now/1000,livemode:false,
  data:{object:{id:'in_test',object:'invoice',customer:account.stripeCustomerId,livemode:false,metadata:{owner:other}}}});
function stripeRequest(bytes=raw(stripeEvent()),signature?:string){
  const digest=createHmac('sha256',stripeSecret).update(String(now/1000)+'.').update(bytes).digest('hex');
  return new Request('https://blackblend.example/api/billing/stripe',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature??`t=${now/1000},v1=${digest}`},body:bytes});
}

test('0005 migration retains pending historical usage and defaults delivery tracking safely',()=>{
  const sqlite=new DatabaseSync(':memory:'),directory=new URL('../drizzle/',import.meta.url);
  try{
    for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')&&name<'0005_').sort())sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
    sqlite.prepare(`INSERT INTO usage_events (id,owner,kind,payload,created_at) VALUES ('legacy','clerk:legacy','agent.completed','{}','2026-10-20')`).run();
    sqlite.exec(readFileSync(new URL('0005_billing_persistence.sql',directory),'utf8'));
    const row=sqlite.prepare('SELECT delivered_at,delivery_attempts,next_attempt_at,delivery_error FROM usage_events').get();
    assert.deepEqual({...row},{delivered_at:null,delivery_attempts:0,next_attempt_at:0,delivery_error:null});
  }finally{sqlite.close();}
});
test('account mappings are insert-only, unique by owner/customer/contract and resolved within the configured sandbox',async()=>{
  const f=await fixture();try{
    const store=billingStore(f.db,account.stripeAccountId);assert.deepEqual(await store.byOwner(owner),account);
    assert.equal(await store.byOwner(other),null);assert.equal(await billingStore(f.db,'acct_other').byOwner(owner),null);
    for(const duplicate of [account,{...account,owner:other},{...account,owner:other,stripeCustomerId:'cus_other',metronomeCustomerId:crypto.randomUUID()}])
      await assert.rejects(provisionSandboxBillingAccount(f.db,duplicate,account.stripeAccountId));
    await assert.rejects(provisionSandboxBillingAccount(f.db,{...account,environment:'production'},account.stripeAccountId));
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM billing_accounts').first<{count:number}>())?.count,1);
  }finally{f.close();}
});
test('billing status requires identity and exposes only owner counts with honest disabled/sandbox state',async()=>{
  const f=await fixture();try{
    const id=await f.usage();await f.usage(other);await f.db.prepare('UPDATE usage_events SET delivered_at=? WHERE id=?').bind(new Date(now).toISOString(),id).run();
    const request=new Request('https://blackblend.example/api/billing');
    assert.equal((await billingStatusResponse(request,f.env,async()=>null)).status,401);
    const own=await ownerBillingStatus(f.env,owner);assert.equal(own.configured,true);assert.equal(own.commercialGenerationEnabled,false);
    assert.deepEqual(own.usage,{pending:0,accepted:1,attentionRequired:0});
    assert.deepEqual((await ownerBillingStatus(f.env,other)).usage,{pending:1,accepted:0,attentionRequired:0});
    const disabled=await ownerBillingStatus({...f.env,BILLING_MODE:undefined},owner);assert.equal(disabled.mode,'disabled');assert.equal(disabled.configured,false);
    const json=JSON.stringify(own);assert.ok(!json.includes('cus_'));assert.ok(!json.includes('acct_'));assert.ok(!json.includes('token'));assert.ok(!json.includes('amount'));
  }finally{f.close();}
});
test('dispatch is opt-in, bounded to20 events and acknowledges accepted ingestion in the durable outbox',async()=>{
  const f=await fixture();try{
    for(let i=0;i<21;i++)await f.usage();let calls=0;
    const fetchImpl=(async(_url,options)=>{calls++;assert.equal(JSON.parse(String(options?.body)).length,calls===1?20:1);return new Response(null,{status:200});}) as typeof fetch;
    assert.equal((await dispatchBillingUsage({...f.env,BILLING_MODE:undefined},{fetchImpl,now:()=>now})).status,'disabled');assert.equal(calls,0);
    assert.equal((await dispatchBillingUsage(f.env,{fetchImpl,now:()=>now})).accepted,20);
    assert.equal((await dispatchBillingUsage(f.env,{fetchImpl,now:()=>now})).accepted,1);assert.equal(calls,2);
    assert.equal((await ownerBillingStatus(f.env,owner)).usage.accepted,21);
  }finally{f.close();}
});
test('overlapping dispatch is leased and uncertain delivery retries the same IDs/body after backoff',async()=>{
  const f=await fixture();let release!:(response:Response)=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;});let time=now;const bodies:string[]=[];
  try{
    const id=await f.usage();const first=dispatchBillingUsage(f.env,{now:()=>time,fetchImpl:(async(_url,options)=>{bodies.push(String(options?.body));started();return new Promise<Response>(resolve=>{release=resolve;});}) as typeof fetch});
    await ready;assert.equal((await dispatchBillingUsage(f.env,{now:()=>time,fetchImpl:async()=>{assert.fail('overlap must not send');}})).status,'busy');
    release(new Response(null,{status:503}));assert.equal((await first).status,'retry_pending');
    const failed=await f.db.prepare('SELECT * FROM usage_events WHERE id=?').bind(id).first<{delivered_at:string|null;delivery_attempts:number;next_attempt_at:number}>();
    assert.equal(failed?.delivered_at,null);assert.equal(failed?.delivery_attempts,1);assert.ok(failed!.next_attempt_at>time);
    time+=61_000;
    await dispatchBillingUsage(f.env,{now:()=>time,fetchImpl:(async(_url,options)=>{bodies.push(String(options?.body));return new Response(null,{status:200});}) as typeof fetch});
    assert.equal(bodies[0],bodies[1]);assert.equal((await ownerBillingStatus(f.env,owner)).usage.accepted,1);
  }finally{f.close();}
});
test('unmapped or malformed usage remains visible for reconciliation without blocking valid events',async()=>{
  const f=await fixture();try{
    await f.usage(other);await f.usage(owner,{...payload,duration_ms:99999});await f.usage();let sent=0;
    const result=await dispatchBillingUsage(f.env,{now:()=>now,fetchImpl:(async(_url,options)=>{sent=JSON.parse(String(options?.body)).length;return new Response(null,{status:200});}) as typeof fetch});
    assert.equal(result.attentionRequired,2);assert.equal(sent,1);assert.equal(result.accepted,1);
    assert.deepEqual((await ownerBillingStatus(f.env,owner)).usage,{pending:1,accepted:1,attentionRequired:1});
  }finally{f.close();}
});
test('an expired dispatcher cannot acknowledge or release a newer dispatcher lease',async()=>{
  const f=await fixture();try{
    const id=await f.usage();
    const result=await dispatchBillingUsage(f.env,{now:()=>now,fetchImpl:(async()=>{
      await f.db.prepare(`UPDATE billing_dispatch_leases SET token='new-dispatcher',expires_at=? WHERE id='usage'`).bind(now+120_000).run();
      return new Response(null,{status:200});
    }) as typeof fetch});
    assert.equal(result.status,'retry_pending');
    assert.equal((await f.db.prepare('SELECT delivered_at FROM usage_events WHERE id=?').bind(id).first<{delivered_at:string|null}>())?.delivered_at,null);
    assert.equal((await f.db.prepare('SELECT token FROM billing_dispatch_leases').first<{token:string}>())?.token,'new-dispatcher');
  }finally{f.close();}
});
test('Stripe webhooks verify raw bytes and persist an owner-bound unique inbox before acknowledgement',async()=>{
  const f=await fixture();try{
    for(let i=0;i<2;i++)assert.equal((await billingWebhookResponse('stripe',stripeRequest(),f.env,now)).status,200);
    const rows=(await f.db.prepare('SELECT * FROM billing_notifications').all<{owner:string;payload:string}>()).results;
    assert.equal(rows.length,1);assert.equal(rows[0].owner,owner);assert.ok(!rows[0].payload.includes(other));
    assert.equal((await ownerBillingStatus(f.env,owner)).notificationPending,1);
    assert.equal((await billingWebhookResponse('stripe',stripeRequest(raw(stripeEvent()),'forged'),f.env,now)).status,400);
    assert.equal((await billingWebhookResponse('stripe',stripeRequest(),{...f.env,BILLING_MODE:undefined},now)).status,503);
    const missing=raw({...stripeEvent(),data:{object:{...stripeEvent().data.object,customer:'cus_unmapped'}}});
    assert.equal((await billingWebhookResponse('stripe',stripeRequest(missing),f.env,now)).status,503);
    const tooLarge=new Request('https://blackblend.example/api/billing/stripe',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(1_000_001)});
    assert.equal((await billingWebhookResponse('stripe',tooLarge,f.env,now)).status,413);
  }finally{f.close();}
});
test('Metronome raw signatures and sandbox identity are required; inbox failures are retriable',async()=>{
  const f=await fixture();try{
    const event={id:crypto.randomUUID(),type:'commit.create',timestamp:new Date(now).toISOString(),environment_type:'TEST_FIXTURE',customer_id:account.metronomeCustomerId};
    const date=new Date(now).toUTCString();const request=(value:unknown)=>{const bytes=raw(value),signature=createHmac('sha256',metronomeSecret).update(date+'\n').update(bytes).digest('hex');
      return new Request('https://blackblend.example/api/billing/metronome',{method:'POST',headers:{'content-type':'application/json','x-metronome-date':date,'metronome-webhook-signature':signature},body:bytes});};
    assert.equal((await billingWebhookResponse('metronome',request(event),f.env,now)).status,200);
    assert.equal((await billingWebhookResponse('metronome',request({...event,environment_type:'PRODUCTION'}),f.env,now)).status,400);
    const failing={...f.db,prepare(sql:string){if(sql.startsWith('INSERT INTO billing_notifications'))throw Error('database offline');return f.db.prepare(sql);}} as D1Database;
    assert.equal((await billingWebhookResponse('stripe',stripeRequest(),{...f.env,DB:failing},now)).status,503);
  }finally{f.close();}
});
