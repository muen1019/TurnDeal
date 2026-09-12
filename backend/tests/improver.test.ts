import {mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {OfferStore} from '../src/store.js';
import {ImprovementRepository} from '../src/improver/repository.js';
import {BuyerRequestImprover} from '../src/improver/service.js';
import {deterministicProvider,loadImproverEnvironment,OpenAIRevisionProvider} from '../src/improver/provider.js';
import {deterministicProposal,fallback,validateCandidate} from '../src/improver/guard.js';
import {applyPreferencePatch,preferenceDocument} from '../src/improver/preferences.js';
import {parseContext,parseProposal,parseResult,proposalSchema} from '../src/improver/schema.js';
import type {ImprovementContext,RevisionProvider,RevisionProposal} from '../src/improver/types.js';

const original='無線靜音滑鼠，預算 1000 元，7 天內到貨。';
const buyer='improver_test_buyer';
const stores:OfferStore[]=[];
const dirs:string[]=[];
afterEach(()=>{for(const store of stores.splice(0))store.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
async function setup(feedback='這次預算改成 800 元', options:{dbPath?:string;now?:()=>Date;beforeCommit?:()=>void;preference?:string}={}){
  const store=await OfferStore.open({dbPath:options.dbPath??':memory:',now:options.now??(()=>new Date('2026-09-12T02:00:00Z')),beforeCommit:options.beforeCommit});stores.push(store);
  const created=await store.withIdempotency(buyer,'POST','/api/requests',crypto.randomUUID(),{},()=>store.createRequest(buyer,{intent_md:original,preference_md:options.preference??''}));
  const id=(created.body as {request_id:string}).request_id;store.processRequest(id);
  await store.withIdempotency(buyer,'POST',`/api/requests/${id}/decisions`,'reject',{feedback},()=>store.rejectDecision(buyer,id,feedback));
  const repository=new ImprovementRepository(store.improvementStorage());
  return {store,repository,id,job:repository.enqueueRejectedRequest(buyer,id)};
}
function patchProposal(context:ImprovementContext):RevisionProposal {
  return deterministicProposal(context);
}

describe('Improver revisions and evidence',()=>{
  it('revises purchase intent and keeps global preferences for one-time feedback',async()=>{
    const {store,repository,job,id}=await setup();
    const before=store.snapshot(id,buyer);
    const finished=await new BuyerRequestImprover(repository,deterministicProvider).run(buyer,job.improvement_id);
    expect(finished.result).toMatchObject({status:'ready',intent_state:'ready',preference_updated:false,preference_revision:0});
    expect(finished.result?.documents.intent_md).toContain('800');
    expect(finished.result?.documents.revision).toBe(2);
    expect(store.snapshot(id,buyer)).toEqual(before);
    expect(parseResult(finished.result)).toEqual(finished.result);
  });
  it('writes a scoped global preference only with an explicit long-term quote',async()=>{
    const {repository,job}=await setup('這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸。');
    const result=(await new BuyerRequestImprover(repository,deterministicProvider).run(buyer,job.improvement_id)).result!;
    expect(result.status).toBe('ready');expect(result.preference_updated).toBe(true);
    expect(repository.globalPreference(buyer).entries).toEqual([expect.objectContaining({scope:'category:mouse',value:'偏好小尺寸'})]);
    expect(result.documents.preference_md).toEqual(repository.globalPreference(buyer).markdown);
  });
  it('does not promote no-reason rejection or repeated behavior to a global preference',async()=>{
    const {repository,job}=await setup('不喜歡');
    const result=(await new BuyerRequestImprover(repository,deterministicProvider).run(buyer,job.improvement_id)).result!;
    expect(result.status).toBe('needs_clarification');expect(result.preference_updated).toBe(false);
    expect(result.documents.intent_md).not.toBe(original);
  });
  it('rejects a guessed numeric budget and an invented paid addon',async()=>{
    const {job}=await setup('這次想便宜一點');
    const proposal=patchProposal(job.context);
    proposal.intent.markdown=original.replace('1000','500');proposal.intent.changes[0].after=proposal.intent.markdown;
    expect(()=>validateCandidate(job.context,proposal,'llm')).toThrow('unauthorized_intent_change');
    proposal.intent.markdown=original+' 可接受付費滑鼠墊';proposal.intent.changes[0].after=proposal.intent.markdown;
    expect(validateCandidate(job.context,proposal,'llm').status).toBe('needs_clarification');
  });
  it('drops an unsupported preference patch but can keep a valid intent',async()=>{
    const {job}=await setup();const proposal=patchProposal(job.context);
    proposal.preference={action:'patch',base_revision:0,operations:[{operation:'add',preference_id:'size',before:null,value:'偏好小尺寸',scope:'category:mouse',evidence_id:'feedback',explicit_quote:'這次預算改成 800 元'}]};
    const result=validateCandidate(job.context,proposal,'llm');
    expect(result.status).toBe('ready');expect(result.preference.markdown).toBe('');
    expect(result.audit).toContain('preference_missing_explicit_long_term_evidence');
  });
  it('cannot drop source preference hard requirements when committing the new global snapshot',async()=>{
    const {job}=await setup('這次預算改成 800 元',{preference:'只接受黑色'});
    const valid=patchProposal(job.context);
    expect(validateCandidate(job.context,valid,'deterministic').status).toBe('ready');
    const dropped=structuredClone(valid);dropped.intent.markdown=dropped.intent.markdown.replace('只接受黑色','');dropped.intent.changes[0].after=dropped.intent.markdown;
    expect(()=>validateCandidate(job.context,dropped,'llm')).toThrow('unauthorized_intent_change');
  });
  it('account ranking weights do not falsely invalidate a verified budget change',async()=>{
    const {job}=await setup();job.context.hard_constraints.ranking_weights={price:70,delivery:40,trust:50,color:30};
    expect(validateCandidate(job.context,patchProposal(job.context),'deterministic').status).toBe('ready');
  });
  it('protects required constraints inherited from SQLite even when absent from Markdown',async()=>{
    const {job}=await setup();
    job.context.hard_constraints.product_preferences.push({preference_id:'saved_black',attribute:'color',operator:'in',values:['black'],strength:'required',source_text:'saved preference'});
    expect(()=>validateCandidate(job.context,patchProposal(job.context),'llm')).toThrow('unauthorized_intent_change');
  });
  it('commercial signatures are stable across requests with different offer IDs',async()=>{
    const first=await setup(),second=await setup();
    expect(first.job.context.rejected_offers[0].offer_id).not.toBe(second.job.context.rejected_offers[0].offer_id);
    expect(first.job.context.rejected_offers.map(o=>o.signature)).toEqual(second.job.context.rejected_offers.map(o=>o.signature));
  });
  it('checks exact full-document diffs and evidence IDs',async()=>{
    const {job}=await setup();const proposal=patchProposal(job.context);
    proposal.intent.changes[0].before='summary';
    expect(()=>validateCandidate(job.context,proposal,'llm')).toThrow('intent_diff_or_evidence_invalid');
    proposal.intent.changes[0].before=original;proposal.intent.changes[0].evidence_ids=['missing'];
    expect(()=>validateCandidate(job.context,proposal,'llm')).toThrow('intent_diff_or_evidence_invalid');
  });
  it('validates strict internal schemas, canonical constraints and Unicode length',async()=>{
    const {job}=await setup();
    expect(()=>parseContext({...job.context,extra:true})).toThrow();
    expect(()=>parseContext({...job.context,hard_constraints:{...job.context.hard_constraints,extra:true}})).toThrow();
    const proposal=patchProposal(job.context);
    expect(()=>parseProposal({...proposal,tool:'write_file'})).toThrow();
    expect(()=>parseProposal({...proposal,intent:{...proposal.intent,markdown:'鼠'.repeat(20001)}})).toThrow();
  });
  it('fallback preserves max-sized intent without truncating it',async()=>{
    const {job}=await setup();const context={...job.context,source_documents:{...job.context.source_documents,intent_md:'鼠'.repeat(20000)}};
    const result=fallback(context,'provider_not_configured');
    expect(result.proposal.intent.markdown).toBe(context.source_documents.intent_md);
    expect(result.status).toBe('needs_clarification');expect(result.proposal.preference.action).toBe('keep');
  });
});

describe('Global preference representation',()=>{
  it('requires explicit long-term revocation for targeted replacement and removal',()=>{
    const markdown='# 偏好\n<!-- offermesh-preference:size scope=category:mouse -->\n偏好小尺寸\n<!-- /offermesh-preference -->\n';
    const quote='我以後挑滑鼠不再偏好小尺寸，改成價格優先';
    const op={operation:'replace' as const,preference_id:'size',before:'偏好小尺寸',value:'價格優先',scope:'category:mouse' as const,evidence_id:'feedback',explicit_quote:quote};
    const result=applyPreferencePatch(preferenceDocument(markdown,1),[op],[{evidence_id:'feedback',text:quote,kind:'user_feedback'}]);
    expect(result.document.entries[0].value).toBe('價格優先');expect(result.document.markdown).toContain('# 偏好\n');
    const removeQuote='我以後挑滑鼠不再價格優先';
    const removed=applyPreferencePatch(result.document,[{...op,operation:'remove',before:'價格優先',value:null,explicit_quote:removeQuote}],[{evidence_id:'feedback',text:removeQuote,kind:'user_feedback'}]);
    expect(removed.document.entries).toHaveLength(0);expect(removed.document.markdown).toContain('# 偏好\n');
    const mismatch=applyPreferencePatch(preferenceDocument(markdown,1),[{...op,before:'偏好黑色'}],[{evidence_id:'feedback',text:quote,kind:'user_feedback'}]);
    expect(mismatch.document.markdown).toBe(markdown);
  });
  it('round-trips unmanaged prose and fails closed on unsafe edits',()=>{
    const markdown='# 偏好\n使用者的自由文字。\n';const doc=preferenceDocument(markdown,1);
    const op={operation:'add' as const,preference_id:'small',before:null,value:'偏好小尺寸',scope:'category:mouse' as const,evidence_id:'feedback',explicit_quote:'我挑滑鼠一直都偏好小尺寸'};
    const result=applyPreferencePatch(doc,[op],[{evidence_id:'feedback',text:op.explicit_quote,kind:'user_feedback'}]);
    expect(result.document.markdown).toBe(markdown);expect(result.audit).toContain('preference_unaddressable_or_duplicate');
  });
  it('rejects seller evidence, false meaning, wrong scope and duplicate operations',()=>{
    const op={operation:'add' as const,preference_id:'small',before:null,value:'偏好小尺寸',scope:'all_categories' as const,evidence_id:'feedback',explicit_quote:'我挑滑鼠一直都偏好小尺寸'};
    const evidence=[{evidence_id:'feedback',text:op.explicit_quote,kind:'user_feedback' as const}];
    expect(applyPreferencePatch(preferenceDocument('',0),[op],evidence).document.markdown).toBe('');
    expect(applyPreferencePatch(preferenceDocument('',0),[op,op],evidence).audit).toContain('conflicting_preference_operations');
    expect(applyPreferencePatch(preferenceDocument('',0),[{...op,scope:'category:mouse'}],[{...evidence[0],kind:'rejection'}]).document.markdown).toBe('');
  });
  it('does not publish a global update when the intent needs clarification',async()=>{
    const {repository,job}=await setup('我買東西一向先看耐用度');
    const result=(await new BuyerRequestImprover(repository,deterministicProvider).run(buyer,job.improvement_id)).result!;
    expect(result.status).toBe('needs_clarification');expect(repository.globalPreference(buyer).revision).toBe(0);
  });
});

describe('Durable jobs and concurrent revisions',()=>{
  it('backs up an existing pre-Improver database and preserves its exact decision and snapshot',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'improver-upgrade-'));dirs.push(dir);const dbPath=join(dir,'old.sqlite');
    const {store,id}=await setup(undefined,{dbPath});const snapshot=store.snapshot(id,buyer);
    const access=store.improvementStorage();access.transaction(()=>{
      access.run('DROP TABLE improver_workflows');access.run('DROP TABLE improver_intent_revisions');access.run('DROP TABLE improver_jobs');access.run('DROP TABLE improver_global_preferences');
      access.run("DELETE FROM schema_migrations WHERE version='004_buyer_request_improver'");
      access.run("DELETE FROM schema_migrations WHERE version='006_improver_followups'");
    });
    store.close();stores.splice(stores.indexOf(store),1);
    const reopened=await OfferStore.open({dbPath,now:()=>new Date('2026-09-12T02:00:00Z')});stores.push(reopened);
    expect(reopened.snapshot(id,buyer)).toEqual(snapshot);
    expect(readdirSync(dir).some(f=>f.includes('.pre-v03-')&&f.endsWith('.bak'))).toBe(true);
    expect(reopened.improvementStorage().rows('SELECT * FROM improver_jobs')).toHaveLength(0);
  });
  it('replays jobs and results without another model invocation',async()=>{
    const {repository,job,id}=await setup();const generate=vi.fn(deterministicProvider.generate);
    const service=new BuyerRequestImprover(repository,{kind:'deterministic',generate});
    const first=await service.run(buyer,job.improvement_id);
    expect(repository.enqueueRejectedRequest(buyer,id).improvement_id).toBe(job.improvement_id);
    expect(await service.run(buyer,job.improvement_id)).toEqual(first);expect(generate).toHaveBeenCalledTimes(1);
  });
  it('enforces buyer scope and requires a saved rejection',async()=>{
    const {repository,job,id,store}=await setup();
    expect(()=>repository.get('other',job.improvement_id)).toThrow('improvement_not_found');
    expect(()=>repository.enqueueRejectedRequest('other',id)).toThrow();
    const created=store.createRequest(buyer,{intent_md:original,preference_md:''});store.processRequest(created.body.request_id);
    expect(()=>repository.enqueueRejectedRequest(buyer,created.body.request_id)).toThrow('saved_round_rejection_required');
  });
  it('limits repair to two calls and sanitizes provider errors',async()=>{
    const {repository,job}=await setup();const generate=vi.fn(async()=>({invalid:true}));
    const result=(await new BuyerRequestImprover(repository,{kind:'llm',generate}).run(buyer,job.improvement_id)).result!;
    expect(generate).toHaveBeenCalledTimes(2);expect(result.provider).toBe('fallback');expect(result.status).toBe('needs_clarification');
  });
  it('times out even a provider that ignores AbortSignal',async()=>{
    const {repository,job}=await setup();
    const result=(await new BuyerRequestImprover(repository,{kind:'llm',generate:()=>new Promise(()=>{})},5).run(buyer,job.improvement_id)).result!;
    expect(result.audit).toContain('provider_timeout');expect(result.provider).toBe('fallback');
  });
  it('saves a fallback when no provider is configured',async()=>{
    const {repository,job}=await setup();
    const result=(await new BuyerRequestImprover(repository,null).run(buyer,job.improvement_id)).result!;
    expect(result.audit).toContain('provider_not_configured');expect(result.intent_state).toBe('draft');
  });
  it('expires leases, rejects stale workers and does not reset attempts',async()=>{
    let time=new Date('2026-09-12T02:00:00Z');const {repository,job}=await setup(undefined,{now:()=>time});
    const first=repository.claim(buyer,job.improvement_id);repository.consumeAttempt(buyer,job.improvement_id,first.lease_token!);
    expect(()=>repository.claim(buyer,job.improvement_id)).toThrow('improvement_in_progress');
    time=new Date(time.getTime()+90001);const second=repository.claim(buyer,job.improvement_id);
    expect(second.attempts).toBe(1);expect(second.claims).toBe(2);
    expect(()=>repository.consumeAttempt(buyer,job.improvement_id,first.lease_token!)).toThrow('lease_lost');
    time=new Date(time.getTime()+90001);
    expect(repository.claim(buyer,job.improvement_id).status).toBe('failed');
  });
  it('rebases once over an unrelated global update without losing prose',async()=>{
    const {repository,job}=await setup();
    const provider:RevisionProvider={kind:'deterministic',async generate(context){repository.saveGlobalPreference(buyer,'# 我的偏好\n',0);return deterministicProposal(context);}};
    const result=(await new BuyerRequestImprover(repository,provider).run(buyer,job.improvement_id)).result!;
    expect(result.status).toBe('ready');expect(result.audit).toContain('preference_rebased');expect(result.documents.preference_md).toBe('# 我的偏好\n');
  });
  it('saves a draft instead of overwriting a concurrently added target',async()=>{
    const {repository,job}=await setup('這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸');
    const provider:RevisionProvider={kind:'deterministic',async generate(context){
      const p=deterministicProposal(context);if(p.preference.action!=='patch')throw new Error('test');
      const target=p.preference.operations[0].preference_id;
      repository.saveGlobalPreference(buyer,`<!-- offermesh-preference:${target} scope=category:mouse -->\n偏好黑色\n<!-- /offermesh-preference -->\n`,0);return p;
    }};
    const result=(await new BuyerRequestImprover(repository,provider).run(buyer,job.improvement_id)).result!;
    expect(result.status).toBe('needs_clarification');expect(repository.globalPreference(buyer).markdown).toContain('偏好黑色');
  });
  it('does not loop on a second preference conflict and binds a draft to the latest revision',async()=>{
    const {repository,job}=await setup();
    const commit=repository.commit.bind(repository);let count=0;
    vi.spyOn(repository,'commit').mockImplementation((...args)=>{
      count++;if(count<=2)repository.saveGlobalPreference(buyer,`# revision ${count}\n`,count-1);
      return commit(...args);
    });
    const result=(await new BuyerRequestImprover(repository,deterministicProvider).run(buyer,job.improvement_id)).result!;
    expect(result.status).toBe('needs_clarification');expect(result.preference_updated).toBe(false);
    expect(result.preference_revision).toBe(2);expect(count).toBe(3);
    expect(result.audit).toContain('preference_version_conflict');
  });
  it('rolls back both documents on injected commit failure',async()=>{
    let fail=false;const {store,repository,job}=await setup('這次預算改成 800 元。我挑滑鼠一直都偏好小尺寸',{beforeCommit:()=>{if(fail)throw new Error('injected');}});
    const claim=repository.claim(buyer,job.improvement_id);
    const candidate=validateCandidate(job.context,deterministicProposal(job.context),'deterministic');fail=true;
    expect(()=>repository.commit(buyer,job.improvement_id,claim.lease_token!,candidate,0)).toThrow('injected');fail=false;
    expect(repository.globalPreference(buyer).revision).toBe(0);
    expect(store.improvementStorage().rows('SELECT * FROM improver_intent_revisions')).toHaveLength(0);
    expect(repository.get(buyer,job.improvement_id).status).toBe('running');
  });
  it('recovers after restart and preserves immutable result documents',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'improver-test-'));dirs.push(dir);const dbPath=join(dir,'state.sqlite');
    let time=new Date('2026-09-12T02:00:00Z');
    const {repository,job,store}=await setup(undefined,{dbPath,now:()=>time});repository.claim(buyer,job.improvement_id);
    store.close();stores.splice(stores.indexOf(store),1);time=new Date(time.getTime()+90001);
    const reopened=await OfferStore.open({dbPath,now:()=>time});stores.push(reopened);
    const repo=new ImprovementRepository(reopened.improvementStorage());const [result]=await new BuyerRequestImprover(repo,deterministicProvider).recover(buyer);
    expect(result.result?.status).toBe('ready');repo.saveGlobalPreference(buyer,'# 新偏好\n',0);
    expect(repo.get(buyer,job.improvement_id).result?.documents.preference_md).toBe('');
  });
});

