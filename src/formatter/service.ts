import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ProductPreference } from '../orchestrator/data-tools.ts';
import {preferenceStore} from './preference-store.ts';
import {effectivePreferenceText} from '../../backend/dist/src/improver/preferences.js';
import { createOrchestratorHandoff } from '../orchestrator/handoff.ts';
import type { SellerRegistration } from '../orchestrator/handoff.ts';
import { assertContract } from '../orchestrator/contract.ts';
import { formatIntent } from './parser.ts';
import type { FormatResult } from './parser.ts';
import type {PreferenceDocument} from '../../backend/src/improver/types.ts';

export type SubmitText = { intent_md: string; preference_md?: string; idempotency_key: string };
type Submission = { request_id: string; result: FormatResult };

export function readSavedPreferences(db:DatabaseSync,userId:string) {
  const profile=preferenceStore(db).current(userId);
  return {rows:[],preferences:profile.saved_preferences??[],invalid:profile.issues??[]};
}

export function createFormatterService(options: {
  db: DatabaseSync; userId: string; registrations: SellerRegistration[]; timeoutMs: number; now?: () => Date;
  formatter?: typeof formatIntent;
  // Backend-only: complete a previously persisted HTTP formatting request.
  existingRequestId?: string;
  rankingWeights?: {price:number;delivery:number;trust:number;color:number};
  preferenceSnapshot?:PreferenceDocument;
}) {
  const {db,userId}=options;
  const now=options.now??(()=>new Date());
  const handoff=createOrchestratorHandoff(options);
  function submit(args:SubmitText):Submission {
    const input={intent_md:args.intent_md,preference_md:args.preference_md??''};
    assertContract('CreateRequest',input);
    if(typeof args.idempotency_key!=='string'||!args.idempotency_key.length||args.idempotency_key.length>128) throw new Error('invalid_idempotency_key');
    db.exec('SAVEPOINT format_request');
    try {
      if(!db.prepare('SELECT 1 FROM users WHERE user_id=?').get(userId)) throw new Error('not_found: user');
      const previous=db.prepare('SELECT * FROM formatter_runs WHERE user_id=? AND idempotency_key=?').get(userId,args.idempotency_key);
      if(previous) {
        if(previous.input_json!==JSON.stringify(input)) throw new Error('idempotency_conflict');
        if(options.existingRequestId && previous.request_id!==options.existingRequestId) throw new Error('idempotency_conflict');
        db.exec('RELEASE format_request');
        return {request_id:String(previous.request_id),result:JSON.parse(String(previous.result_json))};
      }
      const profiles=preferenceStore(db,now);
      if(options.preferenceSnapshot&&!options.existingRequestId&&profiles.current(userId).revision!==options.preferenceSnapshot.revision)
        throw new Error('preference_version_conflict');
      const profile=(options.existingRequestId?profiles.forRequest(userId,options.existingRequestId):null)
        ??profiles.forSubmission(userId,input.preference_md);
      const preferences:ProductPreference[]=profile.saved_preferences??[];
      const invalid=(profile.issues??[]).map(()=> '已儲存偏好有舊資料衝突或不支援的格式，請確認並重新儲存使用者偏好。');
      const result=(options.formatter??formatIntent)({intent_md:input.intent_md,preference_md:effectivePreferenceText(profile)},preferences);
      const weights=profile.ranking_weights??options.rankingWeights;
      if(weights&&result.normalized_intent){assertContract('RankingWeights',weights);result.normalized_intent.ranking_weights={...weights};}
      if(invalid.length) {result.status='needs_clarification';result.normalized_intent=null;result.questions.push(...invalid);}
      assertContract('FormatterResult',result);
      const requestId=options.existingRequestId??`req_${randomUUID()}`;
      const timestamp=now().toISOString();
      if(options.existingRequestId) {
        const existing=db.prepare('SELECT * FROM requests WHERE request_id=? AND user_id=?').get(requestId,userId);
        if(!existing) throw new Error('not_found: request');
        if(existing.status!=='formatting'||existing.published_snapshot_json!==null||existing.intent_md!==input.intent_md||existing.preference_md!==input.preference_md) throw new Error('state_conflict');
        db.prepare('UPDATE requests SET normalized_intent_json=?,status=?,updated_at=? WHERE request_id=?')
          .run(JSON.stringify(result.normalized_intent),result.status==='ready'?'orchestrating':'needs_clarification',timestamp,requestId);
      } else {
      db.prepare(`INSERT INTO requests (request_id,user_id,parent_request_id,revision,intent_md,preference_md,
        normalized_intent_json,status,published_snapshot_json,created_at,updated_at) VALUES (?,?,NULL,1,?,?,?,?,NULL,?,?)`)
        .run(requestId,userId,input.intent_md,profile.markdown,JSON.stringify(result.normalized_intent),
          result.status==='ready'?'orchestrating':'needs_clarification',timestamp,timestamp);
      }
      if(!profiles.forRequest(userId,requestId))profiles.bind(userId,requestId,profile);
      db.prepare('INSERT INTO formatter_runs VALUES (?,?,?,?,?,?,?)').run(requestId,userId,args.idempotency_key,
        JSON.stringify(input),JSON.stringify(profile),JSON.stringify(result),timestamp);
      db.exec('RELEASE format_request');
      return {request_id:requestId,result};
    } catch(e) {db.exec('ROLLBACK TO format_request');db.exec('RELEASE format_request');throw e;}
  }
  function prepareFromText(args:SubmitText & {snapshot_id:string}) {
    const submission=submit(args);
    if(submission.result.status!=='ready') return {...submission,handoff:null};
    const plan=handoff.prepare({request_id:submission.request_id,snapshot_id:args.snapshot_id,
      idempotency_key:`formatter:${submission.request_id}`,
      ...(submission.result.target_total_twd===null?{}:{target_total_twd:submission.result.target_total_twd})});
    return {...submission,handoff:plan};
  }
  // Explicit separate call: formatting/preparing never starts negotiation automatically.
  return {submit,prepare_from_text:prepareFromText,dispatch_first_round:handoff.dispatch_first_round};
}
