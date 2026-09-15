import {ArrowUpRight,Check} from 'lucide-react';
import type {FormatterSummary} from '../../contract.generated';
import './clarification.css';

export function ClarificationPanel({formatter,answers,onAnswer,onSubmit,busy,message}: {
  formatter:FormatterSummary;answers:Record<string,string>;onAnswer:(id:string,value:string)=>void;
  onSubmit:()=>void;busy:boolean;message:string;
}) {
  const complete=formatter.questions.every(q=>answers[q.question_id]?.trim()&&[...answers[q.question_id].trim()].length<=500);
  return <section className="clarification-panel mobile-screen-enter" aria-labelledby="clarify-title">
    <span className="formatter-source">{formatter.provider==='openai'?`LLM 已解析 · ${formatter.model??'OpenAI'}`:'離線規則解析 · 非 LLM 成功'}</span>
    <h1 id="clarify-title">再確認一下</h1>
    <p className="clarification-intro">補上這幾個細節，就能繼續。已有的偏好會一起考慮。</p>
    {message&&<blockquote className="clarification-request">{message}</blockquote>}
    <form onSubmit={e=>{e.preventDefault();if(complete&&!busy)onSubmit();}}>
      {formatter.questions.map((q,i)=><fieldset key={q.question_id} disabled={busy} className="clarification-question">
        <legend><span>{String(i+1).padStart(2,'0')}</span>{q.text}</legend>
        {!!q.suggestions.length&&<><p className="quick-help">{q.suggestions.some(s=>s.source==='preference')?'依你的偏好':'參考選項'} · 可自行修改</p><div className="quick-answers">{q.suggestions.map(s=><button key={s.value} type="button" aria-pressed={answers[q.question_id]===s.value} onClick={()=>onAnswer(q.question_id,s.value)}>{answers[q.question_id]===s.value&&<Check size={14}/>} {s.label}</button>)}</div></>}
        <label className="sr-only" htmlFor={`answer-${q.question_id}`}>{q.text}</label>
        <textarea id={`answer-${q.question_id}`} rows={1} placeholder="輸入你的答案…" value={answers[q.question_id]??''} onChange={e=>onAnswer(q.question_id,e.target.value)} />
        {[...(answers[q.question_id]??'')].length>500&&<p role="alert">每題最多 500 字。</p>}
      </fieldset>)}
      <button type="submit" className="clarification-submit" disabled={busy||!complete}>{busy?'正在送出…':'繼續'}<ArrowUpRight size={20}/></button>
      <p className="clarification-footnote">這次回答只用於本輪需求，不會修改長期偏好。</p>
    </form>
  </section>;
}
