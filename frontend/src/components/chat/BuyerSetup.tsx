import {useRef,useState,type CSSProperties} from 'react';
import {ArrowLeft,ArrowRight,Check,ChevronRight,CreditCard,Lock,ShieldCheck,SlidersHorizontal,Unlock,UserRound} from 'lucide-react';
import {ShippingAddressFields,validShippingRegion} from './ShippingAddressFields';
import {TurnDealMark} from './TurnDealMark';
import {ColorPreferenceModal} from './ColorPreferenceModal';
import {Toast} from './Toast';
import type {BuyerProfile} from '../../contract.generated';
import '../../styles/onboarding.css';
// Pre-filled with fake test data (never a real buyer) purely so onboarding doesn't start from an
// empty form while testing — every field stays fully editable before saving.
export const defaultBuyerProfile:BuyerProfile={name:'Jonathan',shipping_address:'大學路1001號',payment_method:'card',weights:{price:45,delivery:20,trust:20,color:15},colors:[]};
const emptyShipping={email:'jonathan@gmail.com',city:'新竹市',state:'東區',postal_code:'300',country:'TW' as const};
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
// Locked factors keep their exact percentage no matter what else moves — only the unlocked
// ones redistribute the remaining budget, same as before locking existed.
function rebalancePercentages(weights:BuyerProfile['weights'],key:WeightKey,value:number,activeKeys:readonly WeightKey[],locked:ReadonlySet<WeightKey>):BuyerProfile['weights']{
  const lockedOthers=activeKeys.filter(k=>k!==key&&locked.has(k));
  const freeOthers=activeKeys.filter(k=>k!==key&&!locked.has(k));
  const lockedSum=lockedOthers.reduce((sum,k)=>sum+weights[k],0);
  const target=Math.max(0,Math.min(100-lockedSum,Math.round(value)));
  const otherWeights={...weights};
  if(freeOthers.length&&!freeOthers.some(otherKey=>otherWeights[otherKey]>0))freeOthers.forEach(otherKey=>{otherWeights[otherKey]=1;});
  const redistributed=allocatePercentages(otherWeights,freeOthers,100-target-lockedSum);
  const result={...weights};
  freeOthers.forEach(otherKey=>{result[otherKey]=redistributed[otherKey];});
  result[key]=target;
  return result;
}
export function BuyerSetup({initial,initialStep=0,onSave,onCancel,busy,error,uncertain,onRetry,onReload}:{initial:BuyerProfile|null;initialStep?:0|1;onSave:(p:BuyerProfile)=>Promise<boolean>;onCancel?:()=>void;busy:boolean;error:string;uncertain:boolean;onRetry:()=>void;onReload:()=>void}){
  const editing=!!initial;
  const [step,setStep]=useState(initialStep),[draft,setDraft]=useState<BuyerProfile>(()=>structuredClone({...initial??defaultBuyerProfile,shipping_details:initial?.shipping_details??emptyShipping}));
  const [colorModalOpen,setColorModalOpen]=useState(false);
  const [locked,setLocked]=useState<ReadonlySet<WeightKey>>(()=>new Set());
  const toggleLock=(key:WeightKey)=>setLocked(l=>{const next=new Set(l);if(next.has(key))next.delete(key);else next.add(key);return next;});
  const [localError,setLocalError]=useState('');const root=useRef<HTMLElement>(null);
  const jump=(next:0|1)=>{
    setStep(next);
    // In full-screen onboarding the shell itself doesn't scroll — its .onboarding-page
    // ancestor does — while the settings-hub-nested shell scrolls itself. Reset both.
    const shell=root.current;
    if(shell){shell.scrollTop=0;shell.closest<HTMLElement>('.onboarding-page')?.scrollTo({top:0});}
  };
  const activeKeys=factors.map(([key])=>key).filter(key=>key!=='color'||draft.colors.length) as WeightKey[];
  const activeTotal=activeKeys.reduce((sum,key)=>sum+draft.weights[key],0);
  const percentages=allocatePercentages(draft.weights,activeKeys);
  const change=<K extends keyof BuyerProfile>(key:K,value:BuyerProfile[K])=>setDraft(d=>({...d,[key]:value}));
  const changeWeight=(key:WeightKey,value:number)=>{
    // With every other active factor locked there is nothing left to redistribute into or out of —
    // leave the weights untouched (a locked factor must never drift just because the free one moved)
    // and tell the buyer why the slider didn't respond, instead of silently reshuffling the totals.
    if(!activeKeys.some(otherKey=>otherKey!==key&&!locked.has(otherKey))){setLocalError('其他項目都已鎖定，沒有可以分配的空間；請先解除至少一個鎖定。');return;}
    setLocalError('');
    change('weights',rebalancePercentages(percentages,key,value,activeKeys,locked));
  };
  async function submit(){
    if(!draft.name.trim()){setLocalError('請先填寫名稱。');jump(0);return;}
    if(/sk-[A-Za-z0-9_-]{16,}|(?:\d[ -]?){13,19}/.test(draft.name+' '+draft.shipping_address)){setLocalError('請勿填寫 API key、信用卡號或金融帳號。');jump(0);return;}
    const shipping=draft.shipping_details;
    if(!draft.shipping_address.trim()||!shipping||!validShippingRegion({...shipping,line_one:draft.shipping_address})||!/^\S+@\S+\.\S+$/.test(shipping.email)||!/^\d{3}(\d{2,3})?$/.test(shipping.postal_code)){setLocalError('請填妥收件電子郵件、縣市、區域、郵遞區號與街道地址。');jump(0);return;}
    setLocalError('');
    const persist=()=>onSave({...draft,name:draft.name.trim(),shipping_address:draft.shipping_address.trim(),weights:percentages});
    if(step===0){
      // Editing from the settings hub always shows just one section: save it directly instead of
      // advancing into the wizard's next step, which only makes sense during first-time onboarding.
      if(editing){await persist();return;}
      jump(1);return;
    }
    if(!activeTotal){setLocalError('至少提高一項有效偏好的重要程度。');return;}
    await persist();
  }
  const stepLabel=step===0?'基本資料':'購物偏好';
  return <section ref={root} className="onboarding-shell" data-step={step} aria-labelledby="setup-title">
    <div className="onboarding-top">
      <span className="onboarding-brand"><TurnDealMark size={26}/>TurnDeal</span>
      {onCancel&&<button className="text-button" disabled={busy||uncertain} onClick={onCancel}>關閉</button>}
    </div>
    {!editing&&<div className="onboarding-progress" role="group" aria-label={`設定步驟 ${step+1}／2 · ${stepLabel}`}>
      <div className="onboarding-progress-track"><span style={{width:step===0?'50%':'100%'}}/></div>
      <div className="onboarding-progress-labels">
        <span data-active={step===0} data-done={step>0}>{step>0?<Check size={12}/>:<UserRound size={12}/>}基本資料</span>
        <span data-active={step===1}><SlidersHorizontal size={12}/>購物偏好</span>
      </div>
    </div>}
    <div className="onboarding-heading"><h1 id="setup-title">{step===0?(editing?'編輯基本資料':'先認識一下你'):(editing?'調整購物偏好':'好選擇，由你定義')}</h1><p>{step===0?(editing?'更新你的收件與付款資訊。':'設定你的購物資料，接著選擇在意的事。'):(editing?'調整這次比價會用到的重要程度與顏色偏好。':'調整重要程度，讓每一次推薦更合拍。')}</p></div>
    <form onSubmit={e=>{e.preventDefault();void submit();}}>
      <fieldset disabled={busy||uncertain} className="onboarding-fields">
        {step===0?<>
          <label className="onboarding-field"><span><UserRound size={15}/> 名稱（收件人） <small>必填</small></span><input autoComplete="off" maxLength={60} placeholder="你的稱呼" value={draft.name} onChange={e=>change('name',e.target.value)}/></label>
          <label className="onboarding-field"><span>電子郵件 <small>必填</small></span><input aria-label="電子郵件" type="email" autoComplete="off" maxLength={100} value={draft.shipping_details?.email??''} onChange={e=>change('shipping_details',{...draft.shipping_details??emptyShipping,email:e.target.value})}/></label>
          <ShippingAddressFields value={{...draft.shipping_details??emptyShipping,line_one:draft.shipping_address}} onChange={value=>setDraft(d=>({...d,shipping_address:value.line_one,shipping_details:{...d.shipping_details??emptyShipping,city:value.city,state:value.state,postal_code:value.postal_code}}))}/>
          <label className="onboarding-field"><span><CreditCard size={15}/> 偏好付款方式</span><select value={draft.payment_method} onChange={e=>change('payment_method',e.target.value as BuyerProfile['payment_method'])}><option value="card">信用卡</option><option value="mobile">行動支付</option><option value="cash_on_delivery">貨到付款</option></select></label>
          <p className="onboarding-note"><ShieldCheck size={14}/>Demo 請使用虛構資料。不收卡號或安全碼，基本資料不會送給 AI，也不會自動付款。</p>
        </>:<>
          <div className="preference-summary"><span>你的偏好配比</span><div className="preference-summary-bar" aria-hidden="true">{factors.map(([key])=><i key={key} data-factor={key} style={{flex:percentages[key]}}/>)}</div><div className="preference-summary-legend" aria-hidden="true">{factors.map(([key,label])=>percentages[key]>0&&<span key={key} data-factor={key}><i/><em>{label}</em><b>{percentages[key]}%</b></span>)}</div><p>調整任一項時會同步分配其他項目，總和永遠是 100%。</p></div>
          <div className="preference-grid">
            {factors.map(([key,label,hint])=>{const inactive=key==='color'&&!draft.colors.length;const isLocked=locked.has(key);return <div className="preference-card" key={key} data-inactive={inactive} data-locked={isLocked}>
              <div className="preference-card-head"><span>{label}<small>{inactive?'請先在下方選擇喜歡的顏色':hint}</small></span><strong>{inactive?'—':`${percentages[key]}%`}</strong>
                <button type="button" className="preference-lock" disabled={inactive} aria-pressed={isLocked} aria-label={isLocked?`解除鎖定${label}`:`鎖定${label}的百分比，調整其他項目時不受影響`} onClick={()=>toggleLock(key)}>{isLocked?<Lock size={14}/>:<Unlock size={14}/>}</button>
              </div>
              <input className="preference-slider" style={{'--fill':`${percentages[key]}%`} as CSSProperties} type="range" min={0} max={100} step={1} value={percentages[key]} disabled={inactive||isLocked} aria-label={label} aria-valuetext={inactive?'請先選擇顏色':isLocked?`${percentages[key]}%，已鎖定`:`${percentages[key]}%`} onChange={e=>changeWeight(key,Number(e.target.value))}/>
              <div className="preference-scale"><span>不在意</span><span>{isLocked?'已鎖定':'很重要'}</span></div>
            </div>;})}
          </div>
          <div className="onboarding-color">
            <p>喜歡的顏色 <small>最多 5 種，依你排序的優先次序</small></p>
            <button type="button" className="color-picker-trigger" onClick={()=>setColorModalOpen(true)}>
              {draft.colors.length?<span className="color-picker-preview">{draft.colors.map(value=>{const hex=colors.find(c=>c[0]===value)?.[2];return <i key={value} style={{background:hex}}/>;})}</span>:<span className="color-picker-preview color-picker-preview-empty"/>}
              <span className="color-picker-text">{draft.colors.length?`已選 ${draft.colors.length} 種顏色，依序排好`:'點此挑選喜歡的顏色'}</span>
              <ChevronRight size={18}/>
            </button>
          </div>
          <p className="onboarding-footnote">未選顏色時，顏色權重不計分。最高預算、交期與本次明確要求仍優先。</p>
        </>}
      </fieldset>
      {error&&<div className="onboarding-error" role="alert">{error}<button type="button" disabled={busy} onClick={uncertain?onRetry:onReload}>{uncertain?'核對原提交':'重新載入'}</button></div>}
      <div className="onboarding-actions">{step===1&&!editing&&<button className="onboarding-back" type="button" disabled={busy||uncertain} onClick={()=>jump(0)} aria-label="返回基本資料"><ArrowLeft size={19}/></button>}<button className="onboarding-primary" disabled={busy||uncertain||step===0&&!draft.name.trim()} type="submit"><span className="onboarding-primary-shine" aria-hidden="true"/><span>{busy?'儲存中…':editing?'儲存':step===0?'下一步':'儲存並開始'}</span>{!editing&&<ArrowRight size={18}/>}</button></div>
      <p className="onboarding-storage">儲存於本機 SQLite · 非正式付款資料庫</p>
    </form>
    <ColorPreferenceModal open={colorModalOpen} options={colors} selected={draft.colors} onChange={value=>change('colors',value as BuyerProfile['colors'])} onClose={()=>setColorModalOpen(false)}/>
    <Toast message={localError} onDismiss={()=>setLocalError('')}/>
  </section>;
}
