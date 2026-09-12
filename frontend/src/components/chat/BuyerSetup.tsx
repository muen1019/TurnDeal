import {useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CreditCard,MapPin,ShieldCheck,SlidersHorizontal,UserRound} from 'lucide-react';
import type {BuyerProfile} from '../../contract.generated';
export const defaultBuyerProfile:BuyerProfile={name:'',shipping_address:'',payment_method:'later',weights:{price:45,delivery:20,trust:20,color:15},colors:[]};
const colors=[['black','墨黑','#17283f'],['white','霧白','#f3f6fb'],['blue','冰藍','#70b5ef'],['red','紅色','#d76778'],['rose','粉色','#e8bbd7']] as const;
const factors=[['price','價格','在預算內，更在意價格'],['delivery','到貨速度','希望商品更快送達'],['trust','賣家評價','更看重賣家的可信度'],['color','顏色符合度','更接近你喜歡的顏色']] as const;
export function BuyerSetup({initial,onSave,onCancel,busy,error,uncertain,onRetry,onReload}:{initial:BuyerProfile|null;onSave:(p:BuyerProfile)=>Promise<boolean>;onCancel?:()=>void;busy:boolean;error:string;uncertain:boolean;onRetry:()=>void;onReload:()=>void}){
  const [step,setStep]=useState(0),[draft,setDraft]=useState<BuyerProfile>(()=>structuredClone(initial??defaultBuyerProfile));
  const [localError,setLocalError]=useState('');const root=useRef<HTMLElement>(null);
  const jump=(next:number)=>{setStep(next);const scroller=root.current?.closest('.setup-container');if(scroller)scroller.scrollTop=0;};
  const activeTotal=draft.weights.price+draft.weights.delivery+draft.weights.trust+(draft.colors.length?draft.weights.color:0);
  const change=<K extends keyof BuyerProfile>(key:K,value:BuyerProfile[K])=>setDraft(d=>({...d,[key]:value}));
  async function submit(){
    if(!draft.name.trim()){setLocalError('請先填寫名稱。');jump(0);return;}
    if(/sk-[A-Za-z0-9_-]{16,}|(?:\d[ -]?){13,19}/.test(draft.name+' '+draft.shipping_address)){setLocalError('請勿填寫 API key、信用卡號或金融帳號。');jump(0);return;}
    setLocalError('');
    if(step===0){jump(1);return;}
    if(!activeTotal){setLocalError('至少提高一項有效偏好的重要程度。');return;}
    await onSave({...draft,name:draft.name.trim(),shipping_address:draft.shipping_address.trim()});
  }
  return <section ref={root} className="buyer-setup" data-step={step} aria-labelledby="setup-title">
    <div className="setup-top"><span className="setup-kicker">YOUR PERSONAL BUYER</span>{onCancel&&<button className="text-button" disabled={busy||uncertain} onClick={onCancel}>關閉</button>}</div>
    <div className="setup-steps" aria-label={`設定步驟 ${step+1} / 2`}><span data-active={step===0}>{step? <Check size={13}/>:<UserRound size={13}/>} 基本資料</span><i/><span data-active={step===1}><SlidersHorizontal size={13}/> 購物偏好</span></div>
    <div className="setup-heading"><div className="setup-symbol">{step===0?<UserRound size={26}/>:<SlidersHorizontal size={26}/>}</div><h1 id="setup-title">{step===0?'先認識一下你':'好選擇，由你定義'}</h1><p>{step===0?'設定你的購物資料，接著選擇在意的事。':'調整重要程度，讓每一次推薦更合拍。'}</p></div>
    <form onSubmit={e=>{e.preventDefault();void submit();}}>
      <fieldset disabled={busy||uncertain} className="setup-fields">
        {step===0?<>
          <label className="setup-label"><span><UserRound size={16}/> 名稱 <small>必填</small></span><input autoComplete="off" maxLength={60} placeholder="你的稱呼" value={draft.name} onChange={e=>change('name',e.target.value)}/></label>
          <label className="setup-label"><span><MapPin size={16}/> 運送地址 <small>選填</small></span><textarea autoComplete="off" rows={2} maxLength={240} placeholder="縣市、區域與街道地址" value={draft.shipping_address} onChange={e=>change('shipping_address',e.target.value)}/></label>
          <label className="setup-label"><span><CreditCard size={16}/> 偏好付款方式</span><select value={draft.payment_method} onChange={e=>change('payment_method',e.target.value as BuyerProfile['payment_method'])}><option value="later">結帳時再決定</option><option value="card">信用卡</option><option value="mobile">行動支付</option><option value="cash_on_delivery">貨到付款</option></select></label>
          <div className="setup-privacy"><ShieldCheck size={18}/><p>Demo 請使用虛構資料。不收卡號或安全碼，基本資料不會送給 AI，也不會自動付款。</p></div>
        </>:<>
          <div className="weight-overview"><span>你的偏好配比</span><div className="weight-bar" aria-hidden="true">{factors.map(([key])=><i key={key} data-factor={key} style={{flex:activeTotal?(key==='color'&&!draft.colors.length?0:draft.weights[key])/activeTotal:0}}/>)}</div><p>數值越高，越重視該項；不是預算金額。</p></div>
          {factors.map(([key,label,hint])=><div className="weight-control" key={key}><label htmlFor={'weight-'+key}><span>{label}<small>{hint}</small></span><strong>{key==='color'&&!draft.colors.length?'—':`${Math.round((draft.weights[key]/(activeTotal||1))*100)}%`}</strong></label><input id={'weight-'+key} type="range" min={0} max={100} step={5} value={draft.weights[key]} aria-valuetext={`重要程度 ${draft.weights[key]}，相對權重 ${key==='color'&&!draft.colors.length?0:Math.round(draft.weights[key]/(activeTotal||1)*100)}%`} onChange={e=>change('weights',{...draft.weights,[key]:Number(e.target.value)})}/><div className="range-scale"><span>不在意</span><span>很重要</span></div></div>)}
          <div className="setup-color"><p>喜歡的顏色 <small>可複選，不選表示不限</small></p><div className="color-options">{colors.map(([value,label,hex])=><button key={value} type="button" aria-pressed={draft.colors.includes(value)} onClick={()=>change('colors',draft.colors.includes(value)?draft.colors.filter(c=>c!==value):[...draft.colors,value])}><span style={{background:hex}}>{draft.colors.includes(value)&&<Check size={13} color={value==='black'?'white':'#122b59'}/>}</span>{label}</button>)}</div></div>
          <p className="setup-footnote">未選顏色時，顏色權重不計分。最高預算、交期與本次明確要求仍優先。</p>
        </>}
      </fieldset>
      {(error||localError)&&<div className="setup-error" role="alert">{localError||error}{error&&<button type="button" disabled={busy} onClick={uncertain?onRetry:onReload}>{uncertain?'核對原提交':'重新載入'}</button>}</div>}
      <div className="setup-actions">{step===1&&<button className="setup-back" type="button" disabled={busy||uncertain} onClick={()=>jump(0)} aria-label="返回基本資料"><ArrowLeft size={19}/></button>}<button className="setup-primary" disabled={busy||uncertain||step===0&&!draft.name.trim()} type="submit">{busy?'儲存中…':step===0?'下一步':'儲存並開始'}<ArrowRight size={18}/></button></div>
      <p className="setup-storage">{import.meta.env.VITE_OFFERMESH_MOCK?'互動預覽 · 資料只保留於目前頁面':'儲存於本機 SQLite · 非正式付款資料庫'}</p>
    </form>
  </section>;
}
