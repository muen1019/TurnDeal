import {createHash,randomUUID} from 'node:crypto';
import {assertValid} from '../schema.js';
import {preferenceDocument} from './preferences.js';
import {parseContext,parseResult} from './schema.js';
import type {Candidate,ImprovementContext,ImprovementResult,ImprovementStorage,Job,PreferenceDocument,SqlRow} from './types.js';

const terminal=(status:string)=>['ready','needs_clarification','failed'].includes(status);
export class ImprovementRepository {
  constructor(private readonly storage:ImprovementStorage){}
  globalPreference(buyer:string):PreferenceDocument {
    const row=this.storage.rows('SELECT revision,markdown FROM improver_global_preferences WHERE buyer_id=? ORDER BY revision DESC LIMIT 1',[buyer])[0];
    return preferenceDocument(row?String(row.markdown):'',row?Number(row.revision):0);
  }
  /** Explicit user editor integration only; request-scoped documents never call this automatically. */
  saveGlobalPreference(buyer:string,markdown:string,baseRevision:number):PreferenceDocument {
    const document=preferenceDocument(markdown,baseRevision+1);
    return this.storage.transaction(()=>{
      this.storage.ensureBuyer(buyer);
      if(this.globalPreference(buyer).revision!==baseRevision)throw new Error('preference_version_conflict');
      this.insertPreference(buyer,document);return document;
    });
  }
  private insertPreference(buyer:string,document:PreferenceDocument){
    this.storage.run('INSERT INTO improver_global_preferences VALUES(?,?,?,?)',[buyer,document.revision,document.markdown,this.storage.now().toISOString()]);
  }

