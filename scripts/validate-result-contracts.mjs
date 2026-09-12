import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const Ajv=require('ajv/dist/2020').default;const formats=require('ajv-formats').default;
const read=async name=>JSON.parse(await readFile(new URL('../'+name,import.meta.url),'utf8'));
const schema=await read('contracts/a2a-commerce.v0.3.schema.json');
const openapi=await read('backend/openapi.json');
const fixture=await read('contracts/fixtures/result-v0.3.json');
const examples=await read('contracts/fixtures/result-api-v0.3.json');
const sharedFixture=await read('contracts/fixtures/happy-path.json');
const sharedExamples=await read('contracts/fixtures/api-examples.json');
assert.deepEqual(fixture.snapshot,sharedFixture.snapshot,'Result and shared snapshots must agree');
for(const [name,item] of Object.entries(examples))if(item?.http)assert.deepEqual(item,sharedExamples[name],`Shared API example differs: ${name}`);
const ajv=new Ajv({strict:false,allErrors:true});formats(ajv);ajv.addSchema(schema);
function valid(name,value){const check=ajv.compile({$ref:`${schema.$id}#/$defs/${name}`});assert.ok(check(value),`${name}: ${JSON.stringify(check.errors)}`);}
valid('RequestSnapshot',fixture.snapshot);
for(const [name,item] of Object.entries(examples)){
 if(!item?.http)continue;
 const create=name==='create_request';valid(create?'CreateRequest':name==='accept_decision'?'AcceptDecision':'RejectDecision',item.body);
 valid(create?'RequestSnapshot':'DecisionResult',item.response);
 assert.equal(item.expected_status_code,create?202:200);
}
assert.deepEqual(Object.keys(openapi.paths).sort(),['/api/requests','/api/requests/{request_id}','/api/requests/{request_id}/decisions']);
assert.deepEqual(Object.keys(openapi.paths['/api/requests/{request_id}/decisions'].post.responses).sort(),['200','400','404','409','410','500']);
function refs(value){if(!value||typeof value!=='object')return;for(const [key,v] of Object.entries(value)){
 if(key==='$ref'){
  if(v.startsWith('../contracts/')){assert.ok(v.startsWith('../contracts/a2a-commerce.v0.3.schema.json#/$defs/'));assert.ok(schema.$defs[v.split('/').at(-1)]);}
  else if(v.startsWith('#/')){let node=openapi;for(const part of v.slice(2).split('/'))node=node?.[part];assert.ok(node,`Unresolved ${v}`);}
 }else refs(v);
}}
refs(openapi);
const rejected={...fixture.snapshot,status:'rejected',decision:examples.reject_decision_alternative.response};valid('RequestSnapshot',rejected);
for(const changed of [{...rejected,decision:null},{...rejected,status:'superseded'},{...rejected,next_request_id:'child'}])assert.equal(ajv.compile({$ref:`${schema.$id}#/$defs/RequestSnapshot`})(changed),false);
console.log('Unified Result v0.3: schema, lifecycle, examples and all OpenAPI references passed.');
