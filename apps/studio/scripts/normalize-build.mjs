import {readFileSync, writeFileSync} from 'node:fs';
const file = new URL('../dist/server/wrangler.json', import.meta.url);
const config=JSON.parse(readFileSync(file,'utf8'));
// Normalize the plugin-generated default so the deployment manifest remains portable.
delete config.legacy_env;
writeFileSync(file,JSON.stringify(config,null,2)+'\n');