  /** Compatibility entry point for existing explicitly saved rejections. */
  enqueueRejectedRequest(buyer:string,requestId:string):Job {
    return this.enqueueSelection(buyer,requestId);
  }
  enqueueSelection(buyer:string,requestId:string):Job {
    return this.storage.transaction(()=>{
      const snapshot=this.storage.snapshot(requestId,buyer);
      const existing=this.storage.rows('SELECT * FROM improver_jobs WHERE parent_request_id=? AND buyer_id=?',[requestId,buyer])[0];
      if(existing)return this.decode(existing);
      if(!['accepted','rejected'].includes(snapshot.status)||!snapshot.decision||!snapshot.intent||!snapshot.ranked_offers.length)throw new Error('saved_round_rejection_required');
      const decision=snapshot.decision;
      const accepted=decision.action==='accept';
      const source=accepted?snapshot.documents:decision.source_documents;
      if(JSON.stringify(source)!==JSON.stringify(snapshot.documents))throw new Error('source_documents_mismatch');
      const ranked=new Set(snapshot.ranked_offers.map(o=>o.offer_id));
      const submitted=decision.rejected_offer_ids??(accepted?[]:[...ranked]);
      const ids=new Set(submitted);
      if(!ids.size||ids.size!==submitted.length||[...ids].some(id=>!ranked.has(id))||(!accepted&&ids.size!==ranked.size)||(accepted&&ids.has(decision.selected_offer_id)))throw new Error('rejection_set_invalid');
      const offers=snapshot.offers.filter(o=>ids.has(o.offer_id));
      const savedDecision=this.storage.rows('SELECT created_at FROM decisions WHERE request_id=? AND result_json IS NOT NULL',[requestId])[0];
      if(!savedDecision||offers.length!==ids.size||offers.some(o=>o.eligibility.status!=='eligible'||(!accepted&&Date.parse(o.expires_at)<=Date.parse(String(savedDecision.created_at)))))throw new Error('rejection_set_invalid_or_expired');
      const improvement_id=`imp_${randomUUID()}`;
      const context:ImprovementContext={
        improvement_id,buyer_id:buyer,parent_request_id:requestId,root_request_id:snapshot.root_request_id,
        source_documents:source,hard_constraints:snapshot.intent,request_preference_revision:null,
        global_preference:this.globalPreference(buyer),
        rejected_offers:offers.map(o=>{
          const items=o.items.map(i=>({product_id:i.product_id,quantity:i.quantity})).sort((a,b)=>a.product_id.localeCompare(b.product_id));
          const terms={items,total_price_twd:o.total_price_twd,delivery_days:o.delivery_days,terms_id:o.terms_id};
          return {offer_id:o.offer_id,...terms,signature:createHash('sha256').update(JSON.stringify(terms)).digest('hex')};
        }),
        evidence:[{evidence_id:'round_rejected',text:accepted?'使用者採用其他方案；以下為採用前的拒絕紀錄。':'使用者已拒絕本輪全部方案。',kind:'rejection'},
          ...(decision.feedback?.trim()?[{evidence_id:'feedback',text:decision.feedback,kind:'user_feedback' as const}]:[])],
        history:this.storage.rows("SELECT result_json FROM improver_jobs WHERE buyer_id=? AND json_extract(context_json,'$.root_request_id')=? AND result_json IS NOT NULL ORDER BY created_at DESC LIMIT 20",[buyer,snapshot.root_request_id])
          .map(r=>parseResult(JSON.parse(String(r.result_json))))
          .filter(r=>this.storage.snapshot(r.parent_request_id,buyer).root_request_id===snapshot.root_request_id)
          .map(r=>({improvement_id:r.improvement_id,status:r.status,intent_md:r.documents.intent_md})),
      };
      assertValid('RequestSnapshot',snapshot);parseContext(context);
      const now=this.storage.now().toISOString();
      this.storage.run('INSERT INTO improver_jobs(improvement_id,buyer_id,parent_request_id,status,context_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[improvement_id,buyer,requestId,'queued',JSON.stringify(context),now,now]);
      return this.get(buyer,improvement_id);
    });
  }
  private decode(row:SqlRow):Job {
    return {improvement_id:String(row.improvement_id),status:row.status as Job['status'],context:parseContext(JSON.parse(String(row.context_json))),attempts:Number(row.attempts),claims:Number(row.claims),lease_token:row.lease_token as string|null,lease_until:row.lease_until===null?null:Number(row.lease_until),result:row.result_json?parseResult(JSON.parse(String(row.result_json))):null,error:row.error as string|null};
  }
  get(buyer:string,id:string):Job {
    const row=this.storage.rows('SELECT * FROM improver_jobs WHERE improvement_id=? AND buyer_id=?',[id,buyer])[0];
    if(!row)throw new Error('improvement_not_found');return this.decode(row);
  }
  pending(buyer:string):string[]{
    return this.storage.rows("SELECT improvement_id FROM improver_jobs WHERE buyer_id=? AND (status='queued' OR (status='running' AND lease_until<=?)) ORDER BY created_at",[buyer,this.storage.now().getTime()]).map(r=>String(r.improvement_id));
  }
  claim(buyer:string,id:string):Job {
    return this.storage.transaction(()=>{
      const job=this.get(buyer,id),now=this.storage.now().getTime();
      if(terminal(job.status))return job;
      if(job.status==='running'&&job.lease_until!>now)throw new Error('improvement_in_progress');
      if(job.claims>=2){
        this.storage.run("UPDATE improver_jobs SET status='failed',error='claim_budget_exhausted',lease_token=NULL,lease_until=NULL,updated_at=? WHERE improvement_id=?",[this.storage.now().toISOString(),id]);
      }else this.storage.run("UPDATE improver_jobs SET status='running',claims=claims+1,lease_token=?,lease_until=?,updated_at=? WHERE improvement_id=?",[randomUUID(),now+90000,this.storage.now().toISOString(),id]);
      return this.get(buyer,id);
    });
  }
  assertLease(buyer:string,id:string,token:string):Job {
    const job=this.get(buyer,id);
    if(job.status!=='running'||job.lease_token!==token||job.lease_until!<=this.storage.now().getTime())throw new Error('lease_lost');
    return job;
  }
  consumeAttempt(buyer:string,id:string,token:string):boolean {
    return this.storage.transaction(()=>{
      const job=this.assertLease(buyer,id,token);if(job.attempts>=2)return false;
      this.storage.run('UPDATE improver_jobs SET attempts=attempts+1 WHERE improvement_id=?',[id]);return true;
    });
  }
  commit(buyer:string,id:string,token:string,candidate:Candidate,expectedRevision:number|null):ImprovementResult {
    return this.storage.transaction(()=>{
      const job=this.assertLease(buyer,id,token);
      const current=this.globalPreference(buyer);
      if(expectedRevision===null&&candidate.status!=='needs_clarification')throw new Error('ready_requires_version_check');
      if(expectedRevision!==null&&current.revision!==expectedRevision)throw new Error('preference_version_conflict');
      const preferenceUpdated=candidate.status==='ready'&&candidate.preference.markdown!==current.markdown;
      const effective=preferenceUpdated?preferenceDocument(candidate.preference.markdown,current.revision+1):current;
      if(preferenceUpdated)this.insertPreference(buyer,effective);
      const intent_revision_id=`ir_${randomUUID()}`;
      const result=parseResult({improvement_id:id,parent_request_id:job.context.parent_request_id,status:candidate.status,intent_revision_id,
        intent_state:candidate.status==='ready'?'ready':'draft',documents:{revision:job.context.source_documents.revision+1,intent_md:candidate.proposal.intent.markdown,preference_md:effective.markdown},
        preference_revision:effective.revision,preference_updated:preferenceUpdated,changes:candidate.proposal.intent.changes,
        questions:candidate.questions,audit:[...new Set(candidate.audit)],provider:candidate.provider});
      this.storage.run('INSERT INTO improver_intent_revisions VALUES(?,?,?,?,?,?,?,?,?,?)',[intent_revision_id,id,job.context.parent_request_id,result.documents.revision,result.intent_state,result.documents.intent_md,effective.revision,effective.markdown,JSON.stringify({proposal:candidate.proposal,audit:result.audit}),this.storage.now().toISOString()]);
      this.storage.run('UPDATE improver_jobs SET status=?,result_json=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE improvement_id=?',[result.status,JSON.stringify(result),this.storage.now().toISOString(),id]);
      return result;
    });
  }
}
