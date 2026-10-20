import http from 'node:http';import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';
const project=path.resolve(import.meta.dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
export function createServer(root=path.join(project,'dist'),{baseline=null}={}){return http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{const url=new URL(req.url,'http://localhost'),raw=decodeURIComponent(url.pathname);if(/[\\\0]/.test(raw)||raw.split('/').includes('..'))throw Error();
 let directory=root,rel=raw.replace(/^\/apex-lab(?=\/|$)/,'');
 // Optional read-only baseline mount exists only in the test harness, never in the application.
 if(baseline&&raw.startsWith('/baseline/')){directory=baseline;rel=raw.slice('/baseline'.length);}
 const canonical=await fsp.realpath(directory);let p=await fsp.realpath(path.resolve(canonical,'.'+rel));if(p!==canonical&&!p.startsWith(canonical+path.sep))throw Error();if((await fsp.stat(p)).isDirectory())p=path.join(p,'index.html');
 const stat=await fsp.stat(p);if(!stat.isFile())throw Error();res.writeHead(200,{'Content-Type':mime[path.extname(p)]??'application/octet-stream','Content-Length':stat.size});if(req.method==='HEAD')res.end();else fs.createReadStream(p).pipe(res);
 }catch{res.writeHead(404);res.end('Not found');}
 });}
if(process.argv[1]===import.meta.filename){const port=Number(process.env.PORT??4190);createServer().listen(port,'127.0.0.1',()=>console.log(`APEX LAB: http://127.0.0.1:${port}/apex-lab/`));}
