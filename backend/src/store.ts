import initSqlJs from 'sql.js';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type {AcceptDecisionResult,DocumentBundle,RejectDecisionResult,RequestSnapshot} from './types.js';
import {HttpError,notFound,offerExpired,stateConflict} from './httpError.js';
import {runDemoPipeline,verifyTrustedOffer} from './mockResultProvider.js';
import {assertValid} from './schema.js';
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
  if(existing&&db.exec('PRAGMA user_version')[0]?.values[0][0]!==2){db.close();throw new Error('Use a new v0.2 database; legacy data is not overwritten.');}
  db.run(`PRAGMA user_version=2;
   CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,buyer TEXT NOT NULL,snapshot TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS offers(id TEXT PRIMARY KEY,request_id TEXT NOT NULL,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS decisions(request_id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS idempotency(buyer TEXT,method TEXT,path TEXT,key TEXT,hash TEXT NOT NULL,state TEXT NOT NULL,status INTEGER,body TEXT,PRIMARY KEY(buyer,method,path,key));`);
  store.transaction(()=>{for(const row of store.rows('SELECT * FROM requests')){const s=JSON.parse(String(row.snapshot)) as RequestSnapshot;if(s.status==='formatting'){s.status='failed';s.error={code:'processing_interrupted',message:'Mock generation was interrupted by restart.',fields:[]};store.save(s);}}
   db.run("DELETE FROM idempotency WHERE state='processing'");},false);return store;
 }
 close(){this.closed=true;this.db.close();}
 private rows(sql:string,args:(string|number|null)[]=[]):Row[]{const stmt=this.db.prepare(sql);try{stmt.bind(args);const result:Row[]=[];while(stmt.step())result.push(stmt.getAsObject() as Row);return result;}finally{stmt.free();}}
 private transaction<T>(fn:()=>T,inject=true):T{
  const before=this.db.export();this.db.run('BEGIN IMMEDIATE');
  try{const result=fn();if(inject)this.options.beforeCommit?.();this.db.run('COMMIT');this.persist();return result;}
  catch(error){const Ctor=this.db.constructor as new(data:Uint8Array)=>initSqlJs.Database;this.db.close();this.db=new Ctor(before);throw error;}
 }
 private persist(){if(this.options.dbPath===':memory:')return;mkdirSync(dirname(this.options.dbPath),{recursive:true});const temp=`${this.options.dbPath}.tmp`;writeFileSync(temp,this.db.export(),{flush:true});renameSync(temp,this.options.dbPath);}
 snapshot(id:string,buyer:string):RequestSnapshot{const row=this.rows('SELECT snapshot FROM requests WHERE id=? AND buyer=?',[id,buyer])[0];if(!row)throw notFound();return assertValid<RequestSnapshot>('RequestSnapshot',JSON.parse(String(row.snapshot)));}
 private save(s:RequestSnapshot){assertValid('RequestSnapshot',s);this.db.run('UPDATE requests SET snapshot=? WHERE id=?',[JSON.stringify(s),s.request_id]);}
 async withIdempotency(buyer:string,method:string,path:string,key:string,payload:unknown,operation:()=>Result):Promise<Result>{
  const scope=[buyer,method,path,key];const hash=createHash('sha256').update(canonicalJson(payload)).digest('hex');
  const row=this.rows('SELECT * FROM idempotency WHERE buyer=? AND method=? AND path=? AND key=?',scope)[0];
  if(row){if(row.hash!==hash)throw new HttpError(409,'idempotency_conflict','Key already belongs to another payload.');if(row.state==='completed')return{status:Number(row.status),body:JSON.parse(String(row.body))};throw new HttpError(409,'request_in_progress','Original request is processing.',[],{'Retry-After':'1'});}
  this.transaction(()=>this.db.run("INSERT INTO idempotency VALUES(?,?,?,?,?,'processing',NULL,NULL)",[...scope,hash]),false);
  try{await this.options.afterIdempotencyReserved?.({method,path,key});
   // Synchronous business effects and original response commit atomically.
   return this.transaction(()=>{const result=operation();this.db.run("UPDATE idempotency SET state='completed',status=?,body=? WHERE buyer=? AND method=? AND path=? AND key=?",[result.status,JSON.stringify(result.body),...scope]);return result;});
  }catch(error){this.transaction(()=>this.db.run("DELETE FROM idempotency WHERE buyer=? AND method=? AND path=? AND key=? AND state='processing'",scope),false);throw error;}
 }
 createRequest(buyer:string,documents:Omit<DocumentBundle,'revision'>):Result<RequestSnapshot>{
  const id=`req_${randomUUID()}`;const s:RequestSnapshot={request_id:id,root_request_id:id,parent_request_id:null,status:'formatting',documents:{revision:1,...documents},intent:null,seller_agents:[],discovery_exclusions:[],sponsored_placement:null,offers:[],ranked_offers:[],confirmation_offer_ids:[],selected_offer_id:null,next_request_id:null,error:null,decision:null};
  assertValid('RequestSnapshot',s);this.db.run('INSERT INTO requests VALUES(?,?,?)',[id,buyer,JSON.stringify(s)]);return{status:202,body:s,scheduleRequestId:id};
 }
 processRequest(id:string){
  if(this.closed)return;const row=this.rows('SELECT * FROM requests WHERE id=?',[id])[0];if(!row)return;const s=this.snapshot(id,String(row.buyer));if(s.status!=='formatting')return;
  let result:Partial<RequestSnapshot>;try{result=runDemoPipeline(id,s.documents,this.options.now());}catch{result={status:'failed',error:{code:'processing_unavailable',message:'Mock generation failed.',fields:[]}};}
  this.transaction(()=>{const current=this.snapshot(id,String(row.buyer));if(current.status!=='formatting'||current.documents.revision!==s.documents.revision)return;const published={...current,...result};this.save(published);for(const offer of published.offers)this.db.run('INSERT INTO offers VALUES(?,?,?)',[offer.offer_id,id,JSON.stringify(offer)]);});
 }
 acceptDecision(buyer:string,id:string,offerId:string):Result<AcceptDecisionResult>{
  const s=this.snapshot(id,buyer);if(s.status!=='awaiting_user')throw stateConflict();const offer=s.offers.find(o=>o.offer_id===offerId);if(!offer)throw notFound();
  if(!s.ranked_offers.some(r=>r.offer_id===offerId)||offer.eligibility.status!=='eligible')throw stateConflict();if(this.options.now().getTime()>=Date.parse(offer.expires_at))throw offerExpired();
  const original=this.rows('SELECT body FROM offers WHERE id=? AND request_id=?',[offerId,id])[0];if(!original||String(original.body)!==JSON.stringify(offer)||!verifyTrustedOffer(offer,s.documents))throw stateConflict('Offer no longer matches trusted fixture conditions.');
  const result:AcceptDecisionResult={action:'accept',request_id:id,status:'accepted',selected_offer_id:offerId,expires_at:offer.expires_at};this.db.run('INSERT INTO decisions VALUES(?,?)',[id,JSON.stringify(result)]);this.save({...s,status:'accepted',selected_offer_id:offerId,error:null,decision:result});return{status:200,body:result};
 }
 rejectDecision(buyer:string,id:string,feedback:string):Result<RejectDecisionResult>{
  const s=this.snapshot(id,buyer);if(!['awaiting_user','no_match','needs_confirmation'].includes(s.status))throw stateConflict();const result:RejectDecisionResult={action:'reject',request_id:id,status:'rejected',feedback,source_documents:s.documents as DocumentBundle};assertValid('RejectDecisionResult',result);this.db.run('INSERT INTO decisions VALUES(?,?)',[id,JSON.stringify(result)]);this.save({...s,status:'rejected',error:null,decision:result});return{status:200,body:result};
 }
}
function canonicalJson(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;return JSON.stringify(value);}
