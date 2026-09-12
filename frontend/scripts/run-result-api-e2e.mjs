import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {createApp} from '../../backend/dist/src/app.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=await mkdtemp(resolve(tmpdir(),'offermesh-api-e2e-'));
const app=await createApp({dbPath:resolve(temp,'result.sqlite')});
let api,web;
try {
 api=app.listen(0,'127.0.0.1');
 await new Promise((done,reject)=>{api.once('listening',done);api.once('error',reject);});
 web=await createServer({root,server:{port:5188,strictPort:true,host:'127.0.0.1',proxy:{'/api':`http://127.0.0.1:${api.address().port}`}}});
 await web.listen();
 const python=spawn(process.env.PYTHON??'python',[resolve(root,'tests/e2e_result_api.py')],{cwd:root,env:{...process.env,OFFERMESH_E2E_URL:'http://127.0.0.1:5188'},stdio:'inherit',windowsHide:true});
 process.exitCode=await new Promise((done,reject)=>{python.once('error',reject);python.once('exit',code=>done(code??1));});
} finally {
 await web?.close();if(api)await new Promise(done=>api.close(done));app.locals.store.close();
 // Only the unique temporary test directory allocated above is removed.
 await rm(temp,{recursive:true,force:true});
}
