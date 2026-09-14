import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.env.OFFERMESH_RUNTIME_MODE??'offline';
if(mode==='live'&&!/^sk-[A-Za-z0-9_-]{20,}$/.test((process.env.OPENAI_API_KEY??process.env.API_KEY??'').trim()))throw new Error('Live mode requires a server-side key. Use npm run dev:secure.');
// Fail rather than silently attaching this frontend to an unrelated old server.
for(const port of [3201,5173])await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(new Error(`Port ${port} is occupied; stop the existing service before npm run dev.`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
const children=[];let closing=false;
function stop(code=0){if(closing)return;closing=true;for(const child of children)child.kill();process.exitCode=code;}
function run(file,env){const child=spawn(process.execPath,[file],{cwd:root,env,stdio:'inherit',windowsHide:true});children.push(child);child.on('error',error=>{console.error(`Cannot start ${file}: ${error.code}`);stop(1);});child.on('exit',(code,signal)=>{if(!closing)console.error(`${file} exited (${code??signal})`);stop(code??0);});}
run('backend/runtime/server.mjs',{...process.env,PORT:'3201',OFFERMESH_RUNTIME_MODE:mode});
// Frontend child never inherits credentials, including non-VITE variables.
const frontendEnv={...process.env,OFFERMESH_API_ORIGIN:'http://127.0.0.1:3201',OFFERMESH_RUNTIME_MODE:mode};
for(const name of Object.keys(frontendEnv))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(name))delete frontendEnv[name];
const child=spawn(process.execPath,['frontend/node_modules/vite/bin/vite.js','frontend'],{cwd:root,env:frontendEnv,stdio:'inherit',windowsHide:true});
children.push(child);child.on('error',error=>{console.error(`Cannot start Vite: ${error.code}`);stop(1);});child.on('exit',(code,signal)=>{if(!closing)console.error(`Vite exited (${code??signal})`);stop(code??0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
console.log(`Open http://127.0.0.1:5173/chat — ${mode}; one integrated API and SQLite, no payments.`);
