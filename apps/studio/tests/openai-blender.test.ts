import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openaiBlender,nativeCommand,cleanupOpenaiBlender,type NativeProviderReceipt} from '../lib/openai-blender.ts';
import {digest} from '../lib/media-inspection.ts';
const archive=new TextEncoder().encode('fixed trusted tool archive').buffer;
function fake({lost=false,unexpected=false,tooLarge=false}={}){
 const calls:{method:string;path:string;body?:Record<string,unknown>}[]=[];let uploads=0,command='';
 const fetchImpl:typeof fetch=async(raw,options)=>{
  const url=new URL(typeof raw==='string'?raw:raw instanceof URL?raw:raw.url),method=options?.method??'GET';
  const body=typeof options?.body==='string'?JSON.parse(options.body):undefined;calls.push({method,path:url.pathname,body});
  if(url.pathname==='/v1/containers'&&method==='POST')return Response.json({id:'cntr_test'});
  if(url.pathname==='/v1/containers/cntr_test'&&method==='DELETE')return new Response(null,{status:204});
  if(url.pathname==='/v1/containers/cntr_test/files'&&method==='POST'&&body?.file_id)return Response.json({id:'cfile_runtime',path:'/mnt/data/runtime.tar.xz'});
  if(url.pathname==='/v1/containers/cntr_test/files'&&method==='POST')return Response.json({id:'cfile_'+(++uploads),path:uploads===1?'/mnt/data/input.bin':'/mnt/data/tool.zip'});
  if(url.pathname==='/v1/containers/cntr_test/files')return Response.json({object:'list',data:[{id:'cfile_runtime',path:'/mnt/data/runtime.tar.xz',bytes:440914356},{id:'cfile_result',path:'/mnt/data/result.bin',bytes:tooLarge?51_000_000:8}],has_more:false});
  if(url.pathname==='/v1/responses'&&method==='POST'){command=String(body?.input);if(lost)throw new TypeError('Connection interrupted after submission');return Response.json({id:'resp_test',status:'queued'});}
  if(url.pathname==='/v1/responses/resp_test')return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{id:'sh_test',type:'shell_call',call_id:'call_test',status:'completed',action:{commands:[unexpected?'ls -la':command]}},{id:'out_test',type:'shell_call_output',call_id:'call_test',output:[{stdout:'',stderr:'',outcome:{type:'exit',exit_code:0}}]}]});
  if(url.pathname==='/v1/containers/cntr_test/files/cfile_result/content')return new Response(new Uint8Array([1,2,3,4,5,6,7,8]));
  throw Error('Unexpected API path '+method+' '+url.pathname);
 };
 return {fetchImpl,calls};
}
async function options(fetchImpl:typeof fetch,checkpoint:(r:NativeProviderReceipt)=>Promise<void>){return {apiKey:'test-key-do-not-upload',runtimeFileId:'file-runtime',toolArchive:archive,toolHash:await digest(archive),fetchImpl,checkpoint,wait:async()=>{}};}
test('OpenAI native shell is offline, fixed-command and background with durable resource receipts',async()=>{
 const s=fake(),receipts:NativeProviderReceipt[]=[];
 const config=await options(s.fetchImpl,async r=>{receipts.push(structuredClone(r));});
 assert.equal((await openaiBlender(new Uint8Array([1]),config)).byteLength,8);
 const create=s.calls.find(x=>x.path==='/v1/containers'&&x.method==='POST')!;assert.deepEqual(create.body?.network_policy,{type:'disabled'});assert.equal(create.body?.memory_limit,'4g');
 const request=s.calls.find(x=>x.path==='/v1/responses'&&x.method==='POST')!;assert.equal(request.body?.model,'gpt-6.1-sol');assert.equal(request.body?.background,true);assert.equal(request.body?.store,true);
 assert.ok(receipts.some(r=>r.responseId==='resp_test'));assert.deepEqual(receipts.at(-1)?.usage,{input_tokens:100,output_tokens:20});
 assert.ok(!JSON.stringify(s.calls).includes(config.apiKey));assert.equal(s.calls.filter(x=>x.path==='/v1/responses'&&x.method==='POST').length,1);
 assert.match(String(request.body?.input),/O_EXCL/);assert.match(String(request.body?.input),/checksum mismatch/);assert.match(String(request.body?.input),/finally:\n shutil\.rmtree\('/);
 assert.match(String(request.body?.input),/result\.bin/);
 assert.equal(await cleanupOpenaiBlender(config.apiKey,receipts.at(-1)!,s.fetchImpl),'deleted');
});
test('resuming a saved response only reads its existing job; ambiguous submission is never repeated',async()=>{
 const s=fake(),receipts:NativeProviderReceipt[]=[];
 const config=await options(s.fetchImpl,async r=>{receipts.push(structuredClone(r));});await openaiBlender(new Uint8Array([1]),config);
 const receipt=receipts.at(-1)!;s.calls.length=0;
 await openaiBlender(undefined,{...config,receipt});assert.ok(s.calls.every(c=>c.method==='GET'));
 const lost=fake({lost:true});let uncertain:NativeProviderReceipt={};const retry=await options(lost.fetchImpl,async r=>{uncertain=r;});
 await assert.rejects(openaiBlender(new Uint8Array([1]),retry));assert.ok(uncertain.containerId);assert.equal(uncertain.responseId,undefined);
 await assert.rejects(openaiBlender(new Uint8Array([1]),{...retry,receipt:uncertain}),/reconciliation/);
 assert.equal(lost.calls.filter(c=>c.path==='/v1/responses'&&c.method==='POST').length,1);
});
test('reject altered tool archives, unexpected commands, oversized output and unsafe container paths',async()=>{
 const s=fake();const config=await options(s.fetchImpl,async()=>{});
 await assert.rejects(openaiBlender(new Uint8Array([1]),{...config,toolHash:'f'.repeat(64)}),/Unrecognized/);assert.equal(s.calls.length,0);
 for(const scenario of [{unexpected:true},{tooLarge:true}]){const bad=fake(scenario);await assert.rejects(openaiBlender(new Uint8Array([1]),await options(bad.fetchImpl,async()=>{})));}
 assert.throws(()=>nativeCommand('/mnt/data/runtime.tar.xz',"/mnt/data/a'; curl bad",'/mnt/data/input.bin','a'.repeat(64)),/Unexpected/);
 assert.throws(()=>nativeCommand('/mnt/data/../runtime.tar.xz','/mnt/data/tool.zip','/mnt/data/input.bin','a'.repeat(64)),/Unexpected/);
});
