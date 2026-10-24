import {env} from 'cloudflare:workers';
import {requestOwner} from '../../../lib/identity';
import {generationService,type GenerationConfig} from '../../../lib/generation-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const owner=await requestOwner(request);if(!owner)return new Response('Sign in.',{status:401});
  try{
    const url=new URL(request.url),object=await generationService(env as GenerationConfig).media(owner,url.searchParams.get('id')??'',url.searchParams.get('kind')??'');
    return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'application/octet-stream',
      'Content-Length':String(object.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Media not found.',{status:404});}
}
