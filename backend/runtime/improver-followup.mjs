import {formatIntent} from '../../src/formatter/parser.ts';
import {preferenceDocument} from '../dist/src/improver/preferences.js';

/** No network or current global preference reads: use the exact committed document revision. */
export function ensureImprovementChild(store,job){
  return store.transaction(()=>{
    const w=store.db.prepare('SELECT * FROM improver_workflows WHERE current_improvement_id=? AND buyer_id=?').get(job.improvement_id,job.context.buyer_id);
    if(!w)return null;
    if(w.next_request_id)return w.next_request_id;
    if(job.status!=='ready'||!job.result)return null;
    const parent=store.snapshot(w.parent_request_id,w.buyer_id);
    if(parent.status!=='rejected')throw new Error('rejected_parent_required');
    const documents=job.result.documents;
    if(documents.revision!==parent.documents.revision+1)throw new Error('revision_mismatch');
    const preference=preferenceDocument(documents.preference_md,job.result.preference_revision);
    const projected=preference.entries.filter(e=>['all_categories','category:mouse'].includes(e.scope)).map(e=>e.value).join('\n');
    const result=formatIntent({intent_md:documents.intent_md,preference_md:projected});
    if(result.status!=='ready'||!result.normalized_intent)throw new Error('child_formatter_unsupported');
    const child=store.create(w.buyer_id,documents,undefined,undefined,undefined,{parent_request_id:parent.request_id}).body;
    store.db.prepare('UPDATE improver_workflows SET next_request_id=?,formatter_json=?,error=NULL WHERE parent_request_id=? AND next_request_id IS NULL').run(child.request_id,JSON.stringify(result),parent.request_id);
    return child.request_id;
  });
}
