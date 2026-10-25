import { createFalClient } from '@fal-ai/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const FAL_MODEL = 'minimax/h3-max/3d-to-video';
const QUEUE = 'https://queue.fal.run';
const exec = promisify(execFile);

export function validateFalInput(body) {
  if (!/^[a-f0-9-]{36}$/.test(body.requestId ?? '')) throw new Error('Invalid request ID.');
  if (typeof body.animation !== 'string' || body.animation.length > 67_000_100 || !/^data:video\/(mp4|quicktime|webm);base64,[A-Za-z0-9+/]+=*$/.test(body.animation)) throw new Error('Choose an MP4, MOV or WebM under 50 MB.');
  const bytes = Buffer.from(body.animation.split(',')[1], 'base64');
  if (!bytes.length || bytes.length > 50_000_000) throw new Error('Animation must be under 50 MB.');
  if (!['480P','768P','1080P'].includes(body.resolution ?? '768P')) throw new Error('Invalid resolution.');
  if (typeof (body.prompt ?? '') !== 'string' || (body.prompt ?? '').length > 12000) throw new Error('Prompt too long.');
  const maxImages = body.maxGeneratedReferenceImages ?? 2;
  if (!Number.isInteger(maxImages) || maxImages < 0 || maxImages > 2) throw new Error('Reference image limit must be 0–2.');
  const images = body.images === undefined ? (body.image ? [body.image] : []) : body.images;
  if (!Array.isArray(images) || images.length > 6 || images.some(image => typeof image !== 'string' || image.length > 10_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image))) throw new Error('Choose up to 6 PNG, JPEG or WebP references under 7.4 MB each.');
  return { bytes, mime: body.animation.slice(5, body.animation.indexOf(';')), prompt: (body.prompt ?? '').trim(), resolution: body.resolution ?? '768P', maxImages, images, image: images[0] };
}
export async function probeAnimation(filename) {
  let stdout;
  try { ({stdout} = await exec(process.env.FFPROBE_PATH || 'ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',filename], {timeout:15000,maxBuffer:1024*1024})); }
  catch { throw new Error('Could not inspect the video. Install ffmpeg or choose a valid video file.'); }
  const data = JSON.parse(stdout);
  const duration = Number(data.format?.duration);
  if (!data.streams?.some(s=>s.codec_type==='video') || !Number.isFinite(duration) || duration <= 0 || duration > 15.05) throw new Error('Use a video of 15 seconds or less.');
  return duration;
}
function validId(id) { if (!/^[A-Za-z0-9_-]+$/.test(id ?? '')) throw new Error('Invalid fal request ID.'); return id; }
export function createFalProvider(key, { fetchImpl = fetch, client = createFalClient({credentials:key,retry:{maxRetries:0}}) } = {}) {
  async function queue(route, input) {
    const response = await fetchImpl(QUEUE + route, { method: input === undefined ? 'GET' : 'POST', headers:{Authorization:`Key ${key}`,...(input === undefined ? {} : {'Content-Type':'application/json'})}, body: input === undefined ? undefined : JSON.stringify(input), redirect:'error',signal:AbortSignal.timeout(60000)});
    if (!response.ok) { const error = new Error(`fal HTTP ${response.status}.`); error.status=response.status; throw error; }
    return response.json();
  }
  return {
    async submit(input, job, save) {
      const extension = input.mime === 'video/quicktime' ? '.mov' : input.mime === 'video/webm' ? '.webm' : '.mp4';
      const filename = path.join(job.directory,'source'+extension);
      await fs.writeFile(filename,input.bytes,{mode:0o600});
      job.sourceFilename = path.basename(filename);
      job.duration = await probeAnimation(filename);
      job.status='uploading'; await save(job);
      const videoUrl = await client.storage.upload(new File([input.bytes],'animation'+extension,{type:input.mime}));
      const payload={video_url:videoUrl,resolution:input.resolution,max_generated_reference_images:input.maxImages,enable_safety_checker:true};
      if (input.prompt) payload.prompt=input.prompt;
      const references=input.images ?? (input.image?[input.image]:[]);
      if(references.length){
        payload.reference_image_urls=[];
        for(const [i,image] of references.entries()){
          const [header,base64]=image.split(',');const mime=header.slice(5,header.indexOf(';'));
          payload.reference_image_urls.push(await client.storage.upload(new File([Buffer.from(base64,'base64')],`reference-${i+1}.`+mime.split('/')[1],{type:mime})));
        }
      }
      await fs.writeFile(path.join(job.directory,'fal-request.json'),JSON.stringify(payload,null,2),{mode:0o600});
      // Save that submission is starting before making the one paid request.
      job.status='submitting'; job.submissionAttempted=true;await save(job);
      const result=await queue('/'+FAL_MODEL,payload);
      return validId(result.request_id);
    },
    async status(id) {return queue(`/minimax/h3-max/requests/${validId(id)}/status`);},
    async result(id) {return queue(`/minimax/h3-max/requests/${validId(id)}`);},
    async download(url, filename) {
      const target=new URL(url);
      if(target.protocol!=='https:' || !target.hostname.endsWith('.fal.media') || target.username || target.password) throw new Error('Unexpected fal output host.');
      const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(120000)});
      if(!response.ok || !response.body) throw new Error('Video download failed.');
      const file=await fs.open(filename,'wx',0o600);
      const reader=response.body.getReader();let prefix=Buffer.alloc(0),valid=false;
      try {while(true){const {done,value}=await reader.read();if(done)break;const block=Buffer.from(value);if(!valid){prefix=Buffer.concat([prefix,block]);if(prefix.length<64)continue;if(!prefix.subarray(0,64).includes(Buffer.from('ftyp')))throw new Error('Invalid MP4 result.');await file.writeFile(prefix);valid=true;}else await file.writeFile(block);}if(!valid)throw new Error('Truncated MP4 result.');}
      finally{await file.close();await reader.cancel().catch(()=>{});}
    }
  };
}