describe('OpenAI provider boundary',()=>{
  it('declares types for every model schema leaf, including const and enum',()=>{
    function check(value:unknown){
      if(!value||typeof value!=='object')return;
      const node=value as Record<string,unknown>;
      if('enum' in node||'const' in node)expect(node.type).toBe('string');
      for(const child of Object.values(node))if(Array.isArray(child))child.forEach(check);else check(child);
    }
    check(proposalSchema);
  });
  it('loads only allowed env fields without overwriting explicit environment values',()=>{
    const dir=mkdtempSync(join(tmpdir(),'improver-env-'));dirs.push(dir);const file=join(dir,'.env');
    writeFileSync(file,'API_KEY="test-only-placeholder"\nIMPROVER_MODEL=gpt-4.1-mini\nSECRET_OTHER=ignored\n');
    expect(loadImproverEnvironment({},file)).toEqual({apiKey:'test-only-placeholder',model:'gpt-4.1-mini'});
    expect(loadImproverEnvironment({API_KEY:'override'},file).apiKey).toBe('override');
  });
  it('uses Responses strict structured output and never stores responses remotely',async()=>{
    const {job}=await setup();let submitted:Record<string,unknown>|undefined;
    const fetcher=vi.fn(async(url:unknown,init:RequestInit|undefined)=>{
      expect(url).toBe('https://api.openai.com/v1/responses');submitted=JSON.parse(String(init?.body));
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(deterministicProposal(job.context))}]}]}));
    }) as unknown as typeof fetch;
    const output=await new OpenAIRevisionProvider('test-only-placeholder','gpt-4.1-mini',fetcher).generate(job.context,[],new AbortController().signal);
    expect(parseProposal(output).intent.markdown).toContain('800');expect(submitted?.store).toBe(false);
    expect(submitted?.text).toMatchObject({format:{type:'json_schema',strict:true}});expect(submitted).not.toHaveProperty('tools');
  });
  it('does not expose upstream error bodies or provider secrets',async()=>{
    const {job,repository}=await setup();
    const provider=new OpenAIRevisionProvider('test-only-placeholder','gpt-4.1-mini',(async()=>new Response('sensitive upstream body',{status:401})) as typeof fetch);
    const result=(await new BuyerRequestImprover(repository,provider).run(buyer,job.improvement_id)).result!;
    expect(result.audit).toContain('provider_http_401');expect(JSON.stringify(result)).not.toContain('sensitive upstream');
  });
});
