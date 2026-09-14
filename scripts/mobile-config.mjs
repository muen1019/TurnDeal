export function mobileConfig(source,live=false){
 const apiKey=(source.OPENAI_API_KEY??'').trim();
 if(live&&!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey))throw new Error('Live phone mode needs a key. Run npm run dev:mobile:secure (hidden input).');
 const uiPort=live?5176:5174,apiPort=live?3203:3202;
 const frontendEnv={...source};
 for(const name of Object.keys(frontendEnv))if(/KEY|TOKEN|SECRET|PASSWORD|API_ORIGIN|DB_PATH/i.test(name))delete frontendEnv[name];
 Object.assign(frontendEnv,{OFFERMESH_RUNTIME_MODE:live?'live':'offline',OFFERMESH_MOBILE_DEMO:'1',OFFERMESH_API_ORIGIN:`http://127.0.0.1:${apiPort}`});
 const backendEnv={...frontendEnv};
 if(live)backendEnv.OPENAI_API_KEY=apiKey;
 return {uiPort,apiPort,frontendEnv,backendEnv};
}
