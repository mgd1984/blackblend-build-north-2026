import { createHash } from 'node:crypto';
const DESKTOP='http://127.0.0.1:4317';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const run=/^run-[A-Za-z0-9_-]{1,100}$/;
export async function prepareSceneApproval(input,{fetchImpl=fetch}={}){
 if(!uuid.test(input.siteWorkflowId??''))throw Error('A saved workflow is required.');
 if(typeof input.source!=='string'||!/^data:video\/mp4;base64,[A-Za-z0-9+/]+=*$/.test(input.source)||input.source.length>34_000_000)throw Error('A reviewed MP4 under 25 MB is required.');
 const bytes=Buffer.from(input.source.split(',')[1],'base64');
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(!bytes.length||bytes.length>25_000_000||hash!==input.expectedSourceHash)throw Error('The animation differs from the reviewed source.');
 const config=await fetchImpl(DESKTOP+'/api/config',{redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>null);
 if(!config?.ok)throw Error('Start the desktop execution adapter to prepare an approval.');
 const settings=await config.json();
 if(typeof settings.token!=='string'||!/^[a-f0-9]{64}$/.test(settings.token))throw Error('The desktop adapter returned an invalid session.');
 const response=await fetchImpl(DESKTOP+'/api/workflows',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':settings.token},body:JSON.stringify({source:input.source,prompt:input.prompt,resolution:input.resolution,images:input.images??[],siteWorkflowId:input.siteWorkflowId}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok){await response.body?.cancel();throw Error('Could not prepare the approval. No generation was submitted.');}
 const proposal=await response.json();
 if(!uuid.test(proposal.id??'')||proposal.sourceHash!==hash||proposal.siteWorkflowId!==input.siteWorkflowId)throw Error('The approval did not match this source.');
 return {id:proposal.id,sourceHash:hash,inputHash:proposal.inputHash,approvalUrl:DESKTOP+'/workflow.html?id='+proposal.id,referenceCount:proposal.referenceCount,status:proposal.status};
}
export async function readSceneExecution(kind,id,{fetchImpl=fetch}={}){
 if(!['proposal','job','result'].includes(kind)||!(kind==='proposal'?uuid:run).test(id??''))throw Error('Invalid execution reference.');
 const target=kind==='proposal'?'/api/workflows/'+id:kind==='job'?'/api/jobs':'/media/'+id;
 const response=await fetchImpl(DESKTOP+target,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){await response.body?.cancel();throw Error('The desktop execution record is unavailable.');}
 if(kind==='result')return response;
 const value=await response.json();
 if(kind==='proposal')return {id:value.id,status:value.status,sourceHash:value.sourceHash,siteWorkflowId:value.siteWorkflowId,jobId:value.jobId??null};
 const job=value.find(j=>j.id===id);
 if(!job)throw Error('Job not found.');
 return {id:job.id,status:job.status,error:job.error??null,totalSeconds:job.totalSeconds??null,processingSeconds:job.processingSeconds??null,hasVideo:job.status==='completed'&&!!job.video};
}
