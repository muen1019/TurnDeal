import {spawn} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';

// LAN design preview only. Never proxies requests to the paid/live backend.
const env={...process.env,OFFERMESH_DEV_MOCK:'1',OFFERMESH_DEV_MOCK_SCENARIO:'success',OFFERMESH_RUNTIME_MODE:'preview'};
for(const name of Object.keys(env))if(/KEY|TOKEN|SECRET|PASSWORD|API_ORIGIN/i.test(name))delete env[name];
const child=spawn(process.execPath,['frontend/node_modules/vite/bin/vite.js','frontend','--host','0.0.0.0','--port','5174'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),env,stdio:'inherit',windowsHide:true,
});
child.on('exit',code=>{process.exitCode=code??0;});
child.on('error',()=>{console.error('Unable to start mobile preview');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
console.log('Mobile design preview: fixture data only, NO paid AI calls, NO real purchases. Same trusted Wi-Fi only.');
for(const entries of Object.values(networkInterfaces()))for(const item of entries??[])if(item.family==='IPv4'&&!item.internal)console.log(`Phone preview: http://${item.address}:5174/chat`);
