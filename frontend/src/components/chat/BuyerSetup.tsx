import {useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CreditCard,ShieldCheck,SlidersHorizontal,UserRound} from 'lucide-react';
import {ShippingAddressFields,validShippingRegion} from './ShippingAddressFields';
import type {BuyerProfile} from '../../contract.generated';
export const defaultBuyerProfile:BuyerProfile={name:'',shipping_address:'',payment_method:'later',weights:{price:45,delivery:20,trust:20,color:15},colors:[]};
const emptyShipping={email:'',city:'',state:'',postal_code:'',country:'TW' as const};
const colors=[['black','墨黑','#17283f'],['white','霧白','#f3f6fb'],['blue','冰藍','#70b5ef'],['red','紅色','#d76778'],['rose','粉色','#e8bbd7']] as const;
const factors=[['price','價格','在預算內，更在意價格'],['delivery','到貨速度','希望商品更快送達'],['trust','賣家評價','更看重賣家的可信度'],['color','顏色符合度','更接近你喜歡的顏色']] as const;
type WeightKey=keyof BuyerProfile['weights'];
function allocatePercentages(weights:BuyerProfile['weights'],activeKeys:readonly WeightKey[],total=100):BuyerProfile['weights']{
  const result={price:0,delivery:0,trust:0,color:0};
  const values=activeKeys.map(key=>Math.max(0,Number.isFinite(weights[key])?weights[key]:0));
  const valueTotal=values.reduce((sum,value)=>sum+value,0);
  if(!valueTotal)return result;
  const exact=values.map(value=>value/valueTotal*total);
  const allocated=exact.map(Math.floor);
  let remainder=total-allocated.reduce((sum,value)=>sum+value,0);
  exact.map((value,index)=>({index,fraction:value-allocated[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index).forEach(({index})=>{if(remainder>0){allocated[index]++;remainder--;}});
  activeKeys.forEach((key,index)=>{result[key]=allocated[index];});
  return result;
}
function rebalancePercentages(weights:BuyerProfile['weights'],key:WeightKey,value:number,activeKeys:readonly WeightKey[]):BuyerProfile['weights']{
  const target=Math.max(0,Math.min(100,Math.round(value)));
  const others=activeKeys.filter(activeKey=>activeKey!==key);
  const otherWeights={...weights};
  if(others.length&&!others.some(otherKey=>otherWeights[otherKey]>0))others.forEach(otherKey=>{otherWeights[otherKey]=1;});
  const redistributed=allocatePercentages(otherWeights,others,100-target);
  return {...redistributed,[key]:target};
}
export function BuyerSetup({initial,onSave,onCancel,busy,error,uncertain,onRetry,onReload}:{initial:BuyerProfile|null;onSave:(p:BuyerProfile)=>Promise<boolean>;onCancel?:()=>void;busy:boolean;error:string;uncertain:boolean;onRetry:()=>void;onReload:()=>void}){
  const [step,setStep]=useState(0),[draft,setDraft]=useState<BuyerProfile>(()=>structuredClone({...initial??defaultBuyerProfile,shipping_details:initial?.shipping_details??emptyShipping}));
  const [localError,setLocalError]=useState('');const root=useRef<HTMLElement>(null);
  const jump=(next:number)=>{setStep(next);const scroller=root.current?.closest('.setup-container');if(scroller)scroller.scrollTop=0;};
  const activeKeys=factors.map(([key])=>key).filter(key=>key!=='color'||draft.colors.length) as WeightKey[];
  const activeTotal=activeKeys.reduce((sum,key)=>sum+draft.weights[key],0);
  const percentages=allocatePercentages(draft.weights,activeKeys);
  const change=<K extends keyof BuyerProfile>(key:K,value:BuyerProfile[K])=>setDraft(d=>({...d,[key]:value}));
  const changeWeight=(key:WeightKey,value:number)=>change('weights',rebalancePercentages(percentages,key,value,activeKeys));
  async function submit(){
    if(!draft.name.trim()){setLocalError('請先填寫名稱。');jump(0);return;}
    if(/sk-[A-Za-z0-9_-]{16,}|(?:\d[ -]?){13,19}/.test(draft.name+' '+draft.shipping_address)){setLocalError('請勿填寫 API key、信用卡號或金融帳號。');jump(0);return;}
    const shipping=draft.shipping_details;
    if(!draft.shipping_address.trim()||!shipping||!validShippingRegion({...shipping,line_one:draft.shipping_address})||!/^\S+@\S+\.\S+$/.test(shipping.email)||!/^\d{3}(\d{2,3})?$/.test(shipping.postal_code)){setLocalError('請填妥收件電子郵件、縣市、區域、郵遞區號與街道地址。');jump(0);return;}
    setLocalError('');
    if(step===0){jump(1);return;}
    if(!activeTotal){setLocalError('至少提高一項有效偏好的重要程度。');return;}
    await onSave({...draft,name:draft.name.trim(),shipping_address:draft.shipping_address.trim(),weights:percentages});
  }
  return <section ref={root} className="buyer-setup" data-step={step} aria-labelledby="setup-title">
    <div className="setup-top"><span className="setup-kicker">YOUR PERSONAL BUYER</span>{onCancel&&<button className="text-button" disabled={busy||uncertain} onClick={onCancel}>關閉</button>}</div>
    <div className="setup-steps" aria-label={`設定步驟 ${step+1} / 2`}><span data-active={step===0}>{step? <Check size={13}/>:<UserRound size={13}/>} 基本資料</span><i/><span data-active={step===1}><SlidersHorizontal size={13}/> 購物偏好</span></div>
    <div className="setup-heading"><div className="setup-symbol">{step===0?<UserRound size={26}/>:<SlidersHorizontal size={26}/>}</div><h1 id="setup-title">{step===0?'先認識一下你':'好選擇，由你定義'}</h1><p>{step===0?'設定你的購物資料，接著選擇在意的事。':'調整重要程度，讓每一次推薦更合拍。'}</p></div>
    <form onSubmit={e=>{e.preventDefault();void submit();}}>
      <fieldset disabled={busy||uncertain} className="setup-fields">
        {step===0?<>
          <label className="setup-label"><span><UserRound size={16}/> 名稱（收件人） <small>必填</small></span><input autoComplete="off" maxLength={60} placeholder="你的稱呼" value={draft.name} onChange={e=>change('name',e.target.value)}/></label>
          <label className="setup-label"><span>電子郵件 <small>必填</small></span><input aria-label="電子郵件" type="email" autoComplete="off" maxLength={100} value={draft.shipping_details?.email??''} onChange={e=>change('shipping_details',{...draft.shipping_details??emptyShipping,email:e.target.value})}/></label>
          <ShippingAddressFields value={{...draft.shipping_details??emptyShipping,line_one:draft.shipping_address}} onChange={value=>setDraft(d=>({...d,shipping_address:value.line_one,shipping_details:{...d.shipping_details??emptyShipping,city:value.city,state:value.state,postal_code:value.postal_code}}))}/>
          <label className="setup-label"><span><CreditCard size={16}/> 偏好付款方式</span><select value={draft.payment_method} onChange={e=>change('payment_method',e.target.value as BuyerProfile['payment_method'])}><option value="later">結帳時再決定</option><option value="card">信用卡</option><option value="mobile">行動支付</option><option value="cash_on_delivery">貨到付款</option></select></label>
          <div className="setup-privacy"><ShieldCheck size={18}/><p>Demo 請使用虛構資料。不收卡號或安全碼，基本資料不會送給 AI，也不會自動付款。</p></div>
        </>:<>
          <div className="weight-overview"><span>你的偏好配比</span><div className="weight-bar" aria-hidden="true">{factors.map(([key])=><i key={key} data-factor={key} style={{flex:percentages[key]}}/>)}</div><p>調整任一項時會同步分配其他項目，總和永遠是 100%。</p></div>
          {factors.map(([key,label,hint])=>{const inactive=key==='color'&&!draft.colors.length;return <div className="weight-control" key={key}><label htmlFor={'weight-'+key}><span>{label}<small>{hint}</small></span><strong>{inactive?'—':`${percentages[key]}%`}</strong></label><input id={'weight-'+key} type="range" min={0} max={100} step={1} value={percentages[key]} disabled={inactive} aria-valuetext={inactive?'請先選擇顏色':`${percentages[key]}%`} onChange={e=>changeWeight(key,Number(e.target.value))}/><div className="range-scale"><span>不在意</span><span>很重要</span></div></div>;})}
          <div className="setup-color"><p>喜歡的顏色 <small>可複選，不選表示不限</small></p><div className="color-options">{colors.map(([value,label,hex])=><button key={value} type="button" aria-pressed={draft.colors.includes(value)} onClick={()=>change('colors',draft.colors.includes(value)?draft.colors.filter(c=>c!==value):[...draft.colors,value])}><span style={{background:hex}}>{draft.colors.includes(value)&&<Check size={13} color={value==='black'?'white':'#122b59'}/>}</span>{label}</button>)}</div></div>
          <p className="setup-footnote">未選顏色時，顏色權重不計分。最高預算、交期與本次明確要求仍優先。</p>
        </>}
      </fieldset>
      {(error||localError)&&<div className="setup-error" role="alert">{localError||error}{error&&<button type="button" disabled={busy} onClick={uncertain?onRetry:onReload}>{uncertain?'核對原提交':'重新載入'}</button>}</div>}
      <div className="setup-actions">{step===1&&<button className="setup-back" type="button" disabled={busy||uncertain} onClick={()=>jump(0)} aria-label="返回基本資料"><ArrowLeft size={19}/></button>}<button className="setup-primary" disabled={busy||uncertain||step===0&&!draft.name.trim()} type="submit">{busy?'儲存中…':step===0?'下一步':'儲存並開始'}<ArrowRight size={18}/></button></div>
      <p className="setup-storage">儲存於本機 SQLite · 非正式付款資料庫</p>
    </form>
  </section>;
}
