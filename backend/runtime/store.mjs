import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { initializeDatabase, applyMigrations } from '../../scripts/db.mjs';
import { seedDiscovery } from '../../scripts/discovery-db.mjs';
import { applySalesProfiles } from '../../scripts/lib/sales-profiles.mjs';
import { createLlmFormatterService } from '../../src/formatter/llm-service.ts';
import { createFormatterService } from '../../src/formatter/service.ts';
import { NegotiationRepository } from '../../src/negotiation/repository.mjs';
import { negotiate } from '../../src/negotiation/manager.mjs';
import { evaluate, recoverInterruptedEvaluations } from '../../src/evaluator/index.mjs';
import { revalidateOffers } from '../../src/evaluator/validation.mjs';
import { assertContract } from '../../src/orchestrator/contract.ts';
import { HttpError } from '../src/httpError.ts';
import { prepareConfiguredHandoff } from './catalog.mjs';

const active = ['formatting','orchestrating','negotiating','evaluating'];
const fail = (status,code,message) => {throw new HttpError(status,code,message);};
const canonical = v => Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;

export class RuntimeStore {
  pending = new Map();
  constructor({dbPath=':memory:',apiKey='',now=()=>Date.now(),formatterOptions={},negotiationOptions={},evaluatorOptions={}}={}) {
    this.now=now;this.apiKey=apiKey;this.formatterOptions=formatterOptions;
    this.negotiationOptions=negotiationOptions;this.evaluatorOptions=evaluatorOptions;
    if(dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true});
    const existing=dbPath!==':memory:'&&existsSync(dbPath);
    this.db=new DatabaseSync(dbPath);const db=this.db;
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000');
    if(existing) {
      const applied=new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r=>r.version));
      const missing=readdirSync(new URL('../../db/migrations/',import.meta.url)).some(f=>f.endsWith('.sql')&&!applied.has(f.slice(0,-4)));
      if(missing)db.prepare('VACUUM INTO ?').run(`${dbPath}.backup-${Date.now()}.sqlite`);
      applyMigrations(db);
    } else {
      initializeDatabase(db);seedDiscovery(db);applySalesProfiles(db);
    }
    this.repository=new NegotiationRepository(db);
    this.repository.recoverInterrupted();recoverInterruptedEvaluations(db);
    // Startup only: never silently repeat a paid call after a crash.
    for(const row of db.prepare('SELECT * FROM requests WHERE result_state_json IS NOT NULL').all()) {
      const s=JSON.parse(row.result_state_json);
      if(active.includes(s.status)) {
        if(row.published_snapshot_json) {
          const published=JSON.parse(row.published_snapshot_json);
          this.transaction(()=>{this.projectOffers(published);this.save(published);});
        } else this.save({...s,status:'failed',error:{code:'processing_interrupted',message:'上次處理因服務重啟中斷，請建立新需求；未重複呼叫模型。',fields:[]}});
      }
    }
  }
  async close(){await Promise.allSettled(this.pending.values());this.db.close();}
  transaction(work){return this.repository.transaction(work);}
  ensureBuyer(buyer){const time=new Date(this.now()).toISOString();this.db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?)').run(buyer,buyer,time,time);}
  snapshot(id,buyer){
    const r=this.db.prepare('SELECT result_state_json FROM requests WHERE request_id=? AND user_id=?').get(id,buyer);
    if(!r?.result_state_json)fail(404,'not_found','找不到這筆需求。');
    const s=JSON.parse(r.result_state_json);assertContract('RequestSnapshot',s);return s;
  }
  save(s){
    assertContract('RequestSnapshot',s);
    this.db.prepare('UPDATE requests SET status=?,result_state_json=?,updated_at=? WHERE request_id=?')
      .run(s.status,JSON.stringify(s),new Date(this.now()).toISOString(),s.request_id);
  }
  idempotent(buyer,method,route,key,payload,work){
    if(typeof key!=='string'||!key.length||[...key].length>128)fail(400,'invalid_request','POST 需要 Idempotency-Key。');
    if(/sk-[A-Za-z0-9_-]{20,}/.test(key))fail(400,'credential_detected','請勿將 API key 作為 Idempotency-Key。');
    const scope=[buyer,method,route,key],hash=createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
    return this.transaction(()=>{
      this.ensureBuyer(buyer);
      const row=this.db.prepare('SELECT * FROM idempotency_keys WHERE user_id=? AND method=? AND route=? AND idempotency_key=?').get(...scope);
      if(row){if(row.request_hash!==hash)fail(409,'idempotency_conflict','相同 key 不可提交不同內容。');return {status:row.response_status,body:JSON.parse(row.response_body_json)};}
      const result=work();
      this.db.prepare(`INSERT INTO idempotency_keys(user_id,method,route,idempotency_key,request_hash,state,response_status,response_body_json,created_at,expires_at)
        VALUES(?,?,?,?,?,'completed',?,?,?,?)`).run(...scope,hash,result.status,JSON.stringify(result.body),new Date(this.now()).toISOString(),'9999-12-31T23:59:59Z');
      return result;
    });
  }
  create(buyer,documents){
    const id=`req_${randomUUID()}`,time=new Date(this.now()).toISOString();
    const s={request_id:id,root_request_id:id,parent_request_id:null,status:'formatting',documents:{revision:1,...documents},
      intent:null,seller_agents:[],discovery_exclusions:[],sponsored_placement:null,offers:[],ranked_offers:[],confirmation_offer_ids:[],selected_offer_id:null,next_request_id:null,error:null,decision:null};
    assertContract('RequestSnapshot',s);
    this.db.prepare(`INSERT INTO requests(request_id,user_id,revision,intent_md,preference_md,normalized_intent_json,status,result_state_json,contract_version,created_at,updated_at)
      VALUES(?,?,1,?,?,'null','formatting',?,'0.3',?,?)`).run(id,buyer,documents.intent_md,documents.preference_md,JSON.stringify(s),time,time);
    return {status:202,body:s,scheduleRequestId:id};
  }
  process(id,buyer){
    if(this.pending.has(id))return this.pending.get(id);
    if(this.snapshot(id,buyer).status!=='formatting')return Promise.resolve();
    const promise=this.run(id,buyer).catch(()=>{
      const s=this.snapshot(id,buyer);
      this.save({...s,status:'failed',error:{code:'processing_unavailable',message:'流程未完成。未採用任何商品，請確認服務設定後建立新需求。',fields:[]}});
    }).finally(()=>this.pending.delete(id));
    this.pending.set(id,promise);return promise;
  }
  async run(id,buyer){
    const initial=this.snapshot(id,buyer);
    const formatterConfig={db:this.db,userId:buyer,registrations:[],timeoutMs:30000,existingRequestId:id,now:()=>new Date(this.now())};
    const formatter=this.apiKey?createLlmFormatterService(formatterConfig,{apiKey:this.apiKey,...this.formatterOptions}):createFormatterService(formatterConfig);
    const {result}=await formatter.submit({intent_md:initial.documents.intent_md,preference_md:initial.documents.preference_md,idempotency_key:`http:${id}`});
    let s={...initial,intent:result.normalized_intent,status:result.status==='ready'?'orchestrating':'needs_clarification',
      error:result.status==='ready'?null:{code:'needs_clarification',message:result.questions.join(' '),fields:['intent_md']}};
    this.save(s);if(result.status!=='ready')return;
    const plan=prepareConfiguredHandoff(this.db,buyer,id,result.target_total_twd,new Date(this.now()));
    s={...s,...plan.orchestration};
    if(!s.seller_agents.length){this.save({...s,status:'no_match',error:{code:'no_eligible_sellers',message:'已設定議價策略的賣家沒有符合硬條件的商品；未放寬預算或交期。',fields:[]}});return;}
    s={...s,status:'negotiating'};this.save(s);
    await negotiate({requestId:id,buyerId:buyer,orchestration:plan.orchestration,repository:this.repository,
      apiKey:this.apiKey,now:this.now,...this.negotiationOptions,onEvent:event=>{
        if(event.type==='round_committed') {
          const row=this.db.prepare('SELECT state_json FROM negotiation_commits WHERE request_id=? ORDER BY revision DESC LIMIT 1').get(id);
          const state=JSON.parse(row.state_json);
          // Whitelist only public contract fields, NEVER traces/prompts/private catalog.
          s={...s,seller_agents:state.seller_agents,offers:state.offers};this.save(s);
        }
      }});
    this.save({...s,status:'evaluating'});
    const evaluated=await evaluate({db:this.db,requestId:id,buyerId:buyer,apiKey:this.apiKey,now:this.now,...this.evaluatorOptions});
    this.transaction(()=>{this.projectOffers(evaluated.snapshot);this.save(evaluated.snapshot);});
  }
  projectOffers(s){
    for(const b of s.seller_agents)this.db.prepare(`INSERT OR IGNORE INTO request_sellers(request_id,seller_id,listing_rank,match_reason,candidate_products_json,status,final_offer_ids_json,stop_reason)
      VALUES(?,?,?,?,?,?,?,?)`).run(s.request_id,b.seller_id,b.listing_rank,b.match_reason,JSON.stringify(b.candidate_products),b.status,JSON.stringify(b.final_offer_ids),b.stop_reason);
    for(const o of [...s.offers].sort((a,b)=>Number(a.variant==='bundle')-Number(b.variant==='bundle'))) {
      const provenance=this.db.prepare('SELECT offer_json FROM negotiation_offers WHERE request_id=? AND offer_id=?').get(s.request_id,o.offer_id);
      if(!provenance||provenance.offer_json!==JSON.stringify(o))throw new Error('offer_provenance_invalid');
      const old=this.db.prepare('SELECT items_json,total_price_twd FROM offers WHERE offer_id=?').get(o.offer_id);
      if(old){if(old.items_json!==JSON.stringify(o.items)||old.total_price_twd!==o.total_price_twd)throw new Error('immutable_offer_conflict');continue;}
      this.db.prepare(`INSERT INTO offers(offer_id,request_id,seller_id,round,variant,baseline_offer_id,items_json,primary_features_json,total_price_twd,delivery_days,terms_id,optional_addons,expires_at,eligibility_status,eligibility_reason_codes_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.offer_id,s.request_id,o.seller_id,o.round,o.variant,o.baseline_offer_id,JSON.stringify(o.items),JSON.stringify(o.primary_features),o.total_price_twd,o.delivery_days,o.terms_id,Number(o.optional_addons),o.expires_at,o.eligibility.status==='eligible'?'eligible':'ineligible',JSON.stringify(o.eligibility.reason_codes),new Date(this.now()).toISOString());
    }
  }
  decide(buyer,id,body){
    const s=this.snapshot(id,buyer);let result;
    if(body.action==='accept') {
      if(s.status!=='awaiting_user')fail(409,'state_conflict','本輪無法採用商品。');
      const offer=s.offers.find(o=>o.offer_id===body.offer_id);
      if(!offer)fail(404,'not_found','方案不屬於此需求。');
      if(Date.parse(offer.expires_at)<=this.now())fail(410,'offer_expired','報價已過期，請重新取得方案。');
      if(!s.ranked_offers.some(r=>r.offer_id===offer.offer_id)||offer.eligibility.status!=='eligible')fail(409,'state_conflict','此方案不可採用。');
      const run=this.db.prepare('SELECT input_json FROM negotiation_runs WHERE request_id=?').get(id);
      if(!run)fail(409,'state_conflict','缺少可驗證的議價紀錄。');
      const source=JSON.parse(run.input_json);
      const valid=revalidateOffers({offers:s.offers,intent:s.intent,catalog:this.repository.catalog(source.orchestration.seller_agents.map(x=>x.seller_id)),originalCatalog:source.catalog,orchestration:source.orchestration,now:this.now()});
      const original=this.db.prepare('SELECT offer_json FROM negotiation_offers WHERE offer_id=? AND request_id=?').get(offer.offer_id,id);
      const stored=this.db.prepare('SELECT * FROM offers WHERE offer_id=? AND request_id=?').get(offer.offer_id,id);
      if(!valid.some(o=>o.offer_id===offer.offer_id)||original?.offer_json!==JSON.stringify(offer)||!stored||stored.total_price_twd!==offer.total_price_twd||stored.items_json!==JSON.stringify(offer.items)||stored.expires_at!==offer.expires_at||stored.delivery_days!==offer.delivery_days||stored.terms_id!==offer.terms_id)fail(409,'state_conflict','報價或庫存已改變，請重新取得方案。');
      result={action:'accept',request_id:id,status:'accepted',selected_offer_id:offer.offer_id,expires_at:offer.expires_at};
    } else {
      if(!['awaiting_user','no_match','needs_confirmation'].includes(s.status))fail(409,'state_conflict','本輪無法送出回饋。');
      result={action:'reject',request_id:id,status:'rejected',feedback:body.feedback,source_documents:s.documents};
    }
    assertContract(result.action==='accept'?'AcceptDecisionResult':'RejectDecisionResult',result);
    this.db.prepare('INSERT INTO decisions(decision_id,request_id,offer_id,action,created_at,result_json) VALUES(?,?,?,?,?,?)')
      .run(`decision_${randomUUID()}`,id,result.selected_offer_id??null,result.action==='accept'?'accept':'reject_all',new Date(this.now()).toISOString(),JSON.stringify(result));
    this.save({...s,status:result.status,selected_offer_id:result.selected_offer_id??null,decision:result,error:null});
    return {status:200,body:result};
  }
}
