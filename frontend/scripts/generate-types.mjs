import {readFile,writeFile} from 'node:fs/promises';
import {compile} from 'json-schema-to-typescript';
const source=JSON.parse(await readFile(new URL('../../contracts/a2a-commerce.v0.3.schema.json',import.meta.url),'utf8'));
// Flatten validation conditionals for type generation only. Runtime Ajv keeps every constraint.
function simplify(value){if(Array.isArray(value))return value.map(simplify);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([k])=>!['allOf','if','then','else','contains','minContains','maxContains','minItems','maxItems','minItems','maxItems'].includes(k)).map(([k,v])=>[k,simplify(v)]));}
const defs=simplify(source.$defs);
const root={title:'CommerceTypes',type:'object',properties:Object.fromEntries(Object.keys(defs).map(k=>[k,{$ref:'#/$defs/'+k}])),required:Object.keys(defs),additionalProperties:false,$defs:defs};
const text=await compile(root,'CommerceTypes',{bannerComment:'/* Generated from contracts/a2a-commerce.v0.3.schema.json. Run npm run generate:types; do not edit. */',style:{singleQuote:true},additionalProperties:false});
await writeFile(new URL('../src/contract.generated.ts',import.meta.url),text);
console.log('Generated frontend/src/contract.generated.ts from shared schema');
const purchase=JSON.parse(await readFile(new URL('../../contracts/purchase.v1.schema.json',import.meta.url),'utf8'));
await writeFile(new URL('../src/purchase.generated.ts',import.meta.url),await compile(simplify(purchase),'PurchaseTypes',{bannerComment:'/* Generated from purchase.v1.schema.json; do not edit. */',style:{singleQuote:true}}));
const api=JSON.parse(await readFile(new URL('../../backend/openapi.json',import.meta.url),'utf8'));
const paths=Object.fromEntries(Object.entries(api.paths).flatMap(([path,methods])=>Object.entries(methods).filter(([method,op])=>['get','post'].includes(method)&&op.operationId).map(([,op])=>[op.operationId,path])));
await writeFile(new URL('../src/api/routes.generated.ts',import.meta.url),'/* Generated from backend/openapi.json. */\nexport const apiPaths = '+JSON.stringify(paths,null,2)+' as const;\n');
