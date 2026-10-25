import {generationAvailable,generationCommand,generationService,GenerationError,type GenerationConfig} from './generation-service.ts';
import {readJsonBounded} from './request-body.ts';
const headers={'Cache-Control':'private, no-store'};
/** Production routes supply the verified Clerk user. Tests use this same access check. */
export function generationHttp(config:GenerationConfig,resolveOwner:(request:Request)=>Promise<string|null>,fetchImpl=fetch){
  return {
    async GET(request:Request){
      const owner=await resolveOwner(request);if(!owner)return Response.json({error:'Sign in.'},{status:401,headers});
      const url=new URL(request.url),id=url.searchParams.get('id'),workflow=url.searchParams.get('workflowId');
      if(!id&&!workflow)return Response.json({available:generationAvailable(config,owner),mode:'operator-preview',billing:'not-enabled',
        reason:generationAvailable(config,owner)?null:'Hosted generation is not enabled for this account.'},{headers});
      if(!config.DB||!config.BUCKET)return Response.json({error:'Generation storage unavailable.'},{status:503,headers});
      try{const service=generationService(config,fetchImpl);return Response.json({generation:id?await service.read(owner,id):await service.forWorkflow(owner,workflow!)},{headers});}
      catch{return Response.json({error:'Generation not found.'},{status:404,headers});}
    },
    async POST(request:Request){
      const owner=await resolveOwner(request);if(!owner)return Response.json({error:'Sign in.'},{status:401,headers});
      if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin.'},{status:403,headers});
      if(!config.DB||!config.BUCKET)return Response.json({error:'Generation storage unavailable.'},{status:503,headers});
      try{
        const command=generationCommand.parse(await readJsonBounded(request,9_000_000)),service=generationService(config,fetchImpl);
        let result;
        if(command.action==='prepare'){const {action,...input}=command;void action;result=await service.prepare(owner,input);}
        else if(command.action==='approve')result=await service.approve(owner,command.id,command.inputHash);
        else if(command.action==='cancel')result=await service.cancel(owner,command.id);
        else result=await service.refresh(owner,command.id);
        return Response.json({generation:result},{headers});
      }catch(error){return Response.json({error:error instanceof GenerationError?error.message:'The generation action could not be completed. Refresh its status before trying again.'},{status:400,headers});}
    },
  };
}
