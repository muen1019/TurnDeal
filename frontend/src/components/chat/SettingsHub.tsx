import {ChevronRight,FileEdit,SlidersHorizontal,UserRound} from 'lucide-react';
import {TurnDealMark} from './TurnDealMark';

const items=[
  ['profile','基本資料與收件',UserRound,'姓名、聯絡方式、收件地址與付款偏好'],
  ['preferences','購物偏好',SlidersHorizontal,'價格、到貨速度、賣家評價與喜歡的顏色'],
  ['advanced','進階文字偏好設定',FileEdit,'直接編輯本輪需求與長期偏好文件'],
] as const;

export function SettingsHub({onSelect,onClose}:{onSelect:(screen:'profile'|'preferences'|'advanced')=>void;onClose:()=>void}){
  return <section className="onboarding-shell settings-hub" aria-labelledby="settings-hub-title">
    <div className="onboarding-top">
      <span className="onboarding-brand"><TurnDealMark size={26}/>TurnDeal</span>
      <button className="text-button" onClick={onClose}>關閉</button>
    </div>
    <div className="onboarding-heading"><h1 id="settings-hub-title">帳號設定</h1><p>管理你的收件資料，或調整每次比價會用到的偏好。</p></div>
    <div className="settings-hub-list">
      {items.map(([key,label,Icon,hint])=><button key={key} type="button" className="settings-hub-item" onClick={()=>onSelect(key)}>
        <span className="settings-hub-icon"><Icon size={19}/></span>
        <span className="settings-hub-text"><strong>{label}</strong><small>{hint}</small></span>
        <ChevronRight size={18}/>
      </button>)}
    </div>
  </section>;
}
