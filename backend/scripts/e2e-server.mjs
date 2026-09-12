import {createApp} from '../dist/src/app.js';
const app=await createApp({dbPath:process.env.OFFERMESH_TEST_DB});
const server=app.listen(Number(process.env.OFFERMESH_TEST_PORT),'127.0.0.1');
function stop(){server.close(()=>{app.locals.store.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
