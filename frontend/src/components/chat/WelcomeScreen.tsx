import {ArrowRight,ShieldCheck} from 'lucide-react';
import '../../styles/welcome.css';

export function TurnDealMark({size=64}:{size?:number}){
  return <svg className="turndeal-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="turndeal-mark-fill" x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#5b9dff"/><stop offset="1" stopColor="#1745b5"/></linearGradient>
      <radialGradient id="turndeal-mark-shine" cx="30%" cy="20%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity=".32"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="url(#turndeal-mark-fill)"/>
    <rect width="64" height="64" rx="16" fill="url(#turndeal-mark-shine)"/>
    {/* Exchange glyph: your need (top) turns into a deal (bottom). */}
    <path d="M16 25h26m-7-6 7 6-7 6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M48 39H22m7 6-7-6 7-6" fill="none" stroke="#cfe3ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export function WelcomeScreen({onStart}:{onStart:()=>void}){
  return <div className="welcome-screen">
    <div className="welcome-backdrop" aria-hidden="true"><i/><i/><i/></div>
    <main className="welcome-main" aria-labelledby="welcome-title">
      <section className="welcome-hero">
        <div className="welcome-logo">
          <span className="welcome-logo-halo" aria-hidden="true"/>
          <TurnDealMark size={96}/>
        </div>
        <span className="welcome-badge"><span aria-hidden="true"/>AI Buyer Agent</span>
        <h1 id="welcome-title" className="welcome-wordmark">TurnDeal</h1>
        <p className="welcome-slogan">Turn Your Need <span>into a Deal</span></p>
        <p className="welcome-lede">說出你想買的東西，AI 買家代理幫你找賣家、議價、比較，挑出最適合你的方案。</p>
        <button className="welcome-start" type="button" onClick={onStart} autoFocus>開始使用<ArrowRight size={19} aria-hidden="true"/></button>
        <p className="welcome-note"><ShieldCheck size={14} aria-hidden="true"/>Demo 環境 · 模擬結帳，不會產生真實付款</p>
      </section>
      <div className="welcome-preview" aria-hidden="true">
        <div className="welcome-card welcome-card-need">
          <span className="welcome-card-label">你的需求</span>
          <p>想要一個無線滑鼠，預算 NT$1,000 內，一週內送到</p>
        </div>
        <div className="welcome-flow"><span/><span/><span/></div>
        <div className="welcome-card welcome-card-deal">
          <span className="welcome-card-label">為你談到的方案</span>
          <div className="welcome-deal-row"><strong>NT$ 890</strong><em>省 NT$110</em></div>
          <ul><li>3 天到貨</li><li>賣家評價 4.8</li><li>符合偏好顏色</li></ul>
        </div>
      </div>
    </main>
  </div>;
}
