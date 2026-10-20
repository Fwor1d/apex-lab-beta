import {execFileSync} from 'node:child_process';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
const git=(args,options={})=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:128*1024*1024,...options});
const repo=git(['rev-parse','--show-toplevel']).trim();
const readGit=(args,options={})=>execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:128*1024*1024,...options});
const range=process.argv.find(a=>a.startsWith('--range='))?.slice(8);
const staged=process.argv.includes('--staged');
const findings=[];let count=0,bytes=0;
function inspect(label,data){
 count++;bytes+=data.length;
 const reject=rule=>findings.push({file:label,rule});
 if(/(?:^|\/)(?:\.env(?:\.|$)|node_modules|\.venv|personal-data|APEX-LAB-Data|evidence|\.cache|tmp|browser-profiles)(?:\/|$)|\.(?:duckdb(?:\.wal)?|sqlite3?|db|pem|p12|pfx|key|zip|tar|tgz|log|map)$/i.test(label)&&!label.endsWith('/.env.example')&&label!=='.env.example')reject('private-or-generated-path');
 if(data.subarray(0,16).toString()==='SQLite format 3\0'||data.subarray(8,12).toString()==='DUCK')reject('database-magic');
 if(data.includes(0))return;
 const text=data.toString();
 if(/\/(?:Users|home)\/[a-zA-Z0-9_.-]+\//.test(text)||/[A-Z]:\\Users\\/.test(text))reject('personal-absolute-path');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))reject('private-key');
 if(/\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b|\bAKIA[A-Z0-9]{16}\b/.test(text))reject('credential-pattern');
 if(/https?:\/\/[^\s/@:]+:[^\s/@]+@/.test(text))reject('url-credential');
}
if(range){
 // Scan every newly reachable object, including deleted blobs and commit metadata.
 const entries=readGit(['rev-list','--objects',range]).trim().split('\n').filter(Boolean);
 for(const entry of entries){const split=entry.indexOf(' '),oid=split<0?entry:entry.slice(0,split),name=split<0?oid:entry.slice(split+1);const type=readGit(['cat-file','-t',oid]).trim();if(type==='blob'||type==='commit')inspect(name,readGit(['cat-file',type,oid],{encoding:null}));}
}else{
 const files=(staged?readGit(['diff','--cached','--name-only','--diff-filter=ACMR','-z']):readGit(['ls-files','-z'])).split('\0').filter(Boolean);
 if(!files.length)throw Error('No Git files to audit');
 for(const file of files)inspect(file,readGit(['show',':'+file],{encoding:null}));
}
console.log(JSON.stringify({mode:range?'outgoing-objects':staged?'staged':'tracked-index',objects:count,bytes,findings},null,2));
if(findings.length)process.exitCode=1;
