import {env} from 'cloudflare:workers';
import {requestOwner} from '../../../lib/identity';
import {geometryArtifact,geometryRecord,type GeometryConfig} from '../../../lib/hosted-geometry';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const owner=await requestOwner(request);if(!owner)return new Response('Sign in.',{status:401});
 const url=new URL(request.url),id=url.searchParams.get('id')??'',kind=url.searchParams.get('kind')??'model',config=env as GeometryConfig;
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 try{
  if(kind==='status'){const row=await geometryRecord(config,owner,id);return Response.json({id,status:row.status,error:row.error,executionMs:row.execution_ms,report:row.report?JSON.parse(row.report):null},{headers});}
  const object=await geometryArtifact(config,owner,id,kind);
  return new Response(object.body,{headers:{...headers,'Content-Type':kind==='model'?'model/gltf-binary':kind==='blend'?'application/octet-stream':'application/json',...(kind==='blend'?{'Content-Disposition':'attachment; filename="woodshed-window.blend"'}:{})}});
 }catch{return new Response('Native revision not found.',{status:404,headers});}
}
