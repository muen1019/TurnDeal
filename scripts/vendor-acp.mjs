// Reproducible source import; never follows a floating upstream branch.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const commit='7fdd78df677a94dce04c770644b0fbbb1401272b';
const version='2025-12-12';
const files={
  'checkout.schema.json':`spec/${version}/json-schema/schema.agentic_checkout.json`,
  'checkout.openapi.yaml':`spec/${version}/openapi/openapi.agentic_checkout.yaml`,
  'webhook.openapi.yaml':`spec/${version}/openapi/openapi.agentic_checkout_webhook.yaml`,
  'LICENSE':'LICENSE',
};
const directory=new URL('../contracts/acp/',import.meta.url);await mkdir(directory,{recursive:true});
const manifest={repository:'https://github.com/agentic-commerce-protocol/agentic-commerce-protocol',commit,version,files:{}};
for(const [name,path] of Object.entries(files)){
  const url=`https://api.github.com/repos/agentic-commerce-protocol/agentic-commerce-protocol/contents/${path}?ref=${commit}`;
  const response=await fetch(url);if(!response.ok)throw new Error(`Source import failed: ${response.status}`);
  const data=Buffer.from((await response.json()).content,'base64');
  await writeFile(new URL(name,directory),data);
  manifest.files[name]={path,sha256:createHash('sha256').update(data).digest('hex')};
}
await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');
console.log(`Vendored ACP ${version} at ${commit}`);
