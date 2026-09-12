import {createMobileApp} from './mobile-app.mjs';
import {randomBytes} from 'node:crypto';
const mode=process.env.OFFERMESH_RUNTIME_MODE==='live'?'live':'offline';
const pairingCode=mode==='live'?randomBytes(6).toString('hex'):'';
const apiKey=mode==='live'?process.env.OPENAI_API_KEY??'':'';
const port=mode==='live'?3203:3202;
const app=createMobileApp({mode,apiKey,pairingCode}),server=app.listen(port,'127.0.0.1',()=>{
 console.log(`Mobile API: ${mode}; isolated in-memory SQLite; simulated checkout.`);
 if(pairingCode)console.log(`Phone pairing code (NOT your API key): ${pairingCode}`);
});
server.on('error',()=>{console.error(`Mobile API port ${port} unavailable.`);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(async()=>{await app.locals.store.close();});});
