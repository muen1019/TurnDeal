import Ajv from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fail } from './common.mjs';
const acp=JSON.parse(readFileSync(new URL('../../../contracts/acp/checkout.schema.json',import.meta.url),'utf8'));
const local=JSON.parse(readFileSync(new URL('../../../contracts/purchase.v1.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv({strict:false,allErrors:true});formats(ajv);ajv.addSchema(acp);ajv.addSchema(local);
const cache=new Map();
export function valid(name,value,wire=false){const key=(wire?acp.$id:local.$id)+'#/$defs/'+name;let v=cache.get(key);if(!v){v=ajv.compile({$ref:key});cache.set(key,v);}return v(value);}
export function validate(name,value,wire=false){if(!valid(name,value,wire))fail(wire?502:400,wire?'invalid_acp_response':'invalid_request',`資料不符合 ${name} 契約`);return value;}
