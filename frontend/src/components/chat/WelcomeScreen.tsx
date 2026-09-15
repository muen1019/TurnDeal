import {useState} from 'react';
import {ArrowRight, Loader2} from 'lucide-react';
import {TurnDealMark} from './TurnDealMark';
import '../../styles/welcome.css';

function GoogleGlyph(){
  return <svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36.1 44 30.6 44 24c0-1.3-.1-2.6-.4-3.9z"/>
  </svg>;
}
export function WelcomeScreen({onStart}:{onStart:()=>void}){
  const [launching,setLaunching]=useState<'google'|'guest'|null>(null);
  // Every entry point shares one polished takeover moment before handing off to onStart,
  // not just the OAuth button — the guest path used to skip straight through with nothing to see.
  const launch=(mode:'google'|'guest')=>{
    if(launching)return;
    setLaunching(mode);
    window.setTimeout(onStart,680);
  };
  const busy=!!launching;
  return <div className="welcome-screen">
    <div className="welcome-backdrop" aria-hidden="true"><i/><i/><i/></div>
    <main className="welcome-main" aria-labelledby="welcome-title">
      <section className="welcome-hero">
        <div className="welcome-logo">
          <span className="welcome-logo-halo" aria-hidden="true"/>
          <TurnDealMark size={96}/>
        </div>
        <h1 id="welcome-title" className="welcome-wordmark"><span className="welcome-wordmark-primary">Turn</span><span className="welcome-wordmark-accent">Deal</span></h1>
        <p className="welcome-slogan"><span className="welcome-slogan-primary">Turn Your Need</span> <span className="welcome-slogan-accent">into a Deal</span></p>
        <p className="welcome-lede">說出你想買的東西，AI 買家代理幫你找賣家、議價、比較，挑出最適合你的方案。</p>
        <div className="welcome-auth" role="group" aria-label="選擇登入方式">
          <button className={`welcome-auth-btn welcome-auth-google${launching==='google'?' is-connecting':''}`} type="button" disabled={busy} onClick={()=>launch('google')}>
            {launching==='google'?<Loader2 className="welcome-auth-spin" size={18} aria-hidden="true"/>:<GoogleGlyph/>}
            <span>{launching==='google'?'連接中…':'使用 Google 帳號繼續'}</span>
          </button>
        </div>
        <div className="welcome-auth-divider" aria-hidden="true"><span/><em>或</em><span/></div>
        <button className="welcome-guest" type="button" disabled={busy} onClick={()=>launch('guest')}>以訪客身份繼續<ArrowRight size={15} aria-hidden="true"/></button>
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
    {launching&&<div className="welcome-transition" aria-hidden="true">
      <div className="welcome-transition-glow"/>
      <div className="welcome-transition-mark"><i/><i/><i/><TurnDealMark size={72}/></div>
      <p className="welcome-transition-text">準備你的購物空間…</p>
    </div>}
  </div>;
}
