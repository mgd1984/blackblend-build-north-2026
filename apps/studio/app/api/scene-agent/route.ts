import {env} from 'cloudflare:workers';
import {requestOwner} from '../../../lib/identity';
import {hostedAgentAvailable,hostedSceneAgent,type AgentConfig} from '../../../lib/hosted-scene-agent';
import {readJsonBounded} from '../../../lib/request-body';
import {geometryAvailable} from '../../../lib/hosted-geometry';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
  const owner=await requestOwner(request),config=env as AgentConfig;
  if(!owner)return Response.json({available:false,mode:'hosted',reason:'Sign in to use the scene agent.'},{headers});
  const id=new URL(request.url).searchParams.get('id');
  if(id){try{return Response.json(await hostedSceneAgent(config).status(owner,id),{headers});}
    catch{return Response.json({error:'Request not found.'},{status:404,headers});}}
  const available=hostedAgentAvailable(config,owner);
  return Response.json({available,mode:'hosted',nativeGeometry:available&&geometryAvailable(config,owner),model:config.BLACKBLEND_AGENT_MODEL||'gpt-6.1-sol',
    reason:available?null:'The scene agent is not enabled for this account.'},{headers});
}
export async function POST(request:Request){
  const owner=await requestOwner(request);if(!owner)return Response.json({error:'Sign in.'},{status:401,headers});
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin.'},{status:403,headers});
  const config=env as AgentConfig;if(!hostedAgentAvailable(config,owner))return Response.json({error:'The scene agent is not enabled for this account.'},{status:403,headers});
  try{return Response.json(await hostedSceneAgent(config).run(owner,await readJsonBounded(request,9_000_000)),{headers});}
  catch(error){return Response.json({error:error instanceof Error&&error.name!=='ZodError'?error.message:'Invalid scene request.'},{status:400,headers});}
}
