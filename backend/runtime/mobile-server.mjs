import {createMobileApp} from './mobile-app.mjs';
const mode=process.env.OFFERMESH_RUNTIME_MODE==='live'?'live':'offline';
const apiKey=mode==='live'?process.env.OPENAI_API_KEY??'':'';
const port=mode==='live'?3203:3202;
const app=createMobileApp({mode,apiKey}),server=app.listen(port,'127.0.0.1',()=>{
 console.log(`Mobile API: ${mode}; isolated in-memory SQLite; simulated checkout.`);
 if(mode==='live')console.log('Open LAN access: no pairing. Anyone who can reach the URL can use your backend LLM quota.');
});
server.on('error',()=>{console.error(`Mobile API port ${port} unavailable.`);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(async()=>{await app.locals.store.close();});});
