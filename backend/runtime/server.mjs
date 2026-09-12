import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeApp } from './app.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const mode=process.env.OFFERMESH_RUNTIME_MODE??'offline';
if(!['offline','live'].includes(mode))throw new Error('OFFERMESH_RUNTIME_MODE must be offline or live');
const apiKey=mode==='live'?(process.env.OPENAI_API_KEY??process.env.API_KEY??'').trim():'';
if(mode==='live'&&!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey))throw new Error('Live mode needs a valid server-side API key; use npm run dev:secure.');
const app=createRuntimeApp({dbPath:process.env.OFFERMESH_DB_PATH??resolve(root,'data/app.sqlite'),apiKey,improverOptions:{mode},purchaseOptions:{mode:process.env.OFFERMESH_PURCHASE_MODE??'test'}});
const server=app.listen(Number(process.env.PORT??3201),'127.0.0.1',()=>{
  console.log(`OfferMesh integrated API: http://127.0.0.1:${server.address().port} (${mode}; configured A-E sellers; ACP test purchase, simulated payment)`);
});
server.on('error',error=>{console.error(`Unable to listen: ${error.code??'server_error'}`);void app.locals.store.close().finally(()=>{process.exitCode=1;});});
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(closing)return;closing=true;server.close(()=>{void app.locals.store.close();});
});
