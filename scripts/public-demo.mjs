import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createPublicGateway} from './public-gateway.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const env={...process.env};
for(const name of Object.keys(env))if(/KEY|TOKEN|SECRET|PASSWORD|API_ORIGIN|DB_PATH/i.test(name))delete env[name];
Object.assign(env,{OFFERMESH_DEV_MOCK:'0',OFFERMESH_RUNTIME_MODE:'live'});
const executable=fileURLToPath(new URL('../.local-tools/cloudflared.exe',import.meta.url));
if(!existsSync(executable))throw Error('Install official cloudflared into .local-tools/cloudflared.exe; see docs/PUBLIC_DEMO.md.');
let status;
try{status=await (await fetch('http://127.0.0.1:3203/api/mobile-session',{signal:AbortSignal.timeout(5000)})).json();}catch{}
if(status?.mode!=='live')throw Error('First run npm run dev:mobile:secure in another terminal and enter your API key there.');
console.log('Building public UI. No API key is passed to the build or tunnel.');
await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['frontend/node_modules/vite/bin/vite.js','build','frontend'],{cwd:root,env,stdio:'inherit',windowsHide:true});
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Frontend build failed')));
});
let publicOrigin;
const app=createPublicGateway({dist:fileURLToPath(new URL('../frontend/dist',import.meta.url)),getOrigin:()=>publicOrigin});
const server=await new Promise((resolve,reject)=>{const server=app.listen(5180,'127.0.0.1',()=>resolve(server));server.on('error',reject);});
console.log('PUBLIC DEMO: anyone with the link can use your LLM quota. Use fictional addresses only. Simulated checkout.');
console.log('Limits: 30 writes/minute and 120 writes per tunnel run (all visitors combined). Ctrl+C closes public access.');
const tunnel=spawn(executable,['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:5180'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let buffer='',stopping=false;
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;tunnel.kill();server.closeAllConnections();server.close();}
const consume=data=>{
 const text=data.toString();process.stdout.write(text);buffer=(buffer+text).slice(-10000);
 const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
 if(match&&!publicOrigin){publicOrigin=match[0];console.log(`\nPublic phone demo: ${publicOrigin}/chat\n`);}
};
tunnel.stdout.on('data',consume);tunnel.stderr.on('data',consume);
tunnel.on('error',error=>{console.error(error.message);stop(1);});
tunnel.on('exit',code=>stop(code??0));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
