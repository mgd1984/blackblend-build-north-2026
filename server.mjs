import http from 'node:http';
import {createWorkflowStore} from './workflow.mjs';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { keychain, request, download, BASE, validateId } from './tt-video.mjs';
import { validateFalInput, createFalProvider, FAL_MODEL } from './fal-video.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'MiniMax-H3-FL2VA-LightX2V';
const studioOrigin = new URL(process.env.BLACKBLEND_STUDIO_URL ?? 'http://127.0.0.1:4331/studio').origin;
if (!['http://127.0.0.1:4331', 'https://blackblend-studio.mgd1984.workers.dev'].includes(studioOrigin)) throw new Error('Use the local or deployed Blackblend Studio origin.');
const STUDIO_URL = studioOrigin + '/studio';
const CAD_DIR = path.join(ROOT, 'assets', 'cad');
const terminal = new Set(['completed', 'failed', 'cancelled', 'canceled', 'unknown', 'paused']);
export function validateInput(body) {
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 12000) throw new Error('Enter a prompt of 1–12,000 characters.');
  const payload = { model: MODEL, prompt: body.prompt.trim() };
  if (body.image) {
    if (typeof body.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(body.image) || Buffer.byteLength(body.image) > 10_000_000) throw new Error('Use a PNG, JPEG or WebP image under 10 MB encoded.');
    payload.image = body.image;
  }
  if (body.video) throw new Error('Tenstorrent video input is not verified. Source clips are preview-only.');
  if (!/^[a-f0-9-]{36}$/.test(body.requestId ?? '')) throw new Error('Missing request identifier.');
  return payload;
}
export function timing(result) {
  const start = Date.parse(result.started_at), end = Date.parse(result.completed_at);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null;
}
export async function createApp({ cadDir = CAD_DIR, demoDir = path.join(ROOT, 'assets', 'compare'), runsDir = path.join(ROOT, 'runs'), getKey = () => keychain('get'), remote = request, fetchVideo = download, getFalKey = () => keychain('get', undefined, 'fal'), falFactory = createFalProvider, pollMs = 1500 } = {}) {
  await fs.mkdir(runsDir, { recursive: true, mode: 0o700 });
  const jobs = new Map(), requests = new Map();
  const manifest = await fs.readFile(path.join(cadDir, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => []);
  const examples = [];
  for (const item of manifest) {
    const files=[item.image,item.video].filter(Boolean);
    if (!files.length || files.some(name=>path.basename(name)!==name)) continue;
    if ((await Promise.all(files.map(name=>fs.stat(path.join(cadDir,name)).then(s=>s.isFile()).catch(()=>false)))).every(Boolean)) examples.push(item);
  }
  const exampleFiles = new Set(examples.flatMap(item => [item.image, item.video].filter(Boolean)));
  const token = randomBytes(32).toString('hex');
  let active = false;
  const save = job => fs.writeFile(path.join(job.directory, 'ui.json'), JSON.stringify(job, null, 2), { mode: 0o600 });
  const view = job => ({ id: job.id, requestId: job.requestId, projectId: job.projectId ?? null, references: (job.referenceFiles ?? []).map((_,i)=>`/references/${job.id}/${i}`), referenceCount: job.referenceCount ?? (job.hasImage ? 1 : 0), maxGeneratedReferenceImages: job.maxGeneratedReferenceImages ?? null, remoteId: job.remoteId, prompt: job.prompt, provider: job.provider ?? 'tenstorrent', model: job.model ?? MODEL, hasImage: job.hasImage, status: job.status, createdAt: job.createdAt, finishedAt: job.finishedAt, processingSeconds: job.processingSeconds ?? null, totalSeconds: job.totalSeconds ?? null, error: job.error, resolution: job.resolution, duration: job.duration, source: job.sourceFilename ? `/source/${job.id}` : null, video: job.hasVideo ? `/media/${job.id}` : null });
  for (const entry of await fs.readdir(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^run-[A-Za-z0-9_-]+$/.test(entry.name)) continue;
    const directory = path.join(runsDir, entry.name);
    try {
      let job;
      try { job = JSON.parse(await fs.readFile(path.join(directory, 'ui.json'), 'utf8')); }
      catch {
        const payload = JSON.parse(await fs.readFile(path.join(directory, 'request.json'), 'utf8'));
        const response = JSON.parse(await fs.readFile(path.join(directory, 'response.json'), 'utf8'));
        let status = response;
        try { status = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')); } catch {}
        job = { id: entry.name, remoteId: response.id, prompt: payload.prompt, hasImage: !!payload.image, status: status.status, createdAt: status.created_at ?? (await fs.stat(directory)).birthtime.toISOString(), processingSeconds: timing(status), resolution: status.resolution, duration: status.duration_seconds };
      }
      job.id = entry.name; job.directory = directory;
      job.sourceFilename = undefined;
      for (const name of ['source.mp4','source.mov','source.webm']) {
        if (await fs.stat(path.join(directory,name)).then(s=>s.isFile()).catch(()=>false)) {job.sourceFilename=name;break;}
      }
      job.hasVideo = await fs.stat(path.join(directory, 'video.mp4')).then(s => s.size > 0).catch(() => false);
      if (!terminal.has(job.status)) { job.status = 'paused'; job.error = 'Server restarted. Resume status checking; do not resubmit.'; }
      jobs.set(job.id, job);
      if (job.requestId) requests.set(job.requestId, job.id);
    } catch { /* Incomplete CLI attempts remain on disk, never resubmitted. */ }
  }
  async function saveReferences(job, images) {
    job.referenceFiles=[];
    for (const [i,image] of images.entries()) {
      const [header,data]=image.split(',');
      const ext=header.includes('image/png')?'png':header.includes('image/webp')?'webp':'jpeg';
      const name=`reference-${i}.${ext}`;
      await fs.writeFile(path.join(job.directory,name),Buffer.from(data,'base64'),{mode:0o600});
      job.referenceFiles.push(name);
    }
  }
  async function monitor(job, key) {
    const deadline = Date.now() + 600_000;
    while (true) {
      const result = await (await remote(`${BASE}/${validateId(job.remoteId)}`, key)).json();
      job.status = result.status ?? 'processing';
      job.processingSeconds = timing(result);
      job.duration = result.duration_seconds;
      job.resolution = result.resolution;
      await save(job);
      if (job.status === 'completed') {
        job.status = 'downloading'; await save(job);
        if (!job.hasVideo) {
          // A failed partial is retained; a unique new filename avoids overwrites on resume.
          const temporary = path.join(job.directory, `download-${randomUUID()}.mp4`);
          await fetchVideo(job.remoteId, key, temporary);
          await fs.rename(temporary, path.join(job.directory, 'video.mp4'));
        }
        job.hasVideo = true; job.status = 'completed'; job.finishedAt = new Date().toISOString();
        job.totalSeconds = (Date.now() - Date.parse(job.createdAt)) / 1000;
        job.error = undefined; await save(job); return;
      }
      if (['failed', 'cancelled', 'canceled', 'error'].includes(job.status)) {
        job.status = 'failed'; job.error = 'Provider ended the job without a video. Check Console for details.'; await save(job); return;
      }
      if (Date.now() >= deadline) throw new Error('Status checking paused after 10 minutes. The remote job may still run. Resume rather than submitting again.');
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
  }
  async function falWork(job, input) {
    try {
      const provider = falFactory(await getFalKey());
      if (input) { job.remoteId = await provider.submit(input, job, save); job.status='queued'; await save(job); }
      const deadline = Date.now() + 30 * 60_000;
      while (true) {
        const status = await provider.status(job.remoteId);
        job.status = status.status === 'COMPLETED' ? 'downloading' : status.status === 'IN_QUEUE' ? 'queued' : 'processing';
        if (Number.isFinite(status.metrics?.inference_time)) job.processingSeconds = status.metrics.inference_time;
        await save(job);
        if (status.status === 'COMPLETED') {
          const result = await provider.result(job.remoteId);
          if (!result.video?.url) throw new Error('fal returned no video.');
          await fs.writeFile(path.join(job.directory,'fal-result.json'),JSON.stringify(result,null,2),{mode:0o600});
          const temporary = path.join(job.directory, `download-${randomUUID()}.mp4`);
          await provider.download(result.video.url,temporary);
          await fs.rename(temporary,path.join(job.directory,'video.mp4'));
          job.hasVideo=true;job.status='completed';job.finishedAt=new Date().toISOString();job.totalSeconds=(Date.now()-Date.parse(job.createdAt))/1000;job.error=undefined;await save(job);return;
        }
        if (status.status === 'FAILED') {job.status='failed';job.error='fal job failed. Check fal request history.';await save(job);return;}
        if (Date.now()>deadline) throw new Error('Polling limit reached.');
        await new Promise(resolve=>setTimeout(resolve,pollMs));
      }
    } catch(error) {
      job.status=job.remoteId?'paused':job.submissionAttempted?'unknown':'failed';
      job.error=job.remoteId?'fal status or download interrupted. Resume this job; do not generate again.':job.submissionAttempted?'fal submission could not be confirmed. Check fal request history before submitting again.':`fal setup or upload failed${error.status ? ` (HTTP ${error.status})` : ''}. Check the fal Keychain key and that the video is valid and no longer than 15 seconds.`;
      await save(job);
    } finally {active=false;}
  }
  async function work(job, payload) {
    try {
      const key = await getKey();
      if (payload) {
        const result = await (await remote(BASE, key, { payload })).json();
        job.remoteId = validateId(result.id);
        job.status = result.status ?? 'queued'; await save(job);
      }
      await monitor(job, key);
    } catch (error) {
      job.status = job.remoteId ? 'paused' : 'unknown';
      // Never expose arbitrary provider bodies, URLs or credentials to the browser.
      job.error = job.remoteId ? 'Status or download interrupted. Resume this job to check again.' : 'Submission could not be confirmed. Check Console before generating again; no retry was made.';
      console.error(`Job ${job.id}: ${job.status}`);
      await save(job);
    } finally { active = false; }
  }
  const workflows=await createWorkflowStore({root:path.join(runsDir,'workflow-proposals'),submit:async payload=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/fal/jobs`,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify(payload),redirect:'error'});if(!response.ok)throw new Error('Submission was not confirmed.');return response.json();}});
  const server = http.createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Local access only.' });
    try {
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const workflowRoute=url.pathname.match(/^\/api\/workflows\/([a-f0-9-]{36})(\/source)?$/);
      if(req.method==='GET'&&workflowRoute){if(workflowRoute[2]){const bytes=await workflows.source(workflowRoute[1]);res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':bytes.length});return res.end(bytes);}return json(200,await workflows.get(workflowRoute[1]));}
      if (req.method === 'GET' && url.pathname === '/api/examples') return json(200, examples.map(({ id, title, description, prompt, image, video }) => ({ id, title, description, prompt, image: `/examples/${image}`, video: video ? `/examples/${video}` : null })));
      if (req.method === 'GET' && url.pathname.startsWith('/examples/')) {
        const name = url.pathname.slice('/examples/'.length);
        if (!exampleFiles.has(name) || path.basename(name) !== name) return json(404, { error: 'Example not found.' });
        const file = path.join(cadDir, name);
        const { size } = await fs.stat(file);
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        res.writeHead(range ? 206 : 200, { 'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
        createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { token, model: MODEL, studioUrl: STUDIO_URL });
      if (req.method === 'GET' && url.pathname === '/api/jobs') return json(200, [...jobs.values()].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(view));
      if (req.method === 'POST') {
        if (req.headers['x-local-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) return json(403, { error: 'Invalid local request.' });
        let data = '', size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > (['/api/fal/jobs','/api/workflows'].includes(url.pathname) ? 128_000_000 : 10_100_000)) return json(413, { error: 'Upload too large.' }); data += chunk; }
        const body = JSON.parse(data);
        if(url.pathname==='/api/workflows')return json(201,await workflows.prepare(body));
        const approveWorkflow=url.pathname.match(/^\/api\/workflows\/([a-f0-9-]{36})\/approve$/);
        if(approveWorkflow){if(body.confirm!==true)return json(400,{error:'Explicit confirmation is required.'});return json(200,await workflows.approve(approveWorkflow[1],body.inputHash));}
        if (req.headers['x-project-id'] || body.projectId !== undefined) return json(400, {error:'Projects belong to Studio. Local jobs are execution receipts only.'});
        if (url.pathname === '/api/fal/jobs') {
          const input=validateFalInput(body);
          if(requests.has(body.requestId)) return json(200,view(jobs.get(requests.get(body.requestId))));
          if(active) return json(409,{error:'A job is already active.'});
          active=true;
          try {
            const directory=await fs.mkdtemp(path.join(runsDir,'run-'));
            const job={id:path.basename(directory),directory,requestId:body.requestId,provider:'fal',model:FAL_MODEL,prompt:input.prompt || 'Blender animation',hasImage:!!input.images.length,referenceCount:input.images.length,maxGeneratedReferenceImages:input.maxImages,createdAt:new Date().toISOString(),status:'preparing',resolution:input.resolution};
            await fs.writeFile(path.join(directory,'request.json'),JSON.stringify({provider:'fal',model:FAL_MODEL,prompt:input.prompt,resolution:input.resolution,maxGeneratedReferenceImages:input.maxImages,sourceBytes:input.bytes.length},null,2),{mode:0o600});
            await saveReferences(job,input.images);await save(job);jobs.set(job.id,job);requests.set(body.requestId,job.id);
            void falWork(job,input);return json(202,view(job));
          } catch(error){active=false;throw error;}
        }
        if (url.pathname === '/api/jobs') {
          const payload = validateInput(body);
          if (requests.has(body.requestId)) return json(200, view(jobs.get(requests.get(body.requestId))));
          if (active) return json(409, { error: 'A job is already active. Wait for it to finish.' });
          active = true;
          try {
            const directory = await fs.mkdtemp(path.join(runsDir, 'run-'));
            const job = { id: path.basename(directory), directory, requestId: body.requestId, prompt: payload.prompt, hasImage: !!payload.image, createdAt: new Date().toISOString(), status: 'submitting' };
            await fs.writeFile(path.join(directory, 'request.json'), JSON.stringify(payload, null, 2), { mode: 0o600 });
            await saveReferences(job,payload.image?[payload.image]:[]);await save(job); jobs.set(job.id, job); requests.set(body.requestId, job.id);
            void work(job, payload); return json(202, view(job));
          } catch (error) { active = false; throw error; }
        }
        const match = url.pathname.match(/^\/api\/jobs\/(run-[A-Za-z0-9_-]+)\/resume$/);
        if (match) {
          const job = jobs.get(match[1]);
          if (!job?.remoteId) return json(400, { error: 'No remote job ID to resume. Check Console.' });
          if (active) return json(409, { error: 'A job is already active.' });
          if (job.hasVideo) return json(200, view(job));
          active = true; job.status = 'checking'; job.error = undefined; await save(job);
          if(job.provider==='fal') void falWork(job); else void work(job); return json(202, view(job));
        }
      }
      const reference=url.pathname.match(/^\/references\/(run-[A-Za-z0-9_-]+)\/(\d)$/);
      if(req.method==='GET' && reference){
        const job=jobs.get(reference[1]),name=job?.referenceFiles?.[Number(reference[2])];
        if(!name || !/^reference-\d\.(png|jpeg|webp)$/.test(name))return json(404,{error:'Reference unavailable.'});
        const bytes=await fs.readFile(path.join(job.directory,name));
        res.writeHead(200,{'Content-Type':`image/${name.split('.').pop()}`,'Content-Length':bytes.length});res.end(bytes);return;
      }
      if (req.method === 'GET' && (url.pathname.startsWith('/media/') || url.pathname.startsWith('/source/') || url.pathname.startsWith('/demo/'))) {
        let file;
        if(url.pathname.startsWith('/demo/')) {
          const name=url.pathname.slice(6);
          if(!['ptz-source.mp4','ptz-result.mp4'].includes(name)) return json(404,{error:'Demo not found.'});
          file=path.join(demoDir,name);
        } else {
          const source=url.pathname.startsWith('/source/');
          const job = jobs.get(url.pathname.slice(source?8:7));
          if (!job || (source ? !['source.mp4','source.mov','source.webm'].includes(job.sourceFilename) : !job.hasVideo)) return json(404,{error:'Video not available.'});
          file=path.join(job.directory,source?job.sourceFilename:'video.mp4');
        }
        const { size } = await fs.stat(file);
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        let start = 0, end = size - 1;
        if (range) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; }
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        res.writeHead(range ? 206 : 200, { 'Content-Type': file.endsWith('.webm')?'video/webm':file.endsWith('.mov')?'video/quicktime':'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
        createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res); return;
      }
      if (req.method === 'GET' && url.pathname === '/') { res.writeHead(302, {Location: STUDIO_URL}); return res.end(); }
      const assets = { '/workflow.html': ['workflow.html','text/html'], '/workflow.js': ['workflow.js','text/javascript'], '/workflow.css': ['workflow.css','text/css'],  };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, mime] = assets[url.pathname]; res.writeHead(200, { 'Content-Type': mime }); res.end(await fs.readFile(path.join(ROOT, 'public', file))); return;
      }
      json(404, { error: 'Not found.' });
    } catch (error) { if (!res.headersSent) json(400, { error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Request failed. Check the input and try again.' }); else res.destroy(); }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const server = await createApp();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(Number(process.env.PORT ?? 4317), '127.0.0.1', () => console.log(`Blackblend desktop adapter: http://127.0.0.1:${server.address().port} · Studio: ${STUDIO_URL}`));
}
