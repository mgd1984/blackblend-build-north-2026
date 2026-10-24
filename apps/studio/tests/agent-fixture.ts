export function agentResponse(output:unknown[],usage={input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:0}}){
 return Response.json({id:'resp_'+crypto.randomUUID().replaceAll('-',''),object:'response',created_at:Math.floor(Date.now()/1000),status:'completed',model:'gpt-6.1-sol',output,usage});
}
export const agentMessage=(text='Review this candidate.')=>({id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]});
export const agentCall=(name:string,args:unknown)=>({id:'fc_'+crypto.randomUUID(),type:'function_call',call_id:'call_'+crypto.randomUUID(),name,arguments:JSON.stringify(args),status:'completed'});
