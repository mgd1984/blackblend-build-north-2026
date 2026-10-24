import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
test('historical receipts survive while the retired local project write API is unavailable',async()=>{
 const runsDir=await fs.mkdtemp(path.join(os.tmpdir(),'blackblend-receipts-'));
 const directory=path.join(runsDir,'run-existing');await fs.mkdir(directory);
 await fs.writeFile(path.join(directory,'ui.json'),JSON.stringify({id:'run-existing',directory,requestId:'existing',projectId:'historical-project',status:'completed',createdAt:new Date().toISOString()}));
 const app=await createApp({runsDir,cadDir:runsDir,getKey:()=>{throw Error('No key access during receipt checks');}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 try {
  const base=`http://127.0.0.1:${app.address().port}`;
  const [receipt]=await(await fetch(base+'/api/jobs')).json();assert.equal(receipt.projectId,'historical-project');
  const {token}=await(await fetch(base+'/api/config')).json();
  const headers={'Content-Type':'application/json','X-Local-Token':token};
  assert.equal((await fetch(base+'/api/jobs/run-existing/attach',{method:'POST',headers,body:'{}'})).status,404);
  assert.equal((await fetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify({projectId:'another-project'})})).status,400);
  const saved=JSON.parse(await fs.readFile(path.join(directory,'ui.json'),'utf8'));assert.equal(saved.projectId,'historical-project');
 } finally {await new Promise(r=>app.close(r));await fs.rm(runsDir,{recursive:true});}
});
