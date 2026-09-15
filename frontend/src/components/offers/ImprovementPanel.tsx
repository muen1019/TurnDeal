import {useEffect,useState} from 'react';
import {validateWire} from '../../api/client';
import type {ImprovementStatus} from '../../contract.generated';

export function ImprovementPanel({requestId,accepted,onClarify,pending=false,refreshKey=0}:{requestId:string;accepted:boolean;onClarify?:(id:string,text:string)=>void;pending?:boolean;refreshKey?:number}){
  const [job,setJob]=useState<ImprovementStatus>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [feedback,setFeedback]=useState('');
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();setJob(null);setError('');
    const poll=async()=>{try{
      const response=await fetch(`/api/requests/${encodeURIComponent(requestId)}/improvement`,{signal:controller.signal});
      if(!response.ok)throw new Error('讀取需求改善狀態失敗。');
      const value=validateWire<ImprovementStatus>('ImprovementStatus',await response.json());
      if(value&&value.request_id!==requestId)throw new Error('需求改善回應不符。');
      if(stopped)return;setJob(value);
      if(value&&(['queued','running'].includes(value.status)||(value.workflow_enabled&&value.status==='ready'&&!value.next_request_id)))timer=setTimeout(poll,value.workflow_error?5000:1000);
    }catch(e){if(!stopped)setError(e instanceof Error?e.message:'讀取失敗。');}};
    void poll();return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);};
  },[requestId,retry,refreshKey,accepted]);
  if(error)return <section className="status-panel" role="status"><p>{error}</p><button onClick={()=>setRetry(v=>v+1)}>重新讀取改善狀態</button></section>;
  if(!job)return null;
  return <section className="status-panel" aria-label="需求改善" aria-live="polite">
    <h2>{accepted?'先前拒絕紀錄的改善結果':'需求改善'}</h2>
    {accepted&&<p>已採用的方案保持不變，你可以繼續購買。</p>}
    {['queued','running'].includes(job.status)&&<p>正在整理拒絕紀錄與需求。</p>}
    {job.status==='failed'&&<p>需求改善未完成，原決策已保存。</p>}
    {job.result&&<>
      <p>{job.result.intent_state==='ready'?'已保存改善後的需求。':'已保存需求草稿，還需要補充原因。'}{job.next_request_id?'已建立下一輪比價。':accepted?'已採用方案不會重啟比價。':'尚未建立下一輪比價。'}</p>
      {job.result.questions.map((q,i)=><p key={i}>{q}</p>)}
      <details><summary>查看需求文件</summary><pre style={{whiteSpace:'pre-wrap'}}>{job.result.documents.intent_md}</pre></details>
      <p>{job.result.preference_updated?'已依明確的長期偏好更新全域偏好。':'全域偏好保持不變。'}</p>
    </>}
    {job.workflow_error&&<p role="alert">下一輪尚未建立，系統會重試交接；原改善結果已保存。</p>}
    {job.can_clarify&&onClarify&&<form onSubmit={event=>{event.preventDefault();if(!pending&&feedback.trim())onClarify(job.improvement_id,feedback);}}>
      <label htmlFor={`clarify-${requestId}`}>完整調整條件</label>
      <p>請完整說明新的預算、交期或偏好。這次回答會取代先前的調整指示，原始購買限制仍保留。</p>
      <textarea id={`clarify-${requestId}`} value={feedback} onChange={event=>setFeedback(event.target.value)} disabled={pending} maxLength={2000}/>
      <button className="button primary" disabled={pending||!feedback.trim()} type="submit">{pending?'正在確認提交…':'送出澄清並繼續比價'}</button>
    </form>}
    {job.next_request_id&&!pending&&<a className="button primary" href={`/requests/${encodeURIComponent(job.next_request_id)}`}>查看下一輪比價</a>}
  </section>;
}
