import {fallback,validateCandidate} from './guard.js';
import {ImprovementRepository} from './repository.js';
import type {Candidate,IntentNormalizer,Job,RevisionProvider} from './types.js';

/** One bounded worker invocation. Retry orchestration uses repository.pending after lease expiry. */
export class BuyerRequestImprover {
  constructor(readonly repository:ImprovementRepository,private provider:RevisionProvider|null,private timeoutMs=30000,private normalize?:IntentNormalizer){}
  async run(buyer:string,id:string):Promise<Job>{
    const job=this.repository.claim(buyer,id);
    if(job.status!=='running')return job;
    const token=job.lease_token!;
    let context=structuredClone(job.context);
    context.global_preference=this.repository.globalPreference(buyer);
    const hasFeedback=context.evidence.some(e=>e.kind==='user_feedback'&&e.text.trim());
    let candidate:Candidate=fallback(context,!hasFeedback?'rejection_reason_missing':this.provider?'model_budget_exhausted':'provider_not_configured');
    const errors:string[]=[];
    while(hasFeedback&&this.provider&&this.repository.consumeAttempt(buyer,id,token)){
      const controller=new AbortController();
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        const value=await Promise.race([
          this.provider.generate(structuredClone(context),errors,controller.signal),
          new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('provider_timeout'));},this.timeoutMs);}),
        ]);
        candidate=validateCandidate(context,value,this.provider.kind,this.normalize);break;
      }catch(error){
        // Never persist arbitrary provider messages or payloads (could contain credentials/user text).
        const message=error instanceof Error?error.message:'';
        const code=/^(intent_diff_or_evidence_invalid|intent_revision_missing|unauthorized_intent_change|preference_base_revision_invalid|provider_(timeout|refused|incomplete|invalid_json|invalid_output|http_\d+))$/.test(message)?message:message.startsWith('proposal_invalid:')?'proposal_invalid':'provider_unavailable';
        errors.push(code);candidate=fallback(context,code);
        if(code.startsWith('provider_'))break;
      }finally{if(timer)clearTimeout(timer);}
    }
    try{
      this.repository.commit(buyer,id,token,candidate,context.global_preference.revision);
    }catch(error){
      if(!(error instanceof Error)||error.message!=='preference_version_conflict')throw error;
      const latest=this.repository.globalPreference(buyer);
      const old=context.global_preference;
      context={...context,global_preference:latest};
      let conflicting=false;
      if(candidate.proposal.preference.action==='patch'){
        for(const op of candidate.proposal.preference.operations){
          const before=old.entries.find(e=>e.preference_id===op.preference_id);
          const after=latest.entries.find(e=>e.preference_id===op.preference_id);
          if(JSON.stringify(before)!==JSON.stringify(after))conflicting=true;
        }
      }
      if(conflicting||candidate.provider==='fallback')candidate=fallback(context,'preference_version_conflict');
      else{
        const proposal=structuredClone(candidate.proposal);
        if(proposal.preference.action==='patch')proposal.preference.base_revision=latest.revision;
        candidate=validateCandidate(context,proposal,candidate.provider,this.normalize);
        candidate.audit.push('preference_rebased');
      }
      try{
        this.repository.commit(buyer,id,token,candidate,latest.revision);
      }catch(secondError){
        if(!(secondError instanceof Error)||secondError.message!=='preference_version_conflict')throw secondError;
        // No further rebase: save only a safe draft, binding the latest preference inside the transaction.
        this.repository.commit(buyer,id,token,fallback(context,'preference_version_conflict'),null);
      }
    }
    return this.repository.get(buyer,id);
  }
  async recover(buyer:string):Promise<Job[]>{
    const results:Job[]=[];
    for(const id of this.repository.pending(buyer))results.push(await this.run(buyer,id));
    return results;
  }
}
