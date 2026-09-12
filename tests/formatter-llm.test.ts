import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initializeDatabase} from '../scripts/db.mjs';
import {seedDiscovery} from '../scripts/discovery-db.mjs';
import {createLlmFormatter,formatterSchema} from '../src/formatter/llm.ts';
import {createLlmFormatterService} from '../src/formatter/llm-service.ts';
import {FormatterLlmError} from '../src/formatter/diagnostics.ts';
const input={intent_md:'買黑色滑鼠，最高1000元，7天內到貨',preference_md:''};
const data={category:'mouse',max_total_twd:1000,target_total_twd:null,delivery_days_max:7,budget_evidence:'最高1000元',target_evidence:'',delivery_evidence:'7天內到貨',required_features:['wireless'],preferences:[],
  product_preferences:[{attribute:'color',operator:'in',strength:'required',values:['black'],min:null,max:null,source_text:'黑色'}],bundle_mode:'related_no_extra_cost',questions:[],unsupported_conditions:[]};
const reply=(value:unknown)=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('the real demo wording with Chinese numbers and narrowly quoted budget evidence maps correctly',async()=>{
  const prompt='想找一隻安靜的黑色無線滑鼠，大約八百元，含運最多一千元，七天內收到就好，尺寸小一點優先。';
  const extraction={...data,preferences:['price_first'],target_total_twd:800,budget_evidence:'一千元',target_evidence:'大約八百元',delivery_evidence:'七天內收到就好',
    required_features:['wireless','silent_click'],product_preferences:[...data.product_preferences,
      {attribute:'size_class',operator:'in',strength:'preferred',values:['small'],min:null,max:null,source_text:'尺寸小一點優先'}]};
  const result=await createLlmFormatter({apiKey:'fake-unit-test-key',fetch:async()=>reply(extraction),failureMode:'throw'})({intent_md:prompt});
  assert.equal(result.parser_version,'formatter-llm-v0.1');assert.equal(result.status,'ready');
  assert.equal(result.target_total_twd,800);assert.equal(result.normalized_intent?.max_total_twd,1000);
  assert.deepEqual(result.normalized_intent?.preferences,[]);
  const explicit=await createLlmFormatter({apiKey:'fake-unit-test-key',fetch:async()=>reply(extraction),failureMode:'throw'})({intent_md:prompt+'價格優先'});
  assert.deepEqual(explicit.normalized_intent?.preferences,['price_first']);
  const targetOnly={...extraction,max_total_twd:800,budget_evidence:'大約八百元'};
  await assert.rejects(createLlmFormatter({apiKey:'fake-unit-test-key',fetch:async()=>reply(targetOnly),failureMode:'throw'})({intent_md:prompt}),e=>
    e instanceof FormatterLlmError&&e.diagnostic.code==='output_evidence');
});

test('safe diagnostics distinguish auth, quota, rate, schema, timeout, and never echo error content',async()=>{
  const cases:[number,string,string][]=[[401,'invalid_api_key','authentication'],[429,'insufficient_quota','quota'],
    [429,'rate_limit_exceeded','rate_limit'],[400,'invalid_json_schema','request_schema'],[403,'anything','permission'],[404,'model_not_found','model_unavailable'],[503,'anything','provider_unavailable']];
  for(const [status,code,expected] of cases) {
    const fn=createLlmFormatter({apiKey:'fake-unit-test-key',failureMode:'throw',fetch:async()=>Response.json({error:{code,message:'DO_NOT_LOG_fake-unit-test-key'}},
      {status,headers:{'x-request-id':'req_123456abcdef'}})});
    await assert.rejects(fn(input),e=>{
      assert.ok(e instanceof FormatterLlmError);assert.equal(e.diagnostic.code,expected);assert.equal(e.diagnostic.http_status,status);
      assert.equal(e.diagnostic.request_id,'req_123456abcdef');assert.ok(!JSON.stringify(e).includes('DO_NOT_LOG'));
      assert.ok(!JSON.stringify(e).includes('fake-unit-test-key'));return true;
    });
  }
  await assert.rejects(createLlmFormatter({apiKey:'fake-unit-test-key',failureMode:'throw',timeoutMs:5,fetch:async()=>new Promise(()=>{})})(input),
    e=>e instanceof FormatterLlmError&&e.diagnostic.code==='timeout');
  await assert.rejects(createLlmFormatter({apiKey:'*',failureMode:'throw'})(input),
    e=>e instanceof FormatterLlmError&&e.diagnostic.code==='invalid_key_format');
});

