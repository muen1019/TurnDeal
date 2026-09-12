import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createRuntimeApp} from '../backend/runtime/app.mjs';
import {refinementQuestions} from '../src/formatter/refinement.mjs';
import {formatIntent} from '../src/formatter/parser.ts';
import {rankOffers} from '../src/evaluator/index.mjs';
import {validateRanking,deterministicRanking} from '../src/evaluator/ranking.mjs';
import {readFileSync} from 'node:fs';
const request=createRequire(new URL('../backend/package.json',import.meta.url))('supertest');

test('bare mouse price is a target, never an unknown token or authorized maximum',()=>{
 const r=formatIntent({intent_md:'1000元滑鼠'});
 assert.equal(r.target_total_twd,1000);assert.equal(r.status,'needs_clarification');assert.equal(r.questions.length,2);assert.ok(!r.questions.some(q=>q.includes('尚未理解')));
});
test('weighted color projection survives model and fallback ranking',async()=>{
 const s=JSON.parse(readFileSync(new URL('../contracts/fixtures/result-v0.3.json',import.meta.url),'utf8')).snapshot;
 const offers=s.offers.filter(o=>o.eligibility.status==='eligible').slice(0,2).map((o,i)=>({...o,total_price_twd:i?950:500}));
 const input={request_id:s.request_id,evaluated_at:'2026-01-01T00:00:00Z',intent:{...s.intent,preferences:[],ranking_weights:{price:1,delivery:0,trust:0,color:99},product_preferences:[{preference_id:'blue',attribute:'color',operator:'in',strength:'preferred',values:['blue'],source_text:'偏好藍色'}]},offers,seller_trust:s.seller_agents.filter(s=>offers.some(o=>o.seller_id===s.seller_id)).map(s=>({seller_id:s.seller_id,trust:s.trust})),color_matches:offers.map((o,i)=>({offer_id:o.offer_id,score:i?100:0}))};
 for(const fail of [false,true]){
  const result=await rankOffers({input,now:()=>Date.parse(input.evaluated_at),gateway:{decide:async({input:projected})=>{assert.deepEqual(projected.color_matches,input.color_matches);if(fail)throw Error('model_timeout');return deterministicRanking(projected);},summary:()=>({})}});
  validateRanking(result.output,input);assert.equal(result.output.ranked_offers[0].offer_id,offers[1].offer_id);
 }
});
test('rejection makes one durable questions child; answers rerun full pipeline without rewriting parent',async()=>{
 const app=createRuntimeApp({autoProcess:false,buyerId:r=>r.headers['x-buyer']??'demo'}),store=app.locals.store;
 const post=(body,key)=>request(app).post('/api/requests').set('Idempotency-Key',key).send(body);
 try{
  const original=(await post({intent_md:'買無線滑鼠，最高預算1000元，7天內到貨'},'first').expect(202)).body;
  await store.process(original.request_id,'demo');const published=store.snapshot(original.request_id,'demo');assert.equal(published.status,'awaiting_user');
  await request(app).post(`/api/requests/${original.request_id}/decisions`).set('Idempotency-Key','reject').send({action:'reject',feedback:'不夠便宜，希望更划算'}).expect(200);
  const parent=store.snapshot(original.request_id,'demo');
  const body={intent_md:parent.documents.intent_md,preference_md:parent.documents.preference_md,refinement:{parent_request_id:parent.request_id}};
  const child=(await post(body,'refine').expect(202)).body;
  assert.equal(child.parent_request_id,parent.request_id);assert.equal(child.documents.revision,2);
  assert.equal((await post(body,'refine-again').expect(202)).body.request_id,child.request_id);
  await request(app).post('/api/requests').set('x-buyer','other').set('Idempotency-Key','intruder').send(body).expect(404);
  await post({...body,clarification:{parent_request_id:parent.request_id,answers:[{question_id:'x',answer:'a'}]}},'mixed').expect(400);
  await store.process(child.request_id,'demo');const questions=store.snapshot(child.request_id,'demo');assert.equal(questions.status,'needs_clarification');assert.equal(questions.formatter.provider,'rules');
  const answered=(await post({intent_md:questions.documents.intent_md,preference_md:questions.documents.preference_md,clarification:{parent_request_id:child.request_id,answers:questions.formatter.questions.map((q,i)=>({question_id:q.question_id,answer:i?'維持原有其他條件':'價格優先'}))}},'answer').expect(202)).body;
  await store.process(answered.request_id,'demo');const result=store.snapshot(answered.request_id,'demo');
  assert.equal(result.status,'awaiting_user',JSON.stringify(result.error));assert.ok(result.ranked_offers.length);assert.equal(result.intent.max_total_twd,1000);assert.equal(result.intent.delivery_days_max,7);assert.equal(result.root_request_id,parent.request_id);assert.deepEqual(store.snapshot(parent.request_id,'demo'),parent);
  assert.deepEqual(result.intent.preferences,['price_first']);
 }finally{await store.close();}
});
test('refinement uses stronger model, passes no checkout/private catalog, and validates output',async()=>{
 const parent={intent:{max_total_twd:1000},documents:{preference_md:'偏好藍色'},decision:{feedback:'希望安靜'}};
 const result=await refinementQuestions(parent,{apiKey:'fake',fetch:async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.model,'gpt-5.6-sol');assert.deepEqual(body.reasoning,{effort:'none'});assert.equal(body.store,false);assert.ok(!JSON.stringify(body.input).includes('shipping_address'));
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({questions:[{field:'other',text:'需要靜音按鍵嗎？',options:['靜音','維持原有其他條件']}]})}]}]});
 }});
 assert.equal(result.provider,'openai');assert.equal(result.questions[0].suggestions[0].value,'靜音');
 const bad=await refinementQuestions(parent,{apiKey:'fake',fetch:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"questions":[]}'}]}]})});assert.equal(bad.provider,'rules');
});
