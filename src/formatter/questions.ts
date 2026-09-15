import {parseText} from './parser.ts';
import type {FormatResult} from './parser.ts';
import type {ProductPreference} from '../orchestrator/data-tools.ts';

export type QuestionField='budget'|'delivery'|'color'|'size_class'|'category'|'other';
export type Suggestion={label:string;value:string;source:'preference'|'example'};
export type Question={question_id:string;field:QuestionField;text:string;suggestions:Suggestion[]};
const labels:Record<string,string>={black:'黑色',white:'白色',rose:'粉色',red:'紅色',blue:'藍色',small:'小尺寸',medium:'中尺寸',large:'大尺寸'};
export const answerLabels:Record<QuestionField,string>={budget:'最高預算',delivery:'到貨期限',color:'顏色',size_class:'尺寸',category:'商品種類',other:'補充条件'};
export function questionField(text:string):QuestionField {
  if(/預算|價格|價錢|上限|金額|最高.*元|最多.*元|多少.*元|含運最多|\bmax\b|\btarget\b|budget|amount/i.test(text))return 'budget';
  if(/到貨|交期|送達|天數|幾天|\bdays\b/.test(text))return 'delivery';
  if(/顏色|color|黑色|白色|紅色|藍色|粉色/.test(text))return 'color';
  if(/size_class|尺寸/.test(text))return 'size_class';
  if(/確認.*無線滑鼠|明確說明要買滑鼠/.test(text))return 'category';
  return 'other';
}
export function formatterSummary(result:FormatResult,preferenceMd:string,saved:ProductPreference[]=[]) {
  const pref=parseText(preferenceMd,'quick');
  const products=[...pref.products,...saved.filter(p=>!pref.products.some(x=>x.attribute===p.attribute))];
  const groups=new Map<string,{field:QuestionField;texts:string[]}>();
  for(const text of result.questions) {
    const field=questionField(text),key=field==='other'?text:field;
    const group=groups.get(key)??{field,texts:[]};
    if(!group.texts.includes(text))group.texts.push(text);
    groups.set(key,group);
  }
  const questions:Question[]=[...groups.values()].slice(0,30).map(({field,texts},i)=>{
    let suggestions:Suggestion[]=[];
    if(field==='color'||field==='size_class') {
      const related=products.filter(p=>p.attribute===field);
      const preferred=related.flatMap(p=>p.operator==='in'?p.values:[]);
      const excluded=related.flatMap(p=>p.operator==='not_in'?p.values:[]);
      const candidates=preferred.length?preferred:field==='color'?['black','white','blue']:['small','medium','large'];
      suggestions=[...new Set(candidates)].filter(v=>labels[v]&&!excluded.includes(v)).slice(0,3).map(v=>({label:labels[v],value:labels[v],source:preferred.length?'preference':'example'}));
    } else if(field==='budget'||field==='delivery') {
      const stored=field==='budget'?pref.max:pref.days;
      const values=stored.length?stored:field==='budget'?[800,1000,1500]:[3,7,14];
      suggestions=[...new Set(values)].filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,3).map(n=>({label:field==='budget'?`NT$${n.toLocaleString('en-US')} 以內`:`${n} 天內`,value:field==='budget'?`含運最高預算${n}元`:`${n}天內到貨`,source:stored.length?'preference':'example'}));
    } else if(field==='category')suggestions=[{label:'無線滑鼠',value:'買一隻無線滑鼠',source:'example'}];
    // One actionable amount question instead of yes/no + a second budget question.
    const text=field==='budget'&&!texts.some(t=>/衝突|高於|不支援|多個|不同/.test(t))
      ?`${result.target_total_twd?`你提到 ${result.target_total_twd} 元，`:''}含運的最高預算是多少元？請滑動選擇金額。`
      :texts.join(' ');
    return {question_id:`q_${i}`,field,text,suggestions};
  });
  const openai=result.parser_version==='formatter-llm-v0.1';
  return {provider:openai?'openai' as const:'rules' as const,model:openai?(result.warnings.find(x=>x.startsWith('LLM model: '))?.slice(11)??null):null,questions};
}
export function contextualAnswer(field:QuestionField,answer:string) {
  const text=answer.trim();
  // Bare numbers are grounded by the actual question, never by example suggestions.
  if(/^\d+$/.test(text)) {
    if(field==='budget')return `含運最高預算${text}元`;
    if(field==='delivery')return `${text}天內到貨`;
  }
  return text;
}
