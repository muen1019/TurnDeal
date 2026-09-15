import {spawn} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {mobileConfig} from './mobile-config.mjs';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const live=process.argv.includes('--live');
let config;
try{config=mobileConfig(process.env,live);}catch(error){console.error(error.message);process.exit(1);}
const {uiPort,apiPort,frontendEnv,backendEnv}=config;
try{for(const port of [apiPort,uiPort])await new Promise((resolve,reject)=>{
 const probe=createServer();probe.once('error',()=>reject(new Error(`Port ${port} is already in use. The previous phone service may still be running. Open its URL, or press Ctrl+C in its terminal before restarting. No process was stopped.`)));
 probe.listen(port,'0.0.0.0',()=>probe.close(resolve));
});}catch(error){console.error(error.message);process.exit(1);}
const children=[];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;for(const child of children)child.kill();}
for(const [args,env] of [[['backend/runtime/mobile-server.mjs'],backendEnv],[['frontend/node_modules/vite/bin/vite.js','frontend','--host','0.0.0.0','--port',String(uiPort)],frontendEnv]]){
 const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});children.push(child);
 child.on('error',()=>stop(1));child.on('exit',code=>stop(code??0));
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
console.log(`Phone demo: ${live?'LIVE LLM (API charges apply); pair your phone using the terminal code':'offline AI'}, simulated checkout, isolated temporary data. Trusted Wi-Fi only; this is HTTP, not a public deployment. Restart clears demo data.`);
for(const entries of Object.values(networkInterfaces()))for(const item of entries??[])if(item.family==='IPv4'&&!item.internal)console.log(`Phone: http://${item.address}:${uiPort}/chat`);
