import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'dist');
await build({entryPoints:[path.join(root,'app/app.js')],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
const base=process.argv.find(a=>a.startsWith('--base='))?.slice(7)??'/';
if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw Error('Invalid static base');
// Only this generated directory is replaced. User source and input directories are never targets.
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(root,'app'),out,{recursive:true,filter:p=>!p.endsWith('.md')});
// app/ is flattened in dist; the shared engine remains at dist/engine.
for(const name of ['recording-source.js','measured-analysis.js']){const adapter=path.join(out,'data',name);
await fs.writeFile(adapter,(await fs.readFile(adapter,'utf8')).replaceAll('../../engine/', '../engine/'));}
await fs.cp(path.join(root,'engine/apps/browser-telemetry/src'),path.join(out,'engine/apps/browser-telemetry/src'),{recursive:true});
await fs.cp(path.join(root,'engine/apps/browser-telemetry/data'),path.join(out,'engine/apps/browser-telemetry/data'),{recursive:true});
await fs.cp(path.join(root,'engine/apps/mobile'),path.join(out,'engine/apps/mobile'),{recursive:true});
const vendor=path.join(out,'engine/apps/browser-telemetry/vendor'),pkg=path.join(root,'node_modules/@duckdb/duckdb-wasm');
await fs.mkdir(vendor,{recursive:true});
const version=JSON.parse(await fs.readFile(path.join(pkg,'package.json'))).version;if(version!=='1.32.0')throw Error('Expected locked DuckDB-Wasm 1.32.0');
for(const [entry,file]of [[path.join(pkg,'dist/duckdb-browser.mjs'),'duckdb.js'],[path.join(root,'engine/apps/browser-telemetry/src/hash-entry.js'),'hash.js']])await build({entryPoints:[entry],outfile:path.join(vendor,file),bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'linked'});
for(const file of ['duckdb-eh.wasm','duckdb-mvp.wasm','duckdb-browser-eh.worker.js','duckdb-browser-mvp.worker.js'])await fs.copyFile(path.join(pkg,'dist',file),path.join(vendor,file));
await fs.cp(path.join(root,'engine/apps/browser-telemetry/licenses'),path.join(vendor,'licenses'),{recursive:true});
await fs.copyFile(path.join(root,'node_modules/apache-arrow/LICENSE.txt'),path.join(vendor,'LICENSE-arrow.txt'));
async function walk(dir){let files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);files.push(...e.isDirectory()?await walk(p):[p]);}return files;}
const assets={};for(const p of await walk(out)){const bytes=await fs.readFile(p);assets[path.relative(out,p)]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
await fs.writeFile(path.join(out,'build-manifest.json'),JSON.stringify({schemaVersion:'1.0.0',phase:3,base,entry:'index.html',nativeImportConnected:true,realComparisonConnected:true,realPlaybackConnected:true,realSpatialConnected:false,offlinePrepared:false,assets},null,2));
console.log(JSON.stringify({entry:'index.html',base,assets:Object.keys(assets).length,nativeImportConnected:true,bytes:Object.values(assets).reduce((a,v)=>a+v.bytes,0)}));
