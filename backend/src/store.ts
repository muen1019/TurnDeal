import initSqlJs from 'sql.js';
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type {AcceptDecisionResult,DocumentBundle,RejectDecisionResult,RequestSnapshot} from './types.js';
import {HttpError,notFound,offerExpired,stateConflict} from './httpError.js';
import {runDemoPipeline,verifyTrustedOffer} from './mockResultProvider.js';
import {assertValid,isValid} from './schema.js';
import {migrateDatabase,seedCatalog} from './database.js';
type Options={dbPath:string;now:()=>Date;autoProcess?:boolean;afterIdempotencyReserved?:(scope:{method:string;path:string;key:string})=>Promise<void>|void;beforeCommit?:()=>void};
type Result<T=unknown>={status:number;body:T;scheduleRequestId?:string};
type Row=Record<string,string|number|null>;
/** One resident backend owns this SQLite file. */
export class OfferStore {
 private closed=false;
 private constructor(private db:initSqlJs.Database,private options:Options){}
 static async open(options:Options){
  const SQL=await initSqlJs();const existing=options.dbPath!==':memory:'&&existsSync(options.dbPath);
  const db=existing?new SQL.Database(readFileSync(options.dbPath)):new SQL.Database();const store=new OfferStore(db,options);
  const legacy=db.exec("PRAGMA table_info(requests)")[0]?.values.some(row=>row[1]==='id');
  const needsMigration=legacy || !db.exec("SELECT name FROM sqlite_master WHERE name='schema_migrations'").length || !db.exec("SELECT version FROM schema_migrations WHERE version='003_result_decisions'").length;
  if(existing && needsMigration)copyFileSync(options.dbPath,`${options.dbPath}.pre-v03-${Date.now()}.bak`);
  let saved:Record<string,Row[]>|null=null;
  if(legacy){saved=Object.fromEntries(['requests','offers','decisions','idempotency'].map(table=>[table,store.rows(`SELECT * FROM ${table}`)]));for(const table of ['requests','offers','decisions','idempotency'])db.run(`ALTER TABLE ${table} RENAME TO legacy_result_${table}`);}
  migrateDatabase(db);seedCatalog(db);
  store.transaction(()=>{
    if(saved){
      for(const row of saved.requests){
        const snapshot=upgradeSnapshot(JSON.parse(String(row.snapshot)));store.ensureBuyer(String(row.buyer));
        store.insertRequest(String(row.buyer),snapshot);store.publish(snapshot);
        if(snapshot.decision)store.insertDecision(snapshot.request_id,snapshot.decision);
      }
      for(const row of saved.idempotency){
        const body=row.body?JSON.parse(String(row.body)):null;if(body?.seller_agents)upgradeSnapshot(body);
        store.ensureBuyer(String(row.buyer));db.run('INSERT INTO idempotency_keys(user_id,method,route,idempotency_key,request_hash,state,response_status,response_body_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[row.buyer,row.method,row.path,row.key,row.hash,row.state,row.status,body?JSON.stringify(body):null,options.now().toISOString(),'9999-12-31T23:59:59Z']);
      }
    }
    // Add a current read model for compatible main snapshots, without changing the frozen original.
    for(const row of store.rows("SELECT request_id,published_snapshot_json FROM requests WHERE result_state_json IS NULL AND published_snapshot_json IS NOT NULL")){
      const snapshot=upgradeSnapshot(JSON.parse(String(row.published_snapshot_json)));
      if(isValid('RequestSnapshot',snapshot)){store.save(snapshot);db.run("UPDATE requests SET contract_version='0.3' WHERE request_id=?",[snapshot.request_id]);}
    }
    for(const row of store.rows("SELECT request_id,user_id,result_state_json FROM requests WHERE result_state_json IS NOT NULL")){
      const snapshot=JSON.parse(String(row.result_state_json)) as RequestSnapshot;
      if(snapshot.status==='formatting'){snapshot.status='failed';snapshot.error={code:'processing_interrupted',message:'Mock generation was interrupted by restart.',fields:[]};store.save(snapshot);}
    }
    db.run("DELETE FROM idempotency_keys WHERE state='processing'");
  },false);return store;
 }

 close(){this.closed=true;this.db.close();}
 private rows(sql:string,args:(string|number|null)[]=[]):Row[]{const stmt=this.db.prepare(sql);try{stmt.bind(args);const result:Row[]=[];while(stmt.step())result.push(stmt.getAsObject() as Row);return result;}finally{stmt.free();}}
 private transaction<T>(fn:()=>T,inject=true):T{
  const before=this.db.export();this.db.run('BEGIN IMMEDIATE');
  try{const result=fn();if(inject)this.options.beforeCommit?.();this.db.run('COMMIT');this.persist();return result;}
  catch(error){const Ctor=this.db.constructor as new(data:Uint8Array)=>initSqlJs.Database;this.db.close();this.db=new Ctor(before);this.db.run('PRAGMA foreign_keys=ON');throw error;}
 }
 private persist(){if(this.options.dbPath===':memory:')return;mkdirSync(dirname(this.options.dbPath),{recursive:true});const temp=`${this.options.dbPath}.tmp`;writeFileSync(temp,this.db.export(),{flush:true});renameSync(temp,this.options.dbPath);}
 private ensureBuyer(buyer:string){const time=this.options.now().toISOString();this.db.run('INSERT OR IGNORE INTO users VALUES(?,?,?,?)',[buyer,buyer,time,time]);}
 snapshot(id:string,buyer:string):RequestSnapshot{
  const row=this.rows('SELECT result_state_json FROM requests WHERE request_id=? AND user_id=?',[id,buyer])[0];
  if(!row?.result_state_json)throw notFound();return assertValid<RequestSnapshot>('RequestSnapshot',JSON.parse(String(row.result_state_json)));
 }
 private save(s:RequestSnapshot){
  assertValid('RequestSnapshot',s);this.db.run('UPDATE requests SET status=?,normalized_intent_json=?,result_state_json=?,updated_at=? WHERE request_id=?',[s.status,JSON.stringify(s.intent),JSON.stringify(s),this.options.now().toISOString(),s.request_id]);
 }
 private insertRequest(buyer:string,s:RequestSnapshot){
  const time=this.options.now().toISOString();assertValid('RequestSnapshot',s);
  this.db.run('INSERT INTO requests(request_id,user_id,parent_request_id,revision,intent_md,preference_md,normalized_intent_json,status,result_state_json,contract_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[s.request_id,buyer,s.parent_request_id,s.documents.revision,s.documents.intent_md,s.documents.preference_md,JSON.stringify(s.intent),s.status,JSON.stringify(s),'0.3',time,time]);
 }
 private publish(s:RequestSnapshot){
  const time=this.options.now().toISOString();
  for(const seller of s.seller_agents){
   this.db.run('INSERT INTO request_sellers(request_id,seller_id,listing_rank,match_reason,candidate_products_json,status,final_offer_ids_json,stop_reason) VALUES(?,?,?,?,?,?,?,?)',[s.request_id,seller.seller_id,seller.listing_rank,seller.match_reason,JSON.stringify(seller.candidate_products),seller.status,JSON.stringify(seller.final_offer_ids),seller.stop_reason]);
   for(const round of seller.rounds)this.db.run('INSERT INTO negotiation_rounds(request_id,seller_id,round,outcome,is_final,buyer_message,seller_message,drafts_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[s.request_id,seller.seller_id,round.round,round.outcome,Number(round.is_final),'Mock request','Mock response','[]',time,time]);
  }
  for(const o of s.offers)this.db.run('INSERT INTO offers(offer_id,request_id,seller_id,round,variant,baseline_offer_id,items_json,primary_features_json,total_price_twd,delivery_days,terms_id,optional_addons,expires_at,eligibility_status,eligibility_reason_codes_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[o.offer_id,s.request_id,o.seller_id,o.round,o.variant,o.baseline_offer_id,JSON.stringify(o.items),JSON.stringify(o.primary_features),o.total_price_twd,o.delivery_days,o.terms_id,Number(o.optional_addons),o.expires_at,o.eligibility.status==='eligible'?'eligible':'ineligible',JSON.stringify(o.eligibility.reason_codes),time]);
  if(s.status!=='formatting')this.db.run('UPDATE requests SET published_snapshot_json=COALESCE(published_snapshot_json,?) WHERE request_id=?',[JSON.stringify(s),s.request_id]);
 }
 private insertDecision(id:string,result:AcceptDecisionResult|RejectDecisionResult){
  this.db.run('INSERT INTO decisions(decision_id,request_id,offer_id,action,created_at,result_json) VALUES(?,?,?,?,?,?)',[`decision_${randomUUID()}`,id,result.action==='accept'?result.selected_offer_id:null,result.action==='accept'?'accept':'reject_all',this.options.now().toISOString(),JSON.stringify(result)]);
 }
 async withIdempotency(buyer:string,method:string,path:string,key:string,payload:unknown,operation:()=>Result):Promise<Result>{
  const scope=[buyer,method,path,key];const hash=createHash('sha256').update(canonicalJson(payload)).digest('hex');
  const row=this.rows('SELECT request_hash AS hash,state,response_status AS status,response_body_json AS body FROM idempotency_keys WHERE user_id=? AND method=? AND route=? AND idempotency_key=?',scope)[0];
  if(row){if(row.hash!==hash)throw new HttpError(409,'idempotency_conflict','Key already belongs to another payload.');if(row.state==='completed')return{status:Number(row.status),body:JSON.parse(String(row.body))};throw new HttpError(409,'request_in_progress','Original request is processing.',[],{'Retry-After':'1'});}
  this.transaction(()=>{this.ensureBuyer(buyer);this.db.run("INSERT INTO idempotency_keys(user_id,method,route,idempotency_key,request_hash,state,created_at,expires_at) VALUES(?,?,?,?,?,'processing',?,?)",[...scope,hash,this.options.now().toISOString(),'9999-12-31T23:59:59Z']);},false);
  try{await this.options.afterIdempotencyReserved?.({method,path,key});
   // Synchronous business effects and original response commit atomically.
   return this.transaction(()=>{const result=operation();this.db.run("UPDATE idempotency_keys SET state='completed',response_status=?,response_body_json=? WHERE user_id=? AND method=? AND route=? AND idempotency_key=?",[result.status,JSON.stringify(result.body),...scope]);return result;});
  }catch(error){this.transaction(()=>this.db.run("DELETE FROM idempotency_keys WHERE user_id=? AND method=? AND route=? AND idempotency_key=? AND state='processing'",scope),false);throw error;}
 }
 createRequest(buyer:string,documents:Omit<DocumentBundle,'revision'>):Result<RequestSnapshot>{
  const id=`req_${randomUUID()}`;const s:RequestSnapshot={request_id:id,root_request_id:id,parent_request_id:null,status:'formatting',documents:{revision:1,...documents},intent:null,seller_agents:[],discovery_exclusions:[],sponsored_placement:null,offers:[],ranked_offers:[],confirmation_offer_ids:[],selected_offer_id:null,next_request_id:null,error:null,decision:null};
  this.ensureBuyer(buyer);this.insertRequest(buyer,s);return{status:202,body:s,scheduleRequestId:id};
 }
 processRequest(id:string){
  if(this.closed)return;const row=this.rows('SELECT * FROM requests WHERE request_id=?',[id])[0];if(!row)return;const s=this.snapshot(id,String(row.user_id));if(s.status!=='formatting')return;
  let result:Partial<RequestSnapshot>;try{result=runDemoPipeline(id,s.documents,this.options.now());}catch{result={status:'failed',error:{code:'processing_unavailable',message:'Mock generation failed.',fields:[]}};}
  this.transaction(()=>{const current=this.snapshot(id,String(row.user_id));if(current.status!=='formatting'||current.documents.revision!==s.documents.revision)return;const published={...current,...result};this.save(published);this.publish(published);});
 }
 acceptDecision(buyer:string,id:string,offerId:string):Result<AcceptDecisionResult>{
  const s=this.snapshot(id,buyer);if(s.status!=='awaiting_user')throw stateConflict();const offer=s.offers.find(o=>o.offer_id===offerId);if(!offer)throw notFound();
  if(!s.ranked_offers.some(r=>r.offer_id===offerId)||offer.eligibility.status!=='eligible')throw stateConflict();if(this.options.now().getTime()>=Date.parse(offer.expires_at))throw offerExpired();
  const original=this.rows('SELECT * FROM offers WHERE offer_id=? AND request_id=?',[offerId,id])[0];
  const available=offer.items.every(item=>{const stock=this.rows('SELECT stock FROM seller_inventory WHERE seller_id=? AND product_id=?',[offer.seller_id,item.product_id])[0];return stock && Number(stock.stock)>=item.quantity;});
  if(!original||Number(original.total_price_twd)!==offer.total_price_twd||String(original.items_json)!==JSON.stringify(offer.items)||!available||!verifyTrustedOffer(offer,s.documents))throw stateConflict('Offer no longer matches trusted fixture conditions.');
  const result:AcceptDecisionResult={action:'accept',request_id:id,status:'accepted',selected_offer_id:offerId,expires_at:offer.expires_at};this.insertDecision(id,result);this.save({...s,status:'accepted',selected_offer_id:offerId,error:null,decision:result});return{status:200,body:result};
 }
 rejectDecision(buyer:string,id:string,feedback:string):Result<RejectDecisionResult>{
  const s=this.snapshot(id,buyer);if(!['awaiting_user','no_match','needs_confirmation'].includes(s.status))throw stateConflict();const result:RejectDecisionResult={action:'reject',request_id:id,status:'rejected',feedback,source_documents:s.documents as DocumentBundle};assertValid('RejectDecisionResult',result);this.insertDecision(id,result);this.save({...s,status:'rejected',error:null,decision:result});return{status:200,body:result};
 }
}
function canonicalJson(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;return JSON.stringify(value);}

function upgradeSnapshot(s:RequestSnapshot):RequestSnapshot {
 for(const seller of s.seller_agents??[]){
  for(const round of seller.rounds)round.is_final??=false;
  seller.stop_reason??=seller.rounds.at(-1)?.round===5?'max_rounds':'no_adjustment';
 }
 s.decision??=null;return s;
}
