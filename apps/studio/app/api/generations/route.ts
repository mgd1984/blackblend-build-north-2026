import {env} from 'cloudflare:workers';
import {requestOwner} from '../../../lib/identity';
import {generationHttp} from '../../../lib/generation-http';
import type {GenerationConfig} from '../../../lib/generation-service';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>generationHttp(env as GenerationConfig,requestOwner).GET(request);
export const POST=(request:Request)=>generationHttp(env as GenerationConfig,requestOwner).POST(request);
