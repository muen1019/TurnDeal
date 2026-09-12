import {createServer} from 'vite';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../../backend/dist/src/app.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=await createApp({dbPath:resolve(root,'../backend/data/result-preview.sqlite')});
const api=app.listen(3201,'127.0.0.1');
await new Promise((done,reject)=>{api.once('listening',done);api.once('error',reject);});
const web=await createServer({root,server:{port:5273,strictPort:true,host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3201'}}});
await web.listen();
console.log('Result UI: http://127.0.0.1:5273/chat | API: http://127.0.0.1:3201/api');
async function stop(){await web.close();api.close(()=>{app.locals.store.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
