import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createWorkflowStore} from '../workflow.mjs';
async function setup(submit){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bb-flow-'));return {root,store:await createWorkflowStore({root,submit})};}
const input={prompt:'A native assembly with reviewed materials.',resolution:'480P',source:'data:video/mp4;base64,'+Buffer.from('synthetic fixture').toString('base64')};
test('preparation never submits; approval binds inputs and one request',async t=>{let calls=0;const {root,store}=await setup(async()=>{calls++;return{id:'run-test'};});t.after(()=>fs.rm(root,{recursive:true,force:true}));const p=await store.prepare(input);assert.equal(calls,0);await assert.rejects(store.approve(p.id,'changed'),/Inputs changed/);assert.equal(calls,0);const r=await store.approve(p.id,p.inputHash);assert.equal(r.status,'submitted');assert.equal(calls,1);await store.approve(p.id,p.inputHash);assert.equal(calls,1);});
test('ambiguous submit survives restart and cannot retry',async t=>{let calls=0;const {root,store}=await setup(async()=>{calls++;throw Error('network');});t.after(()=>fs.rm(root,{recursive:true,force:true}));const p=await store.prepare(input);assert.equal((await store.approve(p.id,p.inputHash)).status,'unknown');const restarted=await createWorkflowStore({root,submit:async()=>{calls++;}});await restarted.approve(p.id,p.inputHash);assert.equal(calls,1);});
test('source drift fails before billing',async t=>{let calls=0;const {root,store}=await setup(async()=>{calls++;});t.after(()=>fs.rm(root,{recursive:true,force:true}));const p=await store.prepare(input);await fs.writeFile(path.join(root,p.id+'.mp4'),'changed');await assert.rejects(store.approve(p.id,p.inputHash),/Source changed/);assert.equal(calls,0);});

test('HTTP approval creates one mocked provider job and a paired result',async t=>{
 const {createApp}=await import('../server.mjs');const {root}=await setup(async()=>{});let calls=0;
 const app=await createApp({runsDir:root,getFalKey:async()=>'test-only',falFactory:()=>({submit:async(input,job,save)=>{calls++;job.sourceFilename='source.mp4';await fs.writeFile(path.join(job.directory,'source.mp4'),input.bytes);await save(job);return 'mock-remote';},status:async()=>({status:'COMPLETED'}),result:async()=>({video:{url:'https://v3.fal.media/fixture.mp4'}}),download:async(_,file)=>fs.writeFile(file,Buffer.from('\0\0\0\x18ftypisom synthetic'))})});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>app.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.address().port,{token}=await(await fetch(base+'/api/config')).json();
 const post=(url,body,extra={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token,...extra},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/workflow.html')).status,200);assert.match((await fetch(base+'/workflow.js')).headers.get('content-type'),/javascript/);
 const proposal=await(await post('/api/workflows',input)).json();assert.equal(calls,0);
 assert.equal((await post('/api/workflows/'+proposal.id+'/approve',{inputHash:proposal.inputHash})).status,400);
 assert.equal((await post('/api/workflows/'+proposal.id+'/approve',{confirm:true,inputHash:proposal.inputHash},{Origin:'https://evil.invalid'})).status,403);
 const approved=await(await post('/api/workflows/'+proposal.id+'/approve',{confirm:true,inputHash:proposal.inputHash})).json();assert.equal(approved.status,'submitted');
 await post('/api/workflows/'+proposal.id+'/approve',{confirm:true,inputHash:proposal.inputHash});
 let job;for(let i=0;i<60;i++){job=(await(await fetch(base+'/api/jobs')).json()).find(j=>j.id===approved.jobId);if(job?.status==='completed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(calls,1);assert.equal(job.status,'completed');assert.ok(job.source);assert.ok(job.video);
});
