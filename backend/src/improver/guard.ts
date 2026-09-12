import {normalizeIntent} from '../mockResultProvider.js';
import type {NormalizedIntent} from '../types.js';
import type {Candidate, ImprovementContext, IntentNormalizer, PreferenceDocument, RevisionProposal} from './types.js';
import {applyPreferencePatch, supportedStatements} from './preferences.js';
import {parseProposal} from './schema.js';

export const clarificationQuestion = '請說明這次哪些條件需要改變，例如新的預算上限、交期或商品偏好；未明示的硬條件會保留。';

export function fallback(context: ImprovementContext, reason: string): Candidate {
  const original=context.source_documents.intent_md;
  const note='\n\n## 本輪改善紀錄\n本輪有未採用的方案；拒絕原因與調整方向待澄清，保留原始購買條件。';
  const feedback=context.evidence.find(e=>e.kind==='user_feedback');
  const append=note+(feedback?`\n待解析回饋（原文）：\n${feedback.text}`:'');
  const markdown=[...original+append].length<=20000?original+append:original;
  return {
    proposal:{intent:{markdown,changes:[{target:'intent_md',before:original,after:markdown,evidence_ids:context.evidence.map(e=>e.evidence_id)}]},preference:{action:'keep'},outcome:'needs_clarification',questions:[clarificationQuestion]},
    preference:context.global_preference,status:'needs_clarification',questions:[clarificationQuestion],audit:[reason],provider:'fallback',
  };
}

/** Deliberately bounded directives. Unrecognized language does not authorize a hard-constraint change. */
export function authorizedIntent(context: ImprovementContext): {markdown:string;recognized:boolean} {
  let markdown=context.source_documents.intent_md;
  let recognized=true;
  const feedback=context.evidence.find(e=>e.kind==='user_feedback');
  const statements=supportedStatements(context.evidence);
  if(!feedback)return {markdown,recognized:false};
  for(const sentence of feedback.text.split(/[\n。!！?？;；]/).map(s=>s.trim()).filter(Boolean)){
    const budget=sentence.match(/^(?:這次)?預算改成\s*([1-9]\d{0,7})\s*元(?:[，,]\s*其他條件不變)?$/);
    const delivery=sentence.match(/^(?:這次)?(?:交期改成|希望)\s*([1-9]\d{0,2})\s*天內(?:到貨|送達)(?:[，,]\s*其他條件不變)?$/);
    if(budget){
      const expression=/(預算|含稅運|budget|under|twd|nt\$)\s*(?:改成|為|:|：)?\s*(?:twd|nt\$)?\s*\d+/gi;
      if(!expression.test(markdown))recognized=false;
      markdown=markdown.replace(expression,(_match,prefix:string)=>`${prefix} ${budget[1]}`);
    }else if(delivery){markdown=markdown.replace(/\d+\s*(天|days?)/gi,(_match,unit:string)=>`${delivery[1]} ${unit}`);}
    else if(/^(?:這次)?(?:想|希望)?便宜一點$/.test(sentence)){markdown+='\n價格優先';}
    else if(sentence==='其他條件不變') { /* Explicit preservation. */ }
    else {
      const statement=statements.find(s=>s.quote===sentence);
      if(statement?.value==='偏好小尺寸')markdown+='\n偏好小尺寸';
      else if(statement?.value==='價格優先')markdown+='\n價格優先';
      else recognized=false; // Durability, free-form text and unsupported revocations need a richer Formatter.
    }
  }
  return {markdown,recognized};
}

