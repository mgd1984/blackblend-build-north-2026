import {z} from 'zod';
import {sceneDocument} from './scene-document.ts';
import {validateWindowEdit,type WindowExecutor} from './window-edit.ts';
import {digest} from './media-inspection.ts';
import {nativeInput,nativeOutput} from './native-packet.ts';
import {openaiBlender,cleanupOpenaiBlender,NativePending,type NativeProviderReceipt} from './openai-blender.ts';

export type GeometryConfig={DB?:D1Database;BUCKET?:R2Bucket;OPENAI_API_KEY?:string;OPENAI_BLENDER_RUNTIME_FILE_ID?:string;NATIVE_TOOL_SHA256?:string;
 NATIVE_GEOMETRY_ENABLED?:string;NATIVE_ALLOWED_OWNERS?:string;NATIVE_DAILY_LIMIT?:string;};
export type GeometryRow={id:string;owner:string;request_id:string;input_hash:string;input:string;status:string;document:string|null;report:string|null;error:string|null;execution_ms:number|null;created_at:string;updated_at:string;provider_receipt:string|null};
const uuid=z.string().uuid();
export function geometryAvailable(config:GeometryConfig,owner:string){return config.NATIVE_GEOMETRY_ENABLED==='true'&&!!config.DB&&!!config.BUCKET&&!!config.OPENAI_API_KEY&&/^file-/.test(config.OPENAI_BLENDER_RUNTIME_FILE_ID??'')&&/^[a-f0-9]{64}$/.test(config.NATIVE_TOOL_SHA256??'')&&(config.NATIVE_ALLOWED_OWNERS??'').split(',').map(x=>x.trim()).includes(owner);}
export async function geometryRecord(config:GeometryConfig,owner:string,id:string){
 uuid.parse(id);const row=await config.DB?.prepare('SELECT * FROM native_geometry WHERE id=? AND owner=?').bind(id,owner).first<GeometryRow>();
 if(!row)throw Error('Native revision not found.');return row;
}
const geometryKey=(id:string,kind:string)=>`scene-geometry/${id}/${kind==='model'?'woodshed.glb':kind==='blend'?'scene.blend':kind==='document'?'document.json':'report.json'}`;
export async function geometryArtifact(config:GeometryConfig,owner:string,id:string,kind:string){
 if(!['model','blend','document','report'].includes(kind))throw Error('Invalid native artifact.');
 const row=await geometryRecord(config,owner,id);if(row.status!=='completed')throw Error('Native revision is not complete.');
 const object=await config.BUCKET?.get(geometryKey(id,kind));if(!object)throw Error('Native artifact unavailable.');return object;
}
export type NativeDispatch=(id:string)=>Promise<void>;
export function hostedWindowExecutor(config:GeometryConfig,owner:string,requestId:string,options:{dispatch?:NativeDispatch;fetchImpl?:typeof fetch;baseRevision?:number}={}):WindowExecutor{
 return async(scene,raw)=>{
  if(!geometryAvailable(config,owner))throw Error('Hosted native editing is not enabled for this account.');
  uuid.parse(requestId);scene=sceneDocument.parse(scene);const {edit}=validateWindowEdit(scene,raw);
  let sourceKey='scene-assets/woodshed-source.blend';
  if(scene.geometry){const previous=await geometryRecord(config,owner,scene.geometry.id);if(previous.status!=='completed')throw Error('Native source revision is not complete.');sourceKey=geometryKey(previous.id,'blend');}
  if(!await config.BUCKET!.head(sourceKey))throw Error('The private native source is not provisioned on this host.');
  const input=JSON.stringify({scene,edit,sourceKey,baseRevision:options.baseRevision??scene.revision}),hash=await digest(new TextEncoder().encode(input));
  const previous=await config.DB!.prepare('SELECT * FROM native_geometry WHERE owner=? AND request_id=?').bind(owner,requestId).first<GeometryRow>();
  const result=(row:GeometryRow)=>{
   if(row.input_hash!==hash)throw Error('Native request inputs changed.');
   if(row.status!=='completed'||!row.document||!row.report)throw Error(row.error??'Native edit is pending. Inspect the existing receipt; do not resubmit.');
   return {scene:sceneDocument.parse(JSON.parse(row.document)),report:JSON.parse(row.report)};
  };
  if(previous)return result(previous);
  const id=crypto.randomUUID(),now=new Date().toISOString(),since=new Date(Date.now()-86400000).toISOString();
  const requestedLimit=Number(config.NATIVE_DAILY_LIMIT??10),limit=Number.isInteger(requestedLimit)?Math.min(20,Math.max(1,requestedLimit)):10;
  const claim=await config.DB!.prepare(`INSERT INTO native_geometry(id,owner,request_id,input_hash,input,status,created_at,updated_at)
   SELECT ?,?,?,?,?,'pending',?,? WHERE (SELECT COUNT(*) FROM native_geometry WHERE owner=? AND created_at>?)<?
   AND NOT EXISTS(SELECT 1 FROM native_geometry WHERE owner=? AND status IN ('pending','running','unknown')) ON CONFLICT(owner,request_id) DO NOTHING`)
   .bind(id,owner,requestId,hash,input,now,now,owner,since,limit,owner).run();
  if(!claim.meta.changes){const existing=await config.DB!.prepare('SELECT * FROM native_geometry WHERE owner=? AND request_id=?').bind(owner,requestId).first<GeometryRow>();if(existing)return result(existing);throw Error('A native edit needs reconciliation, or the daily native-edit limit was reached.');}
  // Start once. Read the same background response if the browser disconnects.
  try{await (options.dispatch??(id=>runOpenaiGeometryJob(config,id,options.fetchImpl)))(id);}
  catch{/* Inspect the persisted outcome, never repeat an uncertain native request. */}
  return result(await geometryRecord(config,owner,id));
 };
}

