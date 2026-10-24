import OpenAI from 'openai';
import {digest} from './media-inspection.ts';

export const BLENDER_RUNTIME_SHA256='84acfd6d72b1864ded92a5cb706b76526517b7e633b84e56609a04285bca390b';
export type NativeProviderReceipt={containerId?:string;responseId?:string;command?:string;usage?:unknown;cleanup?:string};
type Options={apiKey:string;runtimeFileId:string;toolArchive:ArrayBuffer;toolHash:string;fetchImpl?:typeof fetch;checkpoint:(receipt:NativeProviderReceipt)=>Promise<void>;receipt?:NativeProviderReceipt;wait?:(ms:number)=>Promise<void>;deadlineMs?:number};
export class NativePending extends Error{}

// No user prompt, arbitrary URL, command or credential enters this shell environment.
export function nativeCommand(runtime:string,tool:string,input:string,toolHash:string){
 for(const path of [runtime,tool,input])if(!/^\/mnt\/data\/[a-zA-Z0-9._/-]+$/.test(path)||path.includes('..'))throw Error('Unexpected hosted input path.');
 if(!/^[a-f0-9]{64}$/.test(toolHash))throw Error('Invalid tool digest.');
 const work=`runtime=Path(${JSON.stringify(runtime)})
assert hashlib.file_digest(runtime.open('rb'),'sha256').hexdigest()=='${BLENDER_RUNTIME_SHA256}','Runtime checksum mismatch'
with tarfile.open(runtime) as archive:archive.extractall('/mnt/data/runtime',filter='data')
archive=Path(${JSON.stringify(tool)})
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()=='${toolHash}','Tool checksum mismatch'
with zipfile.ZipFile(archive) as bundle:bundle.extractall('/mnt/data/tool')
os.environ['BLENDER_PATH']='/mnt/data/runtime/blender/blender'
os.environ['LD_LIBRARY_PATH']='/mnt/data/runtime/system:/mnt/data/runtime/blender/lib'
sys.path.insert(0,'/mnt/data/tool')
import server
Path('/mnt/data/result.bin').write_bytes(server.execute(Path(${JSON.stringify(input)}).read_bytes()))`;
 const script="from pathlib import Path\nimport hashlib,tarfile,zipfile,os,sys,shutil\nos.close(os.open('/mnt/data/blackblend-execution.claim',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600))\ntry:\n"+work.split('\n').map(line=>' '+line).join('\n')+"\nfinally:\n shutil.rmtree('/mnt/data/runtime',ignore_errors=True)";
 return "python - <<'BLACKBLEND_NATIVE'\n"+script+"\nBLACKBLEND_NATIVE";
}

export async function openaiBlender(body:Uint8Array|undefined,options:Options){
 const {checkpoint}=options,client=new OpenAI({apiKey:options.apiKey,maxRetries:0,timeout:60000,fetch:options.fetchImpl??fetch});
 let receipt:NativeProviderReceipt={...options.receipt};
 const save=async(patch:NativeProviderReceipt)=>{receipt={...receipt,...patch};await checkpoint(receipt);};
 if(!receipt.responseId){
  // A partial or ambiguous start is never dispatched again.
  if(receipt.containerId||!body)throw Error('Native start requires reconciliation.');
  if(await digest(options.toolArchive)!==options.toolHash)throw Error('Unrecognized native tool archive.');
  const container=await client.containers.create({name:'blackblend-native-window',memory_limit:'4g',network_policy:{type:'disabled'},expires_after:{anchor:'last_active_at',minutes:20}});
  await save({containerId:container.id});
  const runtime=await client.containers.files.create(container.id,{file_id:options.runtimeFileId});
  const input=await client.containers.files.create(container.id,{file:new File([body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength) as ArrayBuffer],'input.bin')});
  const tool=await client.containers.files.create(container.id,{file:new File([options.toolArchive],'tool.zip')});
  const command=nativeCommand(runtime.path,tool.path,input.path,options.toolHash);
  await save({command});
  const response=await client.responses.create({model:'gpt-6.1-sol',background:true,store:true,max_output_tokens:1800,parallel_tool_calls:false,reasoning:{effort:'low'},
   instructions:'Execute the supplied exact shell command once. Do not modify it or perform any other command. Do not inspect input files, install packages or access network. Stop on failure; never retry. Return a short exit-status summary.',
   input:command,tools:[{type:'shell',environment:{type:'container_reference',container_id:container.id}}],tool_choice:{type:'shell'}});
  await save({responseId:response.id});
 }
 if(!receipt.containerId||!receipt.responseId||!receipt.command)throw Error('Native receipt is incomplete.');
 const until=Date.now()+(options.deadlineMs??240000),wait=options.wait??(ms=>new Promise(r=>setTimeout(r,ms)));
 let response=await client.responses.retrieve(receipt.responseId);
 while(response.status==='queued'||response.status==='in_progress'){
  if(Date.now()>=until)throw new NativePending('Native edit is running. Check the saved request instead of resubmitting.');
  await wait(2000);response=await client.responses.retrieve(receipt.responseId);
 }
 await save({usage:response.usage});
 const calls=response.output.filter(x=>x.type==='shell_call');
 const outputs=response.output.filter(x=>x.type==='shell_call_output');
 if(response.status!=='completed'||calls.length!==1||calls[0].action.commands.length!==1||calls[0].action.commands[0]!==receipt.command||outputs.length!==1||outputs[0].call_id!==calls[0].call_id||outputs[0].output.length!==1||outputs[0].output.some(x=>x.outcome.type!=='exit'||x.outcome.exit_code!==0))throw Error('Hosted shell did not confirm the fixed native operation.');
 const files=await client.containers.files.list(receipt.containerId,{limit:100});
 const result=files.data.find(f=>f.path==='/mnt/data/result.bin');if(!result||result.bytes>50_010_000)throw Error('Native result is missing or too large.');
 const content=await client.containers.files.content.retrieve(result.id,{container_id:receipt.containerId});
 const length=Number(content.headers.get('content-length'));if(length>50_010_000)throw Error('Native result is too large.');
 const reader=content.body?.getReader();if(!reader)throw Error('Native result is empty.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>50_010_000)throw Error('Native result is too large.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return bytes.buffer;
}
export async function cleanupOpenaiBlender(apiKey:string,receipt:NativeProviderReceipt,fetchImpl=fetch){
 if(!receipt.containerId)return 'not-created';
 try{await new OpenAI({apiKey,maxRetries:0,timeout:30000,fetch:fetchImpl}).containers.delete(receipt.containerId);return 'deleted';}catch{return 'expiry-pending';}
}
