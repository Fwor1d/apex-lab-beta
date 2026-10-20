import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'docs/SOURCE-PROVENANCE.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={status:'passed',checkedAt:new Date().toISOString(),originals:{},preservedCopies:0,publicRedactions:0,presentationCSS:0};
for(const [name,variable] of [['production','APEX_PRODUCTION_ROOT'],['revision52','APEX_REFERENCE_ROOT']]){
 const directory=process.env[variable];
 if(!directory){report.originals[name]={status:'not-present',reason:`Optional local audit: ${variable}`};continue;}
 for(const [file,hash] of Object.entries(manifest[name].files))assert.equal(sha(await fs.readFile(path.join(directory,file))),hash,`${name}: ${file}`);
 report.originals[name]={files:Object.keys(manifest[name].files).length,unchanged:true};
 if(name==='production'){
  const git=args=>execFileSync('git',['-C',directory,...args],{encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
  assert.equal(git(['rev-parse','HEAD']),manifest.production.head);
  assert.equal(git(['branch','--show-current']),manifest.production.branch);
  assert.equal(git(['status','--porcelain']),manifest.production.status.trim());
 }
}
for(const entry of manifest.copies){
 const preserve=entry.destination.startsWith('engine/')||entry.destination.startsWith('app/assets/')||entry.destination.startsWith('docs/baselines/')||entry.destination==='DESIGN.md'||entry.destination.startsWith('app/')&&entry.destination.endsWith('.css');
 if(!preserve&&entry.integration?.status!=='public-redacted')continue;
 const redacted=entry.integration?.status==='public-redacted';
 // Privacy edits may affect docs and optional test assertions, never production runtime or UI.
 if(redacted)assert.ok(entry.destination.startsWith('docs/')||entry.destination.startsWith('engine/tests/'));
 assert.equal(sha(await fs.readFile(path.join(root,entry.destination))),redacted?entry.integration.currentSha256:entry.sha256,entry.destination);
 report.preservedCopies++;if(redacted)report.publicRedactions++;
 if(entry.destination.startsWith('app/')&&entry.destination.endsWith('.css'))report.presentationCSS++;
}
const baseline=JSON.parse(await fs.readFile(path.join(root,'docs/LOCKED-DEPENDENCIES.json')));
const actual=JSON.parse(await fs.readFile(path.join(root,'package-lock.json')));
assert.equal(actual.lockfileVersion,baseline.lockfileVersion);
assert.deepEqual(actual.packages[''].devDependencies,baseline.rootDevDependencies);
delete actual.packages[''];
assert.deepEqual(actual.packages,baseline.packages,'Locked package versions/integrities changed');
report.lockedDependenciesUnchanged=true;
await fs.mkdir(path.join(root,'evidence'),{recursive:true});
await fs.writeFile(path.join(root,'evidence/source-integrity.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
