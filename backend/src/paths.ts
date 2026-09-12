import {existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
let current=dirname(fileURLToPath(import.meta.url));
while(!existsSync(resolve(current,'openapi.json'))){const parent=dirname(current);if(parent===current)throw new Error('Backend package root missing');current=parent;}
export const backendRoot=current;
export const contractFile=(name:string)=>resolve(backendRoot,'../contracts',name);
