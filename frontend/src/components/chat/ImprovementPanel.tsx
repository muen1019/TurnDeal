import {useEffect,useRef,useState} from 'react';
import type {ImprovementStatus,ImprovementClarificationResult} from '../../contract.generated';
import {ApiFailure,request,postJournal,validateWire} from '../../api/client';
import {newId} from '../../state/id';
import '../../styles/commerce.css';
type Pending={key:string;body:{improvement_id:string;feedback:string}};
export function ImprovementPanel({requestId,onNext,onNew,accepted=false}:{requestId:string;onNext:(id:string)=>Promise<void>;onNew:()=>void;accepted?:boolean}){
 const path=`/api/requests/${encodeURIComponent(requestId)}/improvement`,key='turndeal.improvement:'+requestId;
 const [state,setState]=useState<ImprovementStatus>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[answer,setAnswer]=useState('');
 const pending=useRef<Pending|null>(null),locked=useRef(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{try{const raw=sessionStorage.getItem(key);if(raw){const p=JSON.parse(raw);validateWire('ImprovementClarification',p.body);if(typeof p.key!=='string')throw Error();pending.current=p;setAnswer(p.body.feedback);setUncertain(true);}}catch{setError('無法恢復原補充，請先重新核對狀態。');setUncertain(true);}},[key]);
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const load=async()=>{try{
   const next=validateWire<ImprovementStatus>('ImprovementStatus',await request(path,{signal:controller.signal}));
   if(stopped)return;if(next&&next.request_id!==requestId)throw new ApiFailure(0,'invalid_response','改善工作與需求不一致。');setState(next);setLoading(false);
   if(next&&(['queued','running'].includes(next.status)||next.status==='ready'&&next.workflow_enabled&&!next.next_request_id))timer=setTimeout(load,next.workflow_error?5000:1500);
  }catch{if(!stopped){setError('無法取得改善進度，請重新核對。');setLoading(false);}}};void load();return()=>{stopped=true;clearTimeout(timer);controller.abort();};
 },[path,refresh]);
 const execute=async(p:Pending)=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{pending.current=p;sessionStorage.setItem(key,JSON.stringify(p));const r=validateWire<ImprovementClarificationResult>('ImprovementClarificationResult',await postJournal(path+'/clarifications',p.body,p.key));if(r.request_id!==requestId)throw new ApiFailure(0,'invalid_response','回覆不屬於這輪需求。');sessionStorage.removeItem(key);pending.current=null;setUncertain(false);setAnswer('');setState(s=>s?{...s,status:'queued',can_clarify:false}:s);setRefresh(n=>n+1);}
  catch(e){const unknown=!(e instanceof ApiFailure)||e.status===0||e.status>=500;setUncertain(unknown);setError(unknown?'補充結果尚未確認，請使用原操作重試。':e.message);if(!unknown){pending.current=null;sessionStorage.removeItem(key);setRefresh(n=>n+1);}}
  finally{locked.current=false;setBusy(false);}
 };
 if(accepted&&!loading&&!state&&!error)return null;
 return <section className="commerce-panel" aria-label="需求改善"><div className="commerce-body">
 <span className="commerce-eyebrow">TURNDEAL · REFINE</span><h2>{accepted?'你的購物偏好':'讓下一輪更接近你想要的'}</h2>
 {loading||state&&['queued','running'].includes(state.status)?<p role="status">正在根據你的回饋整理更具體的需求…</p>:null}
 {error&&<p role="alert">{error}</p>}
 {state?.result&&<><p>{state.result.preference_updated?'已根據你明確表達的長期偏好保存新版本。':'這次只調整本輪需求，未改動長期偏好。'}</p><ol className="improvement-questions">{state.result.questions.map((q,i)=><li key={i}>{q}</li>)}</ol></>}
 {state?.can_clarify&&<form onSubmit={e=>{e.preventDefault();if(answer.trim()&&!busy&&!uncertain)void execute({key:newId(),body:{improvement_id:state.improvement_id,feedback:answer.trim()}});}}><label htmlFor={'improve-'+requestId}>完整說明這次想調整的條件</label><p>例如：這次含運預算改成 800 元，7 天內到貨，其餘維持。請一起寫出要保留的調整。</p><textarea id={'improve-'+requestId} className="improvement-answer" value={answer} maxLength={2000} disabled={busy||uncertain} onChange={e=>setAnswer(e.target.value)}/><button className="button primary" disabled={busy||uncertain||!answer.trim()}>更新需求並重新篩選</button></form>}
 {state?.next_request_id&&!accepted&&<button className="button primary" disabled={busy||uncertain} onClick={()=>{setBusy(true);void onNext(state.next_request_id!).catch(()=>setError('下一輪暫時無法開啟，請重試。')).finally(()=>setBusy(false));}}>查看新一輪結果</button>}
 {state?.workflow_error&&<p role="status">需求已更新，正在重新啟動搜尋。若持續無法完成，請開始新需求。</p>}
 {state?.status==='failed'&&<p>這輪改善未完成，原本的需求與決策仍保留。</p>}
 {uncertain?<button className="button secondary" disabled={busy} onClick={()=>pending.current?void execute(pending.current):setRefresh(n=>n+1)}>核對原補充操作</button>:<button className="text-button" disabled={busy} onClick={()=>{setError('');setRefresh(n=>n+1);}}>重新核對改善狀態</button>}
 {!accepted&&<button className="text-button" disabled={busy||uncertain} onClick={onNew}>開始全新需求</button>}
 </div></section>;
}
