import {createMobileApp} from './mobile-app.mjs';
const app=createMobileApp(),server=app.listen(3202,'127.0.0.1',()=>console.log('Mobile demo API: isolated in-memory SQLite; offline AI; simulated checkout.'));
server.on('error',()=>{console.error('Mobile API port 3202 unavailable.');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(async()=>{await app.locals.store.close();});});