function semantic(intent: NormalizedIntent): string {
  // Ranking weights are a separately frozen account setting, never a text-authorized hard constraint.
  const {ranking_weights:_weights,...purchaseIntent}=intent;
  return JSON.stringify({...purchaseIntent,required_features:[...intent.required_features].sort(),
    product_preferences:intent.product_preferences.map(({source_text,preference_id,...p})=>p).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
}
function hardSemantic(intent:NormalizedIntent):string {
  return semantic({...intent,preferences:[],product_preferences:intent.product_preferences.filter(p=>p.strength==='required')});
}
function effectivePreferenceSupported(preference: PreferenceDocument): boolean {
  const unmanaged=preference.markdown.replace(/<!-- offermesh-preference:[\s\S]*?<!-- \/offermesh-preference -->/g,'').replace(/^\s*#{1,6}[^\n]*$/gm,'').trim();
  return !unmanaged && preference.entries.every(e=>e.scope==='category:mouse_pad' || ['偏好小尺寸','價格優先'].includes(e.value));
}

function effectivePreferenceText(preference: PreferenceDocument): string {
  return preference.entries.filter(e=>e.scope==='all_categories'||e.scope==='category:mouse').map(e=>e.value).join('\n');
}

export function validateCandidate(context: ImprovementContext, value: unknown, provider: Candidate['provider'],normalize:IntentNormalizer=normalizeIntent): Candidate {
  const proposal=parseProposal(value);
  const evidenceIds=new Set(context.evidence.map(e=>e.evidence_id));
  const changes=proposal.intent.changes;
  // Complete-document diff is intentional: it is simple to validate without trusting model descriptions.
  if(changes.length!==1 || changes[0].before!==context.source_documents.intent_md || changes[0].after!==proposal.intent.markdown || !changes[0].evidence_ids.length || changes[0].evidence_ids.some(id=>!evidenceIds.has(id)))throw new Error('intent_diff_or_evidence_invalid');
  if(!proposal.intent.markdown.trim() || proposal.intent.markdown===context.source_documents.intent_md)throw new Error('intent_revision_missing');
  let preference=context.global_preference;
  const audit:string[]=[];
  if(proposal.preference.action==='patch'){
    if(proposal.preference.base_revision!==preference.revision)throw new Error('preference_base_revision_invalid');
    const applied=applyPreferencePatch(preference,proposal.preference.operations,context.evidence);
    preference=applied.document;audit.push(...applied.audit);
  }
  const authorized=authorizedIntent(context);
  let ready=false;
  try{
    const expected=normalize({...context.source_documents,intent_md:authorized.markdown});
    // Validate the actual effective documents, not the obsolete request preference snapshot.
    const candidate=normalize({...context.source_documents,intent_md:proposal.intent.markdown,preference_md:effectivePreferenceText(preference)});
    if(semantic(candidate)!==semantic(expected))throw new Error('unauthorized_intent_change');
    // Also protect inherited constraints that were normalized from SQLite, not visible in source Markdown.
    const permittedHard={...context.hard_constraints,max_total_twd:expected.max_total_twd,delivery_days_max:expected.delivery_days_max};
    if(hardSemantic(candidate)!==hardSemantic(permittedHard))throw new Error('unauthorized_intent_change');
    ready=authorized.recognized && semantic(expected)!==semantic(context.hard_constraints) && effectivePreferenceSupported(preference);
    // A dropped preference patch cannot authorize an unrelated intent change: expected derives only from user evidence.
  }catch(error){
    if(error instanceof Error && error.message==='unauthorized_intent_change')throw error;
    // Unsupported arbitrary prose cannot be certified as preserving constraints. Preserve the source instead.
    const safe=fallback(context,'formatter_unsupported');
    safe.audit.push(...audit);return safe;
  }
  if(proposal.outcome==='needs_clarification')ready=false;
  if(!ready)audit.push('no_verified_actionable_change');
  return {proposal,preference:ready?preference:context.global_preference,status:ready?'ready':'needs_clarification',questions:ready?[]:[clarificationQuestion],audit,provider};
}

/** No API needed; fixture strategy uses the same evidence rules and validation as the model. */
export function deterministicProposal(context: ImprovementContext): RevisionProposal {
  const authorized=authorizedIntent(context);
  const base=authorized.markdown===context.source_documents.intent_md?authorized.markdown+'\n':authorized.markdown;
  // Preserve request-scoped preferences when the follow-up switches to the committed global document.
  const priorPreference=context.source_documents.preference_md.trim();
  const markdown=priorPreference&&!base.includes(priorPreference)?base+'\n'+priorPreference:base;
  const operations=supportedStatements(context.evidence).filter(s=>!context.global_preference.entries.some(e=>e.scope===s.scope&&e.value===s.value)).map((s,i)=>({
    operation:'add' as const,preference_id:`explicit_${context.improvement_id}_${i}`,before:null,value:s.value,scope:s.scope,evidence_id:s.evidence_id,explicit_quote:s.quote,
  }));
  return {intent:{markdown,changes:[{target:'intent_md',before:context.source_documents.intent_md,after:markdown,evidence_ids:context.evidence.map(e=>e.evidence_id)}]},
    preference:operations.length?{action:'patch',base_revision:context.global_preference.revision,operations}:{action:'keep'},
    outcome:authorized.recognized?'ready':'needs_clarification',questions:authorized.recognized?[]:[clarificationQuestion]};
}
