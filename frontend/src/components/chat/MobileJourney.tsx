import {useEffect, useRef} from 'react';
import {ArrowUpRight, Check, MessageSquareText, Send, ShieldCheck} from 'lucide-react';
import type {AgentProgressStatus} from './AgentProgress';
import {TurnDealMark} from './TurnDealMark';
import '../../styles/deal-progress.css';

const steps = ['讀懂需求', '尋找賣家', '幫你議價', '比較推薦'];
export function mobileProgress(status?: AgentProgressStatus) {
  switch (status) {
    case 'submitting': return {percent: 3, step: 0, text: '正在安全送出需求'};
    case 'formatting': return {percent: 12, step: 0, text: '正在整理需求與偏好'};
    case 'orchestrating': return {percent: 30, step: 1, text: '正在篩選符合條件的賣家'};
    case 'negotiating': return {percent: 60, step: 2, text: '正在比較各賣家的議價回覆'};
    case 'evaluating': return {percent: 88, step: 3, text: '正在驗證報價並整理推薦'};
    case 'awaiting_user': return {percent: 100, step: 4, text: '比較完成，來看看你的專屬推薦。'};
    default: return null;
  }
}

interface Props {
  draft: string; onDraft: (value: string) => void; onSend: () => void;
  status?: AgentProgressStatus; ready: boolean; requestId: string | null;
  busy: boolean; retrying?: boolean; error?: string; onReady: () => void; onNew: () => void;
  onRetry: () => void; unsaved: boolean; message: string;
  buyerName?: string;
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
  if (running || p.requestId || (p.busy && !p.ready)) {
    return <section key="processing" className="mobile-journey mobile-processing deal-processing mobile-screen-enter" data-running={running&&!p.error} aria-labelledby="journey-title">
      <div className="deal-processing-mark" aria-hidden="true"><i/><i/><span><TurnDealMark size={36}/></span></div>
      <p className="mobile-eyebrow"><span className="deal-live-dot" aria-hidden="true"/>TURNDEAL · WORKING FOR YOU</p>
      <h1 id="journey-title">{p.ready ? '推薦已準備完成' : running ? '正在為你尋找好選擇' : p.status==='failed'?'這次比價中斷了':p.status==='no_match'?'目前沒有合適方案':'需要再確認需求'}</h1>
      <p className="journey-description" aria-live="polite">{p.error || progress?.text || '這輪已結束或需要補充條件，請開始新需求。'}</p>
      {progress && <div className="journey-progress">
        <div className="journey-progress-label"><span>{p.error ? '進度暫停更新' : '依處理階段估算'}</span><strong>{progress.percent}<small>%</small></strong></div>
        <div className="journey-track" role="progressbar" aria-label="處理階段估算進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.percent}%，階段估算，非剩餘時間`}><span style={{width:`${progress.percent}%`}}><i/></span></div>
        <ol className="journey-steps">{steps.map((label,i)=><li key={label} data-state={i<progress.step?'done':i===progress.step?'current':'next'}><span>{i<progress.step?<Check size={12}/>:i+1}</span>{label}</li>)}</ol>
      </div>}
      {p.message && <blockquote className="journey-request"><span>本次需求</span>{p.message}</blockquote>}
      {p.ready && <button className="mobile-primary" onClick={p.onReady}>查看推薦 <ArrowUpRight size={20}/></button>}
      {p.error && <button className="button secondary" disabled={p.retrying} onClick={p.onRetry}>重新核對狀態</button>}
      {!running && !p.ready && !p.busy && <button className="mobile-primary" onClick={p.onNew}>開始新的購物需求</button>}
      <p className="mobile-safety"><ShieldCheck size={14}/> 廣告不影響推薦 · 不會自動付款</p>
    </section>;
  }
  const valid = !!p.draft.trim() && [...p.draft.trim()].length <= 2000 && !p.busy;
  const send = () => { if (valid) { watching.current=true; p.onSend(); } };
  const name=p.buyerName?.trim();
  return <section key="home" className="mobile-journey mobile-home mobile-home-minimal mobile-screen-enter" aria-label="輸入購物需求">
    <div className="home-signal" aria-hidden="true"><span><TurnDealMark size={30}/></span></div>
    <h1 className="mobile-greeting">{name?<>{name} 您好，<span>今天想要買什麼商品呢？</span></>:'今天想要買什麼商品呢？'}</h1>
    <form className="mobile-prompt" onSubmit={e=>{e.preventDefault();send();}}>
      <div className="mobile-prompt-field" data-tour="chat-input">
        <div className="mobile-prompt-head"><MessageSquareText size={14}/><span>描述你的購物需求</span></div>
        <label className="sr-only" htmlFor="mobile-prompt">輸入購物需求</label>
        <textarea id="mobile-prompt" aria-label="輸入購物需求" placeholder="想買一隻安靜的無線滑鼠，800 元左右…" value={p.draft} onChange={e=>p.onDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
      </div>
      <button className="mobile-primary" data-tour="send-button" type="submit" disabled={!valid}><span className="mobile-primary-shine" aria-hidden="true"/><span>送出需求</span><Send size={18}/></button>
    </form>
    {p.unsaved && <p className="mobile-inline-note">未儲存的代理設定不會套用；可以直接送出。</p>}
    {[...p.draft.trim()].length>2000 && <p role="alert">需求最多 2,000 個字元。</p>}
    {p.error && <p role="alert">{p.error}</p>}
  </section>;
}
