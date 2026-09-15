import {useEffect,useState,type CSSProperties} from 'react';
import {Check,Wallet} from 'lucide-react';
import type {ClarificationQuestion,FormatterSummary} from '../../contract.generated';
import './clarification.css';

const DELIVERY_CHOICES=[['1','隔天'],['3','3 天內'],['7','7 天內'],['14','14 天內']] as const;
const DEFAULT_BUDGET=1000;

function parseSeedBudget(q:ClarificationQuestion) {
  const fromSuggestion=q.suggestions.map(s=>s.label.match(/\d+/)?.[0]).find(Boolean);
  const fromText=q.text.match(/(\d+)\s*元/)?.[1];
  const seed=Number(fromSuggestion??fromText);
  return Number.isFinite(seed)&&seed>0?Math.min(2000,Math.max(100,Math.round(seed/50)*50)):DEFAULT_BUDGET;
}

const BUDGET_MIN=100,BUDGET_MAX=2000;
function BudgetSlider({q,value,onChange}:{q:ClarificationQuestion;value:string;onChange:(value:string)=>void}) {
  const seed=parseSeedBudget(q);
  // A slider always has a value; seed the answer once so pressing next without dragging still submits it.
  useEffect(()=>{if(!value)onChange(String(seed));},[]);
  const amount=Math.min(BUDGET_MAX,Math.max(BUDGET_MIN,Number(value)||seed));
  const fill=(amount-BUDGET_MIN)/(BUDGET_MAX-BUDGET_MIN)*100;
  return <div className="clarification-slider">
    <span className="clarification-slider-label"><Wallet size={13} aria-hidden="true"/>你的預算上限</span>
    <div className="clarification-slider-value">NT$ {amount.toLocaleString('en-US')}</div>
    <div className="clarification-slider-track-wrap">
      <input type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={50} value={amount} style={{'--fill':`${fill}%`} as CSSProperties} aria-label={q.text} onChange={e=>onChange(e.target.value)} />
      <div className="clarification-slider-bubble" style={{'--fill':`${fill}%`} as CSSProperties} aria-hidden="true">{amount.toLocaleString('en-US')}</div>
    </div>
    <div className="clarification-slider-scale"><span>NT$100</span><span>NT$2,000+</span></div>
  </div>;
}

function DeliveryChoices({value,onChange}:{q:ClarificationQuestion;value:string;onChange:(value:string)=>void}) {
  return <div className="clarification-choices">
    {DELIVERY_CHOICES.map(([days,label])=><button key={days} type="button" aria-pressed={value===days} onClick={()=>onChange(days)}>{value===days&&<Check size={14}/>} {label}</button>)}
  </div>;
}

function TextAnswer({q,value,onChange}:{q:ClarificationQuestion;value:string;onChange:(value:string)=>void}) {
  return <>
    {!!q.suggestions.length&&<div className="quick-answers">{q.suggestions.map(s=><button key={s.value} type="button" aria-pressed={value===s.value} onClick={()=>onChange(s.value)}>{value===s.value&&<Check size={14}/>} {s.label}</button>)}</div>}
    <label className="sr-only" htmlFor={`answer-${q.question_id}`}>{q.text}</label>
    <textarea id={`answer-${q.question_id}`} rows={1} placeholder="輸入你的答案…" value={value} onChange={e=>onChange(e.target.value)} />
  </>;
}

function QuestionBody(props:{q:ClarificationQuestion;value:string;onChange:(value:string)=>void}) {
  if(props.q.field==='budget')return <BudgetSlider {...props}/>;
  if(props.q.field==='delivery')return <DeliveryChoices {...props}/>;
  return <TextAnswer {...props}/>;
}

export function ClarificationPanel({formatter,answers,onAnswer,onSubmit,busy,message}: {
  formatter:FormatterSummary;answers:Record<string,string>;onAnswer:(id:string,value:string)=>void;
  onSubmit:()=>void;busy:boolean;message:string;
}) {
  const total=formatter.questions.length;
  const [index,setIndex]=useState(0);
  const step=Math.min(index,total-1);
  const q=formatter.questions[step];
  const value=answers[q.question_id]??'';
  const trimmed=value.trim();
  const complete=!!trimmed&&[...trimmed].length<=500;
  const isLast=step===total-1;

  const advance=()=>{
    if(!complete||busy)return;
    if(isLast){onSubmit();return;}
    setIndex(step+1);
  };

  return <section className="clarification-panel mobile-screen-enter" aria-labelledby="clarify-title">
    <h1 id="clarify-title">再確認一下</h1>
    <p className="clarification-intro">補上這幾個細節，就能繼續。已有的偏好會一起考慮。</p>
    {message&&<blockquote className="clarification-request">{message}</blockquote>}
    <div className="clarification-progress" aria-hidden="true">
      <span>第 {step+1} / {total} 題</span>
      <div className="clarification-progress-track"><span style={{width:`${((step+1)/total)*100}%`}} /></div>
    </div>
    <form onSubmit={e=>{e.preventDefault();advance();}}>
      <fieldset key={q.question_id} disabled={busy} className="clarification-question clarification-question-enter">
        <legend>{q.text}</legend>
        <QuestionBody q={q} value={value} onChange={next=>onAnswer(q.question_id,next)} />
        {trimmed.length>500&&<p role="alert">每題最多 500 字。</p>}
      </fieldset>
      <button type="submit" className="clarification-submit" disabled={busy||!complete}>{busy?'正在送出…':isLast?'送出':'下一題'}</button>
      <p className="clarification-footnote">這次回答只用於本輪需求，不會修改長期偏好。</p>
    </form>
  </section>;
}
