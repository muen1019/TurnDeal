import type { NormalizedIntent, ProductPreference } from '../orchestrator/data-tools.ts';
import { assertContract } from '../orchestrator/contract.ts';
import { validatePreferences } from '../orchestrator/preferences.ts';

export const PARSER_VERSION = 'formatter-rules-v0.1';
export type FormatResult = {
  parser_version: typeof PARSER_VERSION | 'formatter-llm-v0.1'; status: 'ready' | 'needs_clarification';
  normalized_intent: NormalizedIntent | null; target_total_twd: number | null;
  questions: string[]; warnings: string[];
};
type Parsed = { category: boolean; max: number[]; target: number[]; days: number[];
  features: string[]; priorities: NormalizedIntent['preferences']; products: ProductPreference[];
  questions: string[]; bundleDisabled: boolean; bundleMentioned: boolean };
const colors: Record<string,string> = {黑色:'black',白色:'white',粉色:'rose',粉紅色:'rose',紅色:'red',藍色:'blue'};
const sizes: Record<string,string> = {小尺寸:'small',中尺寸:'medium',大尺寸:'large'};
const shapes: Record<string,string> = {左右對稱:'symmetrical',右手型:'asymmetrical_right'};

export function parseText(input: string, prefix: string): Parsed {
  input=input.replace(/^補充回答（[^\n）]+）：/gm,'');
  const result: Parsed = {category:false,max:[],target:[],days:[],features:[],priorities:[],products:[],questions:[],bundleDisabled:false,bundleMentioned:false};
  const normalized=input.normalize('NFKC').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'')
    .replace(/^## 本次購買需求\s*$/gm,''); // Exact structural heading emitted by the UI, not arbitrary user headings.
  let productIndex=0;
  for (const source of normalized.split(/[，,。；;\n]/).map(s=>s.trim()).filter(Boolean)) {
    let rest=source==='維持原有其他條件'?'':source;
    const take=(regex:RegExp, fn:(...m:string[])=>void)=>{rest=rest.replace(regex,(...args)=>{fn(...args.slice(0,-2));return ' ';});};
    // Every unrecognized remainder blocks dispatch; negation/conditionals cannot disappear silently.
    take(/(?:最高(?:預算)?|預算上限|上限|不超過|最多|預算)\s*(?:是|為|:)?\s*(\d+)\s*(?:元|塊|TWD)?/gi,(_,n)=>result.max.push(Number(n)));
    take(/(\d+)\s*(?:元|塊)\s*(?:以內|以下)/g,(_,n)=>result.max.push(Number(n)));
    take(/(?:目標(?:價格|價)?\s*(?:是|為|:)?\s*)?(\d+)\s*(?:元|塊)?\s*(?:左右|上下)/g,(_,n)=>result.target.push(Number(n)));
    take(/(?:大約|約|目標(?:價格|價)?)\s*(\d+)\s*(?:元|塊)/g,(_,n)=>result.target.push(Number(n)));
    // Unqualified prices are targets, not authorization to spend that maximum.
    take(/(\d+)\s*(?:元|塊)/g,(_,n)=>result.target.push(Number(n)));
    take(/(\d+)\s*天(?:以)?內(?:到貨|送達|收到)?/g,(_,n)=>result.days.push(Number(n)));
    take(/一(?:週|周)(?:以)?內(?:到貨|送達|收到)?/g,()=>result.days.push(7));
    take(/不要(?:任何)?(?:贈品|配件|加購|滑鼠墊)/g,()=>{result.bundleDisabled=true;result.bundleMentioned=true;});
    take(/只接受免費(?:贈品|配件|滑鼠墊)/g,()=>{result.bundleMentioned=true;});
    take(/可接受免費(?:贈品|配件|滑鼠墊)|不接受付費加購/g,()=>{result.bundleMentioned=true;});
    take(/價格優先|便宜優先|越便宜越好|偏好價格低|偏好低價/g,()=>result.priorities.push('price_first'));
    take(/交期優先|快速到貨優先/g,()=>result.priorities.push('delivery_first'));
    take(/評分優先|信任優先/g,()=>result.priorities.push('trust_first'));
    take(/偏好售後好|售後優先|售後好|保固優先|重視售後/g,()=>result.priorities.push('after_sales_first'));
    for(const [attribute, mapping] of [['color',colors],['size_class',sizes],['shape',shapes]] as const) {
      const names=Object.keys(mapping).sort((a,b)=>b.length-a.length).join('|');
      const regex=new RegExp(`(只接受|必須|一定要|不要|排除|偏好|喜歡)?\\s*((?:${names})(?:\\s*或\\s*(?:${names}))*)`,'g');
      take(regex,(_,qualifier,matched)=>{
        const values=[...new Set(matched.split(/\s*或\s*/).map(v=>mapping[v]))];
        const soft=['偏好','喜歡'].includes(qualifier) || !qualifier && /(?:偏好|喜歡)[^，,。；;]*、/.test(source);
        result.products.push({preference_id:`${prefix}_${++productIndex}`,strength:soft?'preferred':'required',
          attribute,operator:['不要','排除'].includes(qualifier)?'not_in':'in',values,source_text:source});
      });
    }
    take(/無線|靜音|藍牙/g,token=>result.features.push(({無線:'wireless',靜音:'silent_click',藍牙:'bluetooth'} as Record<string,string>)[token]));
    take(/滑鼠(?!墊)/g,()=>{result.category=true;});
    // Only harmless shopping connective words may remain. Unknown brands/specs stay visible.
    rest=rest.replace(/辦公用|含稅運費|含稅運|含運|我想買|我想要|我需要|想買|想要|幫我找|幫我買|找|買|一個|一隻|個|的|以及|並且|而且|和|與|請|、|\s/g,'');
    if(rest) result.questions.push(`尚未理解「${rest}」，請改用明確條件或確認可忽略。`);
  }
  return result;
}

