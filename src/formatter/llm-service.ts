import { createFormatterService } from './service.ts';
import type { SubmitText } from './service.ts';
import { createLlmFormatter,mergeSaved } from './llm.ts';
import { assertContract } from '../orchestrator/contract.ts';
import {preferenceStore} from './preference-store.ts';
import {effectivePreferenceText,preferenceDocument} from '../../backend/dist/src/improver/preferences.js';

export function createLlmFormatterService(options:Parameters<typeof createFormatterService>[0],
  providerOptions:Parameters<typeof createLlmFormatter>[0]={}) {
  const extract=createLlmFormatter(providerOptions);
  const base=createFormatterService(options);
  const pending=new Map<string,{input:string;promise:ReturnType<typeof execute>}>();
  async function execute(args:SubmitText) {
    const input={intent_md:args.intent_md,preference_md:args.preference_md??''};
    const profiles=preferenceStore(options.db,options.now);
    const profile=(options.existingRequestId?profiles.forRequest(options.userId,options.existingRequestId):null)??profiles.current(options.userId);
    const projected=profile.revision===0?preferenceDocument(input.preference_md,0):profile;
    const result=await extract({...input,preference_md:effectivePreferenceText(projected)},profile.saved_preferences??[]); // No SQLite transaction held over network await.
    return createFormatterService({...options,preferenceSnapshot:profile,formatter:(_,saved)=>mergeSaved(result,saved)}).submit(args);
  }
  async function submit(args:SubmitText) {
    const input={intent_md:args.intent_md,preference_md:args.preference_md??''};
    assertContract('CreateRequest',input);
    if(typeof args.idempotency_key!=='string'||!args.idempotency_key.length||args.idempotency_key.length>128) throw new Error('invalid_idempotency_key');
    if(!options.db.prepare('SELECT 1 FROM users WHERE user_id=?').get(options.userId)) throw new Error('not_found: user');
    const serialized=JSON.stringify(input);
    const row=options.db.prepare('SELECT input_json FROM formatter_runs WHERE user_id=? AND idempotency_key=?').get(options.userId,args.idempotency_key);
    if(row) {
      if(row.input_json!==serialized) throw new Error('idempotency_conflict');
      return base.submit(args); // Read persisted result without another API call.
    }
    const existing=pending.get(args.idempotency_key);
    if(existing) {if(existing.input!==serialized)throw new Error('idempotency_conflict');return existing.promise;}
    const promise=execute(args);pending.set(args.idempotency_key,{input:serialized,promise});
    try{return await promise;}finally{pending.delete(args.idempotency_key);}
  }
  async function prepareFromText(args:SubmitText&{snapshot_id:string}) {
    await submit(args);
    return base.prepare_from_text(args); // Reuses the stored LLM result, not the rule parser.
  }
  return {submit,prepare_from_text:prepareFromText,dispatch_first_round:base.dispatch_first_round};
}
