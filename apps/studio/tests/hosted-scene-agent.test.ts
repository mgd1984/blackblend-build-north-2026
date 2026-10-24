import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostedSceneAgent,hostedAgentAvailable} from '../lib/hosted-scene-agent.ts';
import {conceptWoodshed} from '../lib/scene-document.ts';
import {agentResponse,agentCall,agentMessage} from './agent-fixture.ts';
import {sqliteD1} from './sqlite-d1.ts';
const owner='clerk:alice',other='clerk:mallory';
test('hosted scene replies and usage are owner-scoped and durable across request replay',async()=>{
  const {db,close}=sqliteD1();let calls=0;
  const input={requestId:crypto.randomUUID(),prompt:'Use a white background',scene:conceptWoodshed()};
  const settings={yaw:null,elevation:null,radius:null,target:null,orbit:null,duration:null,spread:null,background:'white'};
  const fetchImpl=(async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(JSON.parse(String(options?.body)).store,false);return agentResponse(calls===1?[agentCall('set_scene',settings)]:[agentMessage('White background proposed.')],{input_tokens:900,output_tokens:250,input_tokens_details:{cached_tokens:100}});}) as typeof fetch;
  const config={DB:db,OPENAI_API_KEY:'private-key',AGENT_ALLOWED_OWNERS:owner,BLACKBLEND_AGENT_TRACING:'off'};
  try{
    const first=await hostedSceneAgent(config,fetchImpl).run(owner,input);
    assert.equal(first.scene.background,'white');
    const replay=await hostedSceneAgent(config,fetchImpl).run(owner,input);assert.deepEqual(replay,first);assert.equal(calls,2);
    assert.equal((await hostedSceneAgent(config,fetchImpl).status(owner,input.requestId)).status,'completed');
    await assert.rejects(hostedSceneAgent(config,fetchImpl).status(other,input.requestId),/not found/);
    await assert.rejects(hostedSceneAgent(config,fetchImpl).run(other,input),/not enabled/);
    await assert.rejects(hostedSceneAgent(config,fetchImpl).run(owner,{...input,prompt:'Different'}),/changed/);
    const events=await db.prepare('SELECT * FROM usage_events').all<{kind:string;payload:string}>();assert.equal(events.results.length,1);
    const usage=JSON.parse(events.results[0].payload);assert.deepEqual(usage,{model:'gpt-6.1-sol',input_tokens:1800,cached_input_tokens:200,output_tokens:500});
    assert.ok(!JSON.stringify(events).includes('private-key'));assert.ok(!JSON.stringify(events).includes(input.prompt));
  }finally{close();}
});
test('concurrent or uncertain hosted agent requests never repeat the paid POST',async()=>{
  const {db,close}=sqliteD1();let calls=0;
  const config={DB:db,OPENAI_API_KEY:'private-key',AGENT_ALLOWED_OWNERS:owner,BLACKBLEND_AGENT_TRACING:'off'};
  const input={requestId:crypto.randomUUID(),prompt:'Lift the roof',scene:conceptWoodshed()};
  try{
    const service=hostedSceneAgent(config,(async()=>{calls++;throw Error('lost response');}) as typeof fetch);
    await Promise.allSettled([service.run(owner,input),service.run(owner,input)]);assert.equal(calls,1);
    await assert.rejects(service.run(owner,input));assert.equal(calls,1);
    const status=await service.status(owner,input.requestId);assert.equal(status.status,'unknown');assert.equal(status.reply,null);
    assert.equal(hostedAgentAvailable({...config,AGENT_ALLOWED_OWNERS:''},owner),false);
  }finally{close();}
});

test('abandoned pending requests become uncertain without replay and consumed invalid responses retain usage',async()=>{
  const {db,close}=sqliteD1();let calls=0;
  const config={DB:db,OPENAI_API_KEY:'private-key',AGENT_ALLOWED_OWNERS:owner,BLACKBLEND_AGENT_TRACING:'off'};
  const input={requestId:crypto.randomUUID(),prompt:'Lift the roof',scene:conceptWoodshed()};
  try{
    const service=hostedSceneAgent(config,(async()=>{calls++;return Response.json({status:'incomplete',usage:{input_tokens:100,output_tokens:30}});}) as typeof fetch);
    await assert.rejects(service.run(owner,input),/no retry/i);
    const events=await db.prepare('SELECT * FROM usage_events').all();assert.equal(events.results.length,1);
    await db.prepare("UPDATE agent_requests SET status='pending',created_at=? WHERE request_id=?").bind(new Date(Date.now()-700000).toISOString(),input.requestId).run();
    assert.equal((await service.status(owner,input.requestId)).status,'unknown');
    await assert.rejects(service.run(owner,input));assert.equal(calls,1);
    await assert.rejects(service.run(owner,{...input,requestId:crypto.randomUUID()}),/no retry/i);assert.equal(calls,2);
  }finally{close();}
});
