import fs from 'node:fs/promises';
import path from 'node:path';
const root='artifacts/runtime-production';
const forbidden=['__open_view','relaySession','runtimeInstanceId','traceparent','api/ingest','sourceSnapshotId','manifestId','definitionId','moduleVersion'];
let count=0;
async function check(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);if(entry.isDirectory()){await check(file);continue;}
    if(entry.name.endsWith('.map'))throw new Error('Production source map found');
    const text=await fs.readFile(file,'utf8');
    for(const marker of forbidden)if(text.includes(marker))throw new Error(`Development telemetry marker in production: ${marker}`);
    count++;
  }
}
await check(root);if(!count)throw new Error('No production files inspected');
console.log(`Production isolation passed: ${count} files, ${forbidden.length} forbidden markers absent, no source maps.`);