export class NativeRejection extends Error{}
export async function runGeometryJob(config:GeometryConfig,id:string,execute:(body:Uint8Array)=>Promise<ArrayBuffer>){
 uuid.parse(id);const db=config.DB!,bucket=config.BUCKET!;
 const row=await db.prepare('SELECT * FROM native_geometry WHERE id=?').bind(id).first<GeometryRow>();
 if(!row)throw Error('Native job not found.');
 const claim=await db.prepare("UPDATE native_geometry SET status='running',updated_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(),id).run();
 if(!claim.meta.changes)return;
 const started=Date.now();
 try{
  const input=JSON.parse(row.input),scene=sceneDocument.parse(input.scene),{edit}=validateWindowEdit(scene,input.edit);
  // The server chooses storage keys when creating the job; the model cannot choose them.
  const source=await bucket.get(input.sourceKey);if(!source||source.size>25_000_000)throw new NativeRejection('Native source unavailable or too large.');
  const output=await nativeOutput(await execute(nativeInput(scene,edit,await source.arrayBuffer())),edit.partId);
  await saveGeometryOutput(config,id,scene,edit,output,started);
 }catch(error){
  if(error instanceof NativePending)return;
  const rejected=error instanceof NativeRejection;
  await db.prepare('UPDATE native_geometry SET status=?,error=?,execution_ms=?,updated_at=? WHERE id=? AND status=\'running\'')
   .bind(rejected?'failed':'unknown',rejected?error.message:'Native outcome requires reconciliation. No automatic retry was made.',Date.now()-started,new Date().toISOString(),id).run();
 }
}

async function saveGeometryOutput(config:GeometryConfig,id:string,scene:import('./scene-document.ts').SceneDocument,edit:import('./window-edit.ts').WindowEdit,output:Awaited<ReturnType<typeof nativeOutput>>,started:number){
 const db=config.DB!,bucket=config.BUCKET!;
 const candidate=sceneDocument.parse({...scene,geometry:{id,...edit},assumptions:[...new Set([...scene.assumptions,'Window opening is a visualization edit; framing and structural performance require engineering review.'])].slice(-30)});
  await Promise.all([
   bucket.put(geometryKey(id,'model'),output.model,{httpMetadata:{contentType:'model/gltf-binary'}}),
   bucket.put(geometryKey(id,'blend'),output.blend,{httpMetadata:{contentType:'application/octet-stream'}}),
   bucket.put(geometryKey(id,'document'),JSON.stringify(candidate),{httpMetadata:{contentType:'application/json'}}),
   bucket.put(geometryKey(id,'report'),JSON.stringify(output.report),{httpMetadata:{contentType:'application/json'}}),
  ]);
  await db.prepare("UPDATE native_geometry SET status='completed',document=?,report=?,execution_ms=?,updated_at=? WHERE id=? AND status IN ('running','unknown')")
   .bind(JSON.stringify(candidate),JSON.stringify(output.report),Date.now()-started,new Date().toISOString(),id).run();

}
export async function runOpenaiGeometryJob(config:GeometryConfig,id:string,fetchImpl=fetch){
 const row=await config.DB!.prepare('SELECT * FROM native_geometry WHERE id=?').bind(id).first<GeometryRow>();if(!row)throw Error('Native job not found.');
 const checkpoint=async(receipt:NativeProviderReceipt)=>{await config.DB!.prepare('UPDATE native_geometry SET provider_receipt=?,updated_at=? WHERE id=?').bind(JSON.stringify(receipt),new Date().toISOString(),id).run();};
 const execute=async(body:Uint8Array|undefined)=>{let toolArchive=new ArrayBuffer(0);if(body){const tool=await config.BUCKET!.get('scene-tools/blender-window-v1.zip');if(!tool||tool.size>100000)throw new NativeRejection('Native tool archive is not provisioned.');toolArchive=await tool.arrayBuffer();}
  return openaiBlender(body,{apiKey:config.OPENAI_API_KEY!,runtimeFileId:config.OPENAI_BLENDER_RUNTIME_FILE_ID!,toolArchive,toolHash:config.NATIVE_TOOL_SHA256!,fetchImpl,checkpoint,receipt:row.provider_receipt?JSON.parse(row.provider_receipt):undefined});};
 if(['running','unknown'].includes(row.status)&&row.provider_receipt){
  const receipt=JSON.parse(row.provider_receipt) as NativeProviderReceipt;
  if(!receipt.responseId)return; // Ambiguous starts require operator reconciliation.
  const input=JSON.parse(row.input),scene=sceneDocument.parse(input.scene),{edit}=validateWindowEdit(scene,input.edit);
  const output=await nativeOutput(await execute(undefined),edit.partId);
  await saveGeometryOutput(config,id,scene,edit,output,Date.parse(row.created_at));
 }else await runGeometryJob(config,id,execute);
 const completed=await config.DB!.prepare('SELECT * FROM native_geometry WHERE id=?').bind(id).first<GeometryRow>();
 if(completed?.status==='completed'&&completed.provider_receipt){const receipt=JSON.parse(completed.provider_receipt) as NativeProviderReceipt;
  if(!receipt.cleanup)await checkpoint({...receipt,cleanup:await cleanupOpenaiBlender(config.OPENAI_API_KEY!,receipt,fetchImpl)});}
}