export function contradictions(preferences: ProductPreference[]) {
  const questions:string[]=[];
  for(const attr of ['color','size_class','shape','length_mm','width_mm','height_mm']) {
    const hard=preferences.filter(p=>p.attribute===attr && p.strength==='required');
    const includes=hard.filter(p=>p.operator==='in');
    if(includes.length) {
      const possible=includes[0].operator==='in' ? includes[0].values : [];
      if(!possible.some(v=>hard.every(p=>p.operator==='range' || (p.operator==='in'?p.values.includes(v):!p.values.includes(v))))) questions.push(`${attr} 的必要條件互相衝突，請確認。`);
    }
    const ranges=hard.filter(p=>p.operator==='range');
    if(ranges.length && Math.max(...ranges.map(p=>p.operator==='range'?p.min??-Infinity:-Infinity)) > Math.min(...ranges.map(p=>p.operator==='range'?p.max??Infinity:Infinity))) questions.push(`${attr} 的範圍互相衝突。`);
  }
  return questions;
}

export function formatIntent(input: { intent_md: string; preference_md?: string }, savedPreferences: ProductPreference[] = []): FormatResult {
  assertContract('CreateRequest',input);
  validatePreferences(savedPreferences);
  const explicit=parseText(input.intent_md,'intent');
  const provided=parseText(input.preference_md??'','preference');
  const questions=[...explicit.questions,...provided.questions];
  const warnings:string[]=[];
  const merge=(key:'max'|'days'|'target')=>{
    const values=explicit[key].length?explicit[key]:provided[key];
    if(new Set(values).size>1) questions.push(`${key} 有多個不同數值，請只保留一個。`);
    if(values.some(n=>!Number.isSafeInteger(n)||n<=0)) questions.push(`${key} 必須是正整數。`);
    return values[0]??null;
  };
  const max=merge('max'),days=merge('days'),target=merge('target');
  if(!explicit.category) questions.push('目前只支援滑鼠，請明確說明要買滑鼠。');
  if(max===null) questions.push('含稅運費的最高預算是多少元？目標價不會自動當作上限。');
  if(days===null) questions.push('最晚可接受幾天內到貨？');
  if(max!==null && target!==null && target>max) questions.push('目標價格高於最高預算，請確認。');
  // Current intent overrides preference_md, which overrides stored preferences, by attribute.
  const explicitAttrs=new Set(explicit.products.map(p=>p.attribute));
  const providedAttrs=new Set(provided.products.map(p=>p.attribute));
  const products=[...explicit.products,...provided.products.filter(p=>!explicitAttrs.has(p.attribute)),
    ...savedPreferences.filter(p=>!explicitAttrs.has(p.attribute)&&!providedAttrs.has(p.attribute)).map((p,i)=>({...p,preference_id:`saved_${i}`}))];
  questions.push(...contradictions(products));
  const features=[...new Set([...explicit.features,...provided.features])];
  if(!features.includes('wireless')) {features.unshift('wireless');warnings.push('本 MVP 僅支援無線滑鼠，已套用 wireless 商品範圍。');}
  const priorities=[...new Set(explicit.priorities.length?explicit.priorities:provided.priorities)];
  const disabled=explicit.bundleMentioned?explicit.bundleDisabled:provided.bundleDisabled;
  const intent: NormalizedIntent={category:'mouse',max_total_twd:max!,delivery_days_max:days!,required_features:features,
    preferences:priorities,product_preferences:products,negotiation_policy:disabled?
      {bundle_mode:'disabled',allowed_addon_categories:[],max_addon_increment_twd:0}:
      {bundle_mode:'related_no_extra_cost',allowed_addon_categories:['mouse_pad'],max_addon_increment_twd:0}};
  if(!questions.length) {assertContract('NormalizedIntent',intent);validatePreferences(products);}
  const result:FormatResult={parser_version:PARSER_VERSION,status:questions.length?'needs_clarification':'ready',
    normalized_intent:questions.length?null:intent,target_total_twd:target!==null&&Number.isSafeInteger(target)&&target>0?target:null,questions:[...new Set(questions)],warnings};
  assertContract('FormatterResult',result);
  return result;
}
