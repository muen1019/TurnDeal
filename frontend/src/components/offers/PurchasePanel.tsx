import {useEffect,useRef,useState} from 'react';
import type {BuyerProfile} from '../../contract.generated';
import type {CheckoutUpdate,PurchaseView} from '../../purchase.generated';
import {ApiFailure,request,postJournal} from '../../api/client';
import {purchaseView,validPurchaseBody} from '../../api/purchase';
import {newId} from '../../state/id';
import '../../styles/commerce.css';

type Pending={path:string;body:Record<string,unknown>;key:string};
export function PurchasePanel({requestId,offerId,profile}:{requestId:string;offerId:string;profile:BuyerProfile|null}){
 const journalKey='turndeal.purchase:'+requestId;
 const [view,setView]=useState<PurchaseView|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const pending=useRef<Pending|null>(null),locked=useRef(false),mounted=useRef(true);
 const [form,setForm]=useState({name:profile?.name??'',email:'',line_one:profile?.shipping_address??'',city:'',state:'',postal_code:'',option:''});
 const [editing,setEditing]=useState(false);
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
  const body:CheckoutUpdate={buyer:{name:form.name.trim(),email:form.email.trim()},fulfillment_address:{name:form.name.trim(),line_one:form.line_one.trim(),city:form.city.trim(),state:form.state.trim(),country:'TW',postal_code:form.postal_code.trim()},fulfillment_option_id:form.option};
  // Address stays in memory, never in the browser recovery journal. Reload reads server state.
  mutate('checkout',body as unknown as Record<string,unknown>,false);
 };
 const waiting=busy||loading||uncertain||!!view&&['creating','submitting','reconciling'].includes(view.status);
 const ready=view?.status==='ready'&&!editing;
 if(loading)return <div className="commerce-panel" role="status">正在核對結帳狀態…</div>;
 return <section className="commerce-panel" aria-label="測試結帳"><span className="commerce-eyebrow">TURNDEAL CHECKOUT · TEST</span>
 {error&&<p role="alert">{error}</p>}
 {uncertain&&<button className="button secondary" disabled={busy} onClick={()=>{if(pending.current)void execute(pending.current,!pending.current.path.endsWith('/checkout'));else void load().then(()=>setUncertain(false));}}>核對原購買操作</button>}
 {!view&&!error&&<><h2>準備好結帳了嗎？</h2><p>選定的價格已鎖定至報價到期。下一步確認收件資料，不會立即付款。</p><button className="button primary" disabled={waiting} onClick={()=>mutate('create')}>前往測試結帳</button></>}
 {!view&&error&&!uncertain&&<button className="button secondary" onClick={()=>void load().then(()=>setError(''))}>重新讀取結帳</button>}
 {view?.status==='completed'&&view.order?<div className="purchase-receipt"><span className="receipt-check">✓</span><h2>測試購買完成</h2><p>訂單已建立，付款為模擬成功，不會扣款或出貨。</p><dl><dt>訂單編號</dt><dd>{view.order.order_id}</dd><dt>總金額（含稅運）</dt><dd>NT${view.order.total_price_twd.toLocaleString()}</dd><dt>收件人</dt><dd>{view.checkout?.buyer?.name}</dd><dt>運送地址</dt><dd>{view.checkout?.fulfillment_address?.city} {view.checkout?.fulfillment_address?.line_one}</dd></dl></div>:view&&<>
 <h2>{ready?'確認這筆測試訂單':view.status==='canceled'?'結帳已取消':view.status==='expired'?'報價已過期':view.status==='blocked'?'暫時無法結帳':'收件與配送資料'}</h2>
 <p className="checkout-total">NT${view.offer.total_price_twd.toLocaleString()} <small>含稅運 · 不加收費用</small></p>
 {['creating','submitting','reconciling'].includes(view.status)&&<p role="status">正在向測試商家核對結果，請稍候…</p>}
 {view.error&&<p role="alert">{view.error.message||'請重新選擇有效報價。'}</p>}
 {view.checkout&&['ready','needs_input'].includes(view.status)&&<form onSubmit={e=>{e.preventDefault();update();}} className="checkout-form"><fieldset disabled={waiting||ready}>
 {([['name','收件人姓名'],['email','電子郵件'],['line_one','街道地址'],['city','城市／縣市'],['state','區域'],['postal_code','郵遞區號']] as const).map(([key,label])=><label key={key}>{label}<input required maxLength={key==='line_one'?240:100} type={key==='email'?'email':'text'} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></label>)}
 <label>配送方式<select required value={form.option} onChange={e=>setForm(f=>({...f,option:e.target.value}))}><option value="" disabled>請選擇配送方式</option>{view.checkout.fulfillment_options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select></label></fieldset>
 {!ready&&<button className="button primary" disabled={waiting}>儲存並確認資料</button>}</form>}
 {ready&&<><p>按下確認後會建立一筆測試訂單。付款方式為模擬付款，不需卡號或 API key。</p><button className="button primary" disabled={waiting||!view.allowed_actions.includes('complete')||!view.confirmation_token} onClick={()=>mutate('complete',{confirmation_token:view.confirmation_token})}>確認測試購買 · NT${view.offer.total_price_twd.toLocaleString()}</button><button className="text-button" disabled={waiting} onClick={()=>setEditing(true)}>修改收件資料</button></>}
 {view.allowed_actions.includes('cancel')&&<button className="text-button" disabled={waiting} onClick={()=>mutate('cancel')}>取消這次結帳</button>}
 </>}
 <small className="commerce-footnote">測試商家 · 模擬付款 · 不會實際扣款或出貨</small></section>;
}
