import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatterSummary,contextualAnswer} from '../src/formatter/questions.ts';
import {createLlmFormatter} from '../src/formatter/llm.ts';
import {assertContract} from '../src/orchestrator/contract.ts';
import type {FormatResult} from '../src/formatter/parser.ts';
const result:FormatResult={parser_version:'formatter-rules-v0.1',status:'needs_clarification',normalized_intent:null,target_total_twd:null,questions:['顏色要選哪個？'],warnings:[]};
test('budget confirmation and amount questions collapse into one actionable amount question',()=>{
 const summary=formatterSummary({...result,target_total_twd:1000,questions:['1000元是包含運費的最高可接受金額嗎？','你提到1000元，含運最多可接受多少元？']},'');
 assert.equal(summary.questions.length,1);assert.equal(summary.questions[0].field,'budget');
 assert.match(summary.questions[0].text,/請輸入金額/);assert.doesNotMatch(summary.questions[0].text,/金額嗎/);
});
test('quick answers prioritize preference values and exclude negative choices; examples never auto-authorize',()=>{
  const summary=formatterSummary(result,'喜歡藍色或紅色或白色，不要紅色');
  assertContract('FormatterSummary',summary);
  assert.deepEqual(summary.questions[0].suggestions.map(s=>s.value),['藍色','白色']);
  assert.ok(summary.questions[0].suggestions.every(s=>s.source==='preference'));
  assert.ok(formatterSummary(result,'').questions[0].suggestions.every(s=>s.source==='example'));
  const budgets=formatterSummary({...result,questions:['請問最高預算？','請提供含稅運的最高預算。']},'最高預算1200元');
  assert.equal(budgets.questions.length,1);assert.equal(budgets.questions[0].suggestions[0].value,'含運最高預算1200元');
  assert.equal(contextualAnswer('budget','1000'),'含運最高預算1000元');
  assert.equal(contextualAnswer('other','1000'),'1000');
});
test('validated SQLite preferences are sent as lower priority context, optional attributes need not be asked',async()=>{
  const saved=[{preference_id:'p1',attribute:'color' as const,operator:'in' as const,strength:'preferred' as const,values:['blue'],source_text:'SQLite preference p1'}];
  const extract=createLlmFormatter({apiKey:'fake',fetch:async(_url,init)=>{
    const body=JSON.parse(String(init?.body)),input=JSON.parse(body.input);
    assert.deepEqual(input.saved_preferences,saved);
    assert.match(body.instructions,/never ask merely because absent/);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({
      category:'mouse',max_total_twd:1000,target_total_twd:null,delivery_days_max:7,budget_evidence:'預算1000元',target_evidence:'',delivery_evidence:'7天內到貨',required_features:[],preferences:[],product_preferences:[],bundle_mode:'related_no_extra_cost',questions:[],unsupported_conditions:[]})}]}]});
  }});
  const parsed=await extract({intent_md:'買滑鼠，預算1000元，7天內到貨'},saved);
  assert.equal(parsed.status,'ready');assert.equal(parsed.parser_version,'formatter-llm-v0.1');assert.equal(parsed.questions.length,0);
});
