import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js >=22 required');
for(const dir of ['tmp','evidence','.cache/npm'])fs.mkdirSync(path.join(root,dir),{recursive:true});
const npm=process.platform==='win32'?'npm.cmd':'npm';
for(const args of [['ci','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(root,'.cache/npm')],['run','build','--','--base=/apex-lab/'],['run','check:build'],['run','check:security'],['run','check:provenance']])execFileSync(npm,args,{cwd:root,stdio:'inherit'});
console.log('DEMO source ready. Run npm test, then npm run dev. No private recordings or runtime credentials required.');
