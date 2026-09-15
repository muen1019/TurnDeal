import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {Check,Lock,ShieldCheck} from 'lucide-react';
import {ShippingAddressFields,validShippingRegion} from '../chat/ShippingAddressFields';
import type {BuyerProfile} from '../../contract.generated';
import type {CheckoutUpdate,PurchaseView} from '../../purchase.generated';
import {ApiFailure,request,postJournal} from '../../api/client';
import {purchaseView,validPurchaseBody} from '../../api/purchase';
import {newId} from '../../state/id';
import '../../styles/commerce.css';

const steps=['商品','收件資料','確認','完成'] as const;

type Pending={path:string;body:Record<string,unknown>;key:string};
export function PurchasePanel({requestId,offerId,profile,header}:{requestId:string;offerId:string;profile:BuyerProfile|null;header?:ReactNode}){
 const journalKey='turndeal.purchase:'+requestId;
 const [view,setView]=useState<PurchaseView|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<Pending|null>(null),locked=useRef(false),mounted=useRef(true);
 const [form,setForm]=useState({name:profile?.name??'',email:profile?.shipping_details?.email??'',line_one:profile?.shipping_address??'',city:profile?.shipping_details?.city??'',state:profile?.shipping_details?.state??'',postal_code:profile?.shipping_details?.postal_code??'',option:''});
 const [editing,setEditing]=useState(false);
 const reduceMotion=useReducedMotion();
 const apply=(raw:unknown)=>{const next=purchaseView(raw,requestId,offerId);if(mounted.current)setView(next);return next;};
 const load=async()=>{
  try{const next=apply(await request(`/api/requests/${encodeURIComponent(requestId)}/purchase`));if(next.checkout){const c=next.checkout;setForm(f=>({...f,name:c.buyer?.name??f.name,email:c.buyer?.email??f.email,line_one:c.fulfillment_address?.line_one??f.line_one,city:c.fulfillment_address?.city??f.city,state:c.fulfillment_address?.state??f.state,postal_code:c.fulfillment_address?.postal_code??f.postal_code,option:c.fulfillment_option_id??c.fulfillment_options[0]?.id??''}));}return next;}
  catch(e){if(!(e instanceof ApiFailure&&e.status===404))setError('無法讀取結帳狀態，請重試。');return null;}
  finally{if(mounted.current)setLoading(false);}
 };
 useEffect(()=>{mounted.current=true;try{const raw=sessionStorage.getItem(journalKey);if(raw){const p=JSON.parse(raw);if(typeof p.key!=='string'||typeof p.path!=='string'||!p.path.startsWith('/api/')||!p.body)throw Error();pending.current=p;setUncertain(true);}}catch{setError('無法恢復原操作，請先核對結帳狀態。');setUncertain(true);}void load();return()=>{mounted.current=false;};},[requestId]);
 useEffect(()=>{if(!view||!['creating','submitting','reconciling'].includes(view.status))return;const timer=setTimeout(()=>void load(),1500);return()=>clearTimeout(timer);},[view]);
 const execute=async(p:Pending,persist=true)=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{
   const createPath=`/api/requests/${encodeURIComponent(requestId)}/purchases`;
   const base=view?`/api/purchases/${encodeURIComponent(view.purchase_id)}/`:null;
   const action=p.path===createPath?'create':base&&p.path.startsWith(base)?p.path.slice(base.length):null;
   if(!action||!['create','checkout','complete','cancel'].includes(action)||typeof p.key!=='string'||!p.key||p.key.length>128)throw new ApiFailure(400,'invalid_journal','原操作與本筆結帳不符，已停止提交。');
   validPurchaseBody(action==='checkout'?'CheckoutUpdate':action==='complete'?'PurchaseComplete':'Empty',p.body);
   pending.current=p;if(persist)sessionStorage.setItem(journalKey,JSON.stringify(p));
   apply(await postJournal(p.path,p.body,p.key));pending.current=null;sessionStorage.removeItem(journalKey);setUncertain(false);setEditing(false);await load();
  }catch(e){
   const unknown=!(e instanceof ApiFailure)||e.status===0||e.status>=500;
   setUncertain(unknown);setError(unknown?'結果尚未確認，請核對原操作，不要重複購買。':e.message);
   if(!unknown){pending.current=null;sessionStorage.removeItem(journalKey);await load();}
  }finally{locked.current=false;if(mounted.current)setBusy(false);}
 };
 const mutate=(action:string,body:Record<string,unknown>={},persist=true)=>void execute({path:view?`/api/purchases/${encodeURIComponent(view.purchase_id)}/${action}`:`/api/requests/${encodeURIComponent(requestId)}/purchases`,body,key:newId()},persist);
 const update=()=>{
  if(!validShippingRegion(form)){setError('請選擇有效縣市、區域並補齊街道門牌。');return;}
  const body:CheckoutUpdate={buyer:{name:form.name.trim(),email:form.email.trim()},fulfillment_address:{name:form.name.trim(),line_one:form.line_one.trim(),city:form.city.trim(),state:form.state.trim(),country:'TW',postal_code:form.postal_code.trim()},fulfillment_option_id:form.option};
  // Address stays in memory, never in the browser recovery journal. Reload reads server state.
  mutate('checkout',body as unknown as Record<string,unknown>,false);
 };
 const waiting=busy||loading||uncertain||!!view&&['creating','submitting','reconciling'].includes(view.status);
 const ready=view?.status==='ready'&&!editing;
 const stepIndex=!view?0:view.status==='completed'?steps.length:ready?2:1;
 const phaseKey=!view?'start':view.status==='completed'?'done':view.status+(editing?':editing':'');
 if(loading)return <div className="commerce-panel" role="status">{header}<div className="commerce-body">正在核對結帳狀態…</div></div>;
 return <section className="commerce-panel" aria-label="結帳">
 {header}
 <div className="commerce-body">
 <div className="checkout-steps" aria-hidden="true">{steps.map((label,i)=><div className="checkout-step" key={label} data-state={i<stepIndex?'done':i===stepIndex?'current':'next'}><span>{i<stepIndex?<Check size={12}/>:i+1}</span>{label}</div>)}</div>
 {error&&<p role="alert">{error}</p>}
 {uncertain&&<button className="button secondary" disabled={busy} onClick={()=>{if(pending.current)void execute(pending.current,!pending.current.path.endsWith('/checkout'));else void load().then(()=>setUncertain(false));}}>核對原購買操作</button>}
 <AnimatePresence mode="wait">
  <motion.div key={phaseKey} initial={reduceMotion?false:{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={reduceMotion?{opacity:0}:{opacity:0,y:-6}} transition={reduceMotion?{duration:0}:{duration:.28,ease:[.22,1,.36,1]}}>
 {!view&&!error&&<div className="checkout-start"><h2>準備好結帳了嗎？</h2><p>選定的價格已鎖定至報價到期，下一步確認收件資料。</p><div className="checkout-start-points"><span><Lock size={12}/>價格已鎖定</span><span><ShieldCheck size={12}/>尚未付款</span></div><button className="button primary" disabled={waiting} onClick={()=>mutate('create')}>前往結帳</button></div>}
 {!view&&error&&!uncertain&&<button className="button secondary" onClick={()=>void load().then(()=>setError(''))}>重新讀取結帳</button>}
 {view?.status==='completed'&&view.order?<div className="purchase-receipt"><h2>購買完成</h2><p>訂單已建立，付款模擬成功，不會扣款或出貨。</p><dl><dt>訂單編號</dt><dd className="receipt-id">{view.order.order_id}</dd><dt>總金額（含稅運）</dt><dd>NT${view.order.total_price_twd.toLocaleString()}</dd><dt>收件人</dt><dd>{view.checkout?.buyer?.name}</dd><dt>運送地址</dt><dd>{view.checkout?.fulfillment_address?.city} {view.checkout?.fulfillment_address?.line_one}</dd></dl></div>:view&&<>
 <h2>{ready?'確認這筆訂單':view.status==='canceled'?'結帳已取消':view.status==='expired'?'報價已過期':view.status==='blocked'?'暫時無法結帳':'收件與配送資料'}</h2>
 <div className="checkout-total-card"><span className="checkout-total-label">應付總額</span><p className="checkout-total">NT${view.offer.total_price_twd.toLocaleString()}<small>含稅運 · 不加收費用</small></p></div>
 {['creating','submitting','reconciling'].includes(view.status)&&<p role="status">正在核對訂單結果，請稍候…</p>}
 {view.error&&<p role="alert">{view.error.message||'請重新選擇有效報價。'}</p>}
 {view.checkout&&['ready','needs_input'].includes(view.status)&&<form onSubmit={e=>{e.preventDefault();update();}} className="checkout-form"><fieldset disabled={waiting||ready}>
 {([['name','收件人姓名'],['email','電子郵件']] as const).map(([key,label])=><label key={key}>{label}<input required maxLength={100} type={key==='email'?'email':'text'} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></label>)}
 <ShippingAddressFields value={form} disabled={waiting||ready} onChange={value=>setForm(f=>({...f,...value}))}/>
 <label>配送方式<select required value={form.option} onChange={e=>setForm(f=>({...f,option:e.target.value}))}><option value="" disabled>請選擇配送方式</option>{view.checkout.fulfillment_options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select></label></fieldset>
 {!ready&&<button className="button primary" disabled={waiting}>儲存並確認資料</button>}</form>}
 {ready&&<><p>按下確認後會建立這筆訂單。付款方式為模擬付款，不需卡號或 API key。</p><button className="button primary" disabled={waiting||!view.allowed_actions.includes('complete')||!view.confirmation_token} onClick={()=>mutate('complete',{confirmation_token:view.confirmation_token})}>確認購買 · NT${view.offer.total_price_twd.toLocaleString()}</button><button className="text-button" disabled={waiting} onClick={()=>setEditing(true)}>修改收件資料</button></>}
 {view.allowed_actions.includes('cancel')&&<button className="text-button" disabled={waiting} onClick={()=>mutate('cancel')}>取消這次結帳</button>}
 </>}
  </motion.div>
 </AnimatePresence>
 <small className="commerce-footnote">模擬付款 · 不會實際扣款或出貨</small>
 </div>
 </section>;
}
