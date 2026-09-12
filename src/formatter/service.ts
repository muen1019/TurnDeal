import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ProductPreference } from '../orchestrator/data-tools.ts';
import { validatePreferences } from '../orchestrator/preferences.ts';
import { createOrchestratorHandoff } from '../orchestrator/handoff.ts';
import type { SellerRegistration } from '../orchestrator/handoff.ts';
import { assertContract } from '../orchestrator/contract.ts';
import { formatIntent } from './parser.ts';
import type { FormatResult } from './parser.ts';

export type SubmitText = { intent_md: string; preference_md?: string; idempotency_key: string };
type Submission = { request_id: string; result: FormatResult };

export function readSavedPreferences(db:DatabaseSync,userId:string) {
  const rows=db.prepare('SELECT * FROM user_preferences WHERE user_id=? AND active=1 ORDER BY preference_id').all(userId);
  const preferences:ProductPreference[]=[],invalid:string[]=[];
  for(const row of rows) {
    try {
      const value=JSON.parse(String(row.values_json));
      const operator=row.operator==='prefer'?'in':row.operator==='avoid'?'not_in':row.operator;
      const p={preference_id:String(row.preference_id),attribute:row.attribute,operator,
        strength:row.strength==='weak'?'preferred':row.strength,source_text:`SQLite preference ${row.preference_id}`,
        ...(operator==='range'?{min:value.min??null,max:value.max??null}:{values:value})} as ProductPreference;
      validatePreferences([p]);preferences.push(p);
    } catch {invalid.push(`已儲存偏好 ${row.preference_id} 的格式尚不支援，請先確認或停用該偏好。`);}
  }
  return {rows,preferences,invalid};
}

export function createFormatterService(options: {
  db: DatabaseSync; userId: string; registrations: SellerRegistration[]; timeoutMs: number; now?: () => Date;
  formatter?: typeof formatIntent;
  // Backend-only: complete a previously persisted HTTP formatting request.
  existingRequestId?: string;
  rankingWeights?: {price:number;delivery:number;trust:number;color:number};
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
      const {rows,preferences,invalid}=readSavedPreferences(db,userId);
      const result=(options.formatter??formatIntent)(input,preferences);
      if(options.rankingWeights&&result.normalized_intent){assertContract('RankingWeights',options.rankingWeights);result.normalized_intent.ranking_weights={...options.rankingWeights};}
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
        .run(requestId,userId,input.intent_md,input.preference_md,JSON.stringify(result.normalized_intent),
          result.status==='ready'?'orchestrating':'needs_clarification',timestamp,timestamp);
      }
      db.prepare('INSERT INTO formatter_runs VALUES (?,?,?,?,?,?,?)').run(requestId,userId,args.idempotency_key,
        JSON.stringify(input),JSON.stringify(rows),JSON.stringify(result),timestamp);
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
