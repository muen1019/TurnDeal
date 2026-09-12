import {useEffect, useRef} from 'react';
import {ArrowUpRight, Check, ShieldCheck, Sparkles} from 'lucide-react';
import type {FormatterSummary} from '../../contract.generated';
import type {AgentProgressStatus} from './AgentProgress';

const steps = ['讀懂需求', '尋找賣家', '幫你議價', '比較推薦'];
export function mobileProgress(status?: AgentProgressStatus) {
  switch (status) {
    case 'submitting': return {percent: 3, step: 0, text: '收到，正在送出你的願望。'};
    case 'formatting': return {percent: 12, step: 0, text: '先了解你想買什麼、在意什麼。'};
    case 'orchestrating': return {percent: 30, step: 1, text: '正在找符合條件的賣家。'};
    case 'negotiating': return {percent: 60, step: 2, text: '幫你問問，價格還能不能更好。'};
    case 'evaluating': return {percent: 88, step: 3, text: '不只比價格，也幫你看看值不值得。'};
    case 'awaiting_user': return {percent: 100, step: 4, text: '比較完成，來看看你的專屬推薦。'};
    default: return null;
  }
}

interface Props {
  draft: string; onDraft: (value: string) => void; onSend: () => void;
  status?: AgentProgressStatus; ready: boolean; requestId: string | null;
  busy: boolean; retrying?: boolean; error?: string; onReady: () => void; onNew: () => void;
  onRetry: () => void; unsaved: boolean; message: string;
  formatter?: FormatterSummary;
}
export function MobileJourney(p: Props) {
  const watching = useRef(false);
  const moved = useRef(false);
  const progress = mobileProgress(p.status);
  const running = !!progress && p.status !== 'awaiting_user';
  useEffect(() => { if (running) watching.current = true; }, [running]);
  useEffect(() => {
    if (p.ready && watching.current && !moved.current) {
      moved.current = true;
      p.onReady();
    }
  }, [p.ready, p.onReady]);
  const preview = import.meta.env.VITE_OFFERMESH_MOCK;
  const mode = p.formatter ? p.formatter.provider==='openai'?`LLM 已解析 · ${p.formatter.model??'OpenAI'}`:'離線規則解析 · 非 LLM 成功' : preview ? '互動預覽 · 不呼叫 AI' : import.meta.env.VITE_OFFERMESH_RUNTIME_MODE === 'live' ? '使用 AI 解析 · 失敗時會標示備援' : '離線 Demo · 不呼叫 AI';
  if (running || p.requestId || (p.busy && !p.ready)) {
    return <section key="processing" className="mobile-journey mobile-processing mobile-screen-enter" aria-labelledby="journey-title">
      <span className="mobile-mode">{mode}</span>
      <div className="journey-orbit" aria-hidden="true"><span/><span/><div><Sparkles size={38}/></div></div>
      <p className="mobile-eyebrow">YOUR BUYER AGENT</p>
      <h1 id="journey-title">{p.ready ? '好選擇，已就位。' : running ? <>你慢慢挑，<br/>我先幫你比。</> : p.status==='failed'?'這次比價中斷了。':p.status==='no_match'?'還沒找到合適的。':'再確認一下需求。'}</h1>
      <p className="journey-description" aria-live="polite">{p.error || progress?.text || '這輪已結束或需要補充條件，請開始新需求。'}</p>
      {progress && <div className="journey-progress">
        <div className="journey-progress-label"><span>{p.error ? '進度暫停更新' : '依處理階段估算'}</span><strong>{progress.percent}<small>%</small></strong></div>
        <div className="journey-track" role="progressbar" aria-label="處理階段估算進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.percent}%，階段估算，非剩餘時間`}><span style={{transform:`scaleX(${progress.percent / 100})`}}/></div>
        <ol className="journey-steps">{steps.map((label,i)=><li key={label} data-state={i<progress.step?'done':i===progress.step?'current':'next'}><span>{i<progress.step?<Check size={12}/>:i+1}</span>{label}</li>)}</ol>
      </div>}
      {p.message && <blockquote className="journey-request"><span>這次的小心願</span>{p.message}</blockquote>}
      {p.ready && <button className="mobile-primary" onClick={p.onReady}>查看推薦 <ArrowUpRight size={20}/></button>}
      {p.error && <button className="button secondary" disabled={p.retrying} onClick={p.onRetry}>重新核對狀態</button>}
      {!running && !p.ready && !p.busy && <button className="mobile-primary" onClick={p.onNew}>開始新的購物需求</button>}
      <p className="mobile-safety"><ShieldCheck size={14}/> 廣告不影響推薦 · 不會自動付款</p>
    </section>;
  }
  const valid = !!p.draft.trim() && [...p.draft.trim()].length <= 2000 && !p.busy;
  const send = () => { if (valid) { watching.current=true; p.onSend(); } };
  return <section key="home" className="mobile-journey mobile-home mobile-home-minimal mobile-screen-enter" aria-label="輸入購物需求">
    <div className="home-signal" aria-hidden="true"><i/><i/><span><Sparkles size={28}/></span></div>
    <form className="mobile-prompt" onSubmit={e=>{e.preventDefault();send();}}><label className="sr-only" htmlFor="mobile-prompt">輸入購物需求</label><textarea id="mobile-prompt" aria-label="輸入購物需求" placeholder="想買一隻安靜的無線滑鼠，800 元左右…" value={p.draft} onChange={e=>p.onDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><button className="mobile-primary" type="submit" aria-label="送出需求" disabled={!valid}>開始 <ArrowUpRight size={21}/></button></form>
    <span className="mobile-mode">{mode}</span>
    {p.unsaved && <p className="mobile-inline-note">未儲存的代理設定不會套用；可以直接送出。</p>}
    {[...p.draft.trim()].length>2000 && <p role="alert">需求最多 2,000 個字元。</p>}
    {p.error && <p role="alert">{p.error}</p>}
    <p className="mobile-safety"><ShieldCheck size={14}/> Demo · 不會自動付款</p>
  </section>;
}
