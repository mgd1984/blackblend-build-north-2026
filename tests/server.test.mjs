import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp,validateInput,timing} from '../server.mjs';
import {cadDir, demoDir} from './fixtures.mjs';

test('validates image, prompt and rejects unverified video input',()=>{
 assert.throws(()=>validateInput({prompt:' ',requestId:randomUUID()}));
 assert.throws(()=>validateInput({prompt:'dog',video:'data:video/mp4;base64,AAAA',requestId:randomUUID()}),/not verified/);
 assert.throws(()=>validateInput({prompt:'dog',image:'https://untrusted',requestId:randomUUID()}));
 assert.equal(timing({started_at:'2026-10-19T21:54:07Z',completed_at:'2026-10-19T21:54:15Z'}),8);
});

test('local UI lifecycle, duplicate submission, origin checks, media range and restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'blackblend-ui-'));
 let posts=0,reads=0;
 const options={cadDir,demoDir,runsDir:dir,getKey:async()=> 'hidden-key',pollMs:1,
 remote:async(url,key,opts={})=>{
  assert.equal(key,'hidden-key');
  if(opts.payload){posts++;assert.equal(opts.payload.model,'MiniMax-H3-FL2VA-LightX2V');return Response.json({id:'job-1',status:'queued'});}
  reads++;return Response.json({id:'job-1',status:'completed',started_at:'2026-10-19T21:54:07Z',completed_at:'2026-10-19T21:54:15Z',duration_seconds:5,resolution:'768p'});
 },fetchVideo:async(id,key,file)=>fs.writeFile(file,Buffer.concat([Buffer.from('\0\0\0\x18ftypisom'),Buffer.alloc(100)]))};
 let app=await createApp(options);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 let base=`http://127.0.0.1:${app.address().port}`;
 try{
  const entry=await fetch(base,{redirect:'manual'});assert.equal(entry.status,302);assert.equal(entry.headers.get('location'),'http://127.0.0.1:4331/studio');
  for (const retired of ['/app.js','/compare.js','/style.css']) assert.equal((await fetch(base+retired)).status,404);
  const examples=await(await fetch(base+'/api/examples')).json();assert.equal(examples.length,1);
  assert.ok(examples.every(x=>!JSON.stringify(x).includes('/Users/')));
  const still=await fetch(base+examples[0].image);assert.equal(still.status,200);assert.equal(still.headers.get('content-type'),'image/png');await still.arrayBuffer();
  const source=await fetch(base+examples[0].video,{headers:{Range:'bytes=0-63'}});assert.equal(source.status,206);assert.equal((await source.arrayBuffer()).byteLength,64);
  assert.equal(posts,0);assert.equal(reads,0);
  assert.equal((await fetch(base+'/examples/manifest.json')).status,404);
  const {token}=await(await fetch(base+'/api/config')).json();
  const body={requestId:randomUUID(),prompt:'dog'};
  assert.equal((await fetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
  assert.equal((await fetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token,Origin:'https://untrusted.example'},body:JSON.stringify(body)})).status,403);
  const send=()=>fetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify(body)});
  const job=await(await send()).json();assert.equal((await(await send()).json()).id,job.id);
  let result;
  for(let i=0;i<100;i++){
   [result]=await(await fetch(base+'/api/jobs')).json();
   if(result.status==='completed' && result.video)break;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(result.status,'completed');assert.equal(result.processingSeconds,8);assert.ok(result.totalSeconds>=0);assert.equal(posts,1);assert.equal(reads,1);
  assert.ok(!JSON.stringify(result).includes('hidden-key'));
  const media=await fetch(base+result.video,{headers:{Range:'bytes=0-11'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,12);
  await fs.writeFile(path.join(dir,result.id,'source.mp4'),Buffer.from('source-video-fixture'));
  await new Promise(resolve=>app.close(resolve));
  app=await createApp(options);await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${app.address().port}`;
  const saved=await(await fetch(base+'/api/jobs')).json();assert.equal(saved[0].status,'completed');assert.ok(saved[0].video);assert.equal(posts,1);
  assert.equal(saved[0].source,`/source/${result.id}`);
  const input=await fetch(base+saved[0].source,{headers:{Range:'bytes=0-5'}});assert.equal(input.status,206);assert.equal(await input.text(),'source');
  const demo=await fetch(base+'/demo/ptz-source.mp4',{headers:{Range:'bytes=0-11'}});assert.equal(demo.status,206);assert.equal((await demo.arrayBuffer()).byteLength,12);
  assert.equal((await fetch(base+'/demo/manifest.json')).status,404);
 }finally{await new Promise(resolve=>app.close(resolve));await fs.rm(dir,{recursive:true});}
});