test('strict API failure is not saved as a successful fallback; same key can retry after fixing access',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);let fail=true,calls=0;
    const service=createLlmFormatterService({db,userId:'user_demo_001',registrations:[],timeoutMs:100},
      {apiKey:'fake-unit-test-key',failureMode:'throw',fetch:async()=>{calls++;return fail?Response.json({error:{code:'insufficient_quota'}},{status:429}):reply(data);}});
    const args={...input,idempotency_key:'retry-live'};
    await assert.rejects(service.submit(args),/formatter_llm:quota/);
    assert.equal(db.prepare('SELECT count(*) n FROM formatter_runs').get()?.n,0);
    fail=false;const result=await service.submit(args);assert.equal(result.result.parser_version,'formatter-llm-v0.1');assert.equal(calls,2);
  }finally{db.close();}
});
test('Structured Outputs strict object fields, privacy options, and result mapping',async()=>{
  let calls=0;
  const request:typeof fetch=async(url,init)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init?.redirect,'error');
    const body=JSON.parse(String(init?.body));assert.equal(body.store,false);assert.equal(body.model,'gpt-4.1-mini');
    assert.equal(body.max_output_tokens,1800);assert.equal(body.text.format.strict,true);
    assert.ok(!String(init?.body).includes('fake-unit-test-key'));
    return reply(data);
  };
  const result=await createLlmFormatter({apiKey:'fake-unit-test-key',fetch:request})(input);
  assert.equal(result.parser_version,'formatter-llm-v0.1');assert.equal(result.status,'ready');assert.equal(calls,1);
  function strict(s:any){if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual([...s.required].sort(),Object.keys(s.properties).sort());}for(const v of Object.values(s))if(v&&typeof v==='object')strict(v);}
  strict(formatterSchema);
});
test('malformed, HTTP error, refusal, truncation, hallucinated values and timeout fall back without leaking provider errors',async()=>{
  const failures:typeof fetch[]=[
    async()=>new Response('private-provider-error',{status:401}),
    async()=>Response.json({status:'incomplete',output:[]}),
    async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private-provider-error'}]}]}),
    async()=>reply({...data,max_total_twd:9999}),
    async()=>reply({...data,unknown:true}),
    async()=>{throw new Error('private-provider-error');},
    async()=>new Promise(()=>{}),
  ];
  for(const request of failures){const r=await createLlmFormatter({apiKey:'fake-unit-test-key',fetch:request,timeoutMs:15})(input);
    assert.equal(r.parser_version,'formatter-rules-v0.1');assert.ok(r.warnings.some(w=>w.includes('LLM')));assert.ok(!JSON.stringify(r).includes('private-provider-error'));}
});
test('async service uses persisted result, no repeat provider call, concurrent local dedup, no credential persistence',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    initializeDatabase(db);const catalog=seedDiscovery(db);let calls=0;
    const service=createLlmFormatterService({db,userId:'user_demo_001',registrations:[],timeoutMs:100},{apiKey:'fake-unit-test-key',fetch:async()=>{calls++;return reply(data);}});
    const args={...input,idempotency_key:'llm-first',snapshot_id:catalog.snapshot_id};
    const [a,b]=await Promise.all([service.prepare_from_text(args),service.prepare_from_text(args)]);
    assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.result.parser_version,'formatter-llm-v0.1');
    assert.deepEqual(await service.prepare_from_text(args),a);assert.equal(calls,1);
    await assert.rejects(service.submit({...args,intent_md:'other'}),/idempotency_conflict/);
    const stored=JSON.stringify(db.prepare('SELECT * FROM formatter_runs').all());assert.ok(!stored.includes('fake-unit-test-key'));
    await assert.rejects(service.submit({intent_md:'sk-'+ 'x'.repeat(30),idempotency_key:'secret'}),/credential_detected/);
    assert.equal(db.prepare('SELECT count(*) n FROM formatter_runs').get()?.n,1);
  }finally{db.close();}
});
