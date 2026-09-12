import {spawn} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
const cwd=fileURLToPath(new URL('../',import.meta.url));
for(const port of [3202,5174])await new Promise((resolve,reject)=>{
 const probe=createServer();probe.once('error',()=>reject(new Error(`Port ${port} already in use; stop the previous mobile demo first.`)));
 probe.listen(port,'0.0.0.0',()=>probe.close(resolve));
});
const env={...process.env};
for(const name of Object.keys(env))if(/KEY|TOKEN|SECRET|PASSWORD|API_ORIGIN|DB_PATH/i.test(name))delete env[name];
Object.assign(env,{OFFERMESH_DEV_MOCK:'0',OFFERMESH_RUNTIME_MODE:'offline',OFFERMESH_MOBILE_DEMO:'1',OFFERMESH_API_ORIGIN:'http://127.0.0.1:3202'});
const children=[];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;for(const child of children)child.kill();}
for(const args of [['backend/runtime/mobile-server.mjs'],['frontend/node_modules/vite/bin/vite.js','frontend','--host','0.0.0.0','--port','5174']]){
 const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});children.push(child);
 child.on('error',()=>stop(1));child.on('exit',code=>stop(code??0));
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
console.log('Phone demo: offline AI, simulated checkout, isolated temporary data. Use fictional shipping details on trusted Wi-Fi only. Restart clears demo data.');
for(const entries of Object.values(networkInterfaces()))for(const item of entries??[])if(item.family==='IPv4'&&!item.internal)console.log(`Phone: http://${item.address}:5174/chat`);
