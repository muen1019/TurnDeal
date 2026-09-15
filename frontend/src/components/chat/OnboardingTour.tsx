import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import '../../styles/tour.css';

const STEPS=[
  {selector:'[data-tour="model-picker"]',title:'選擇 AI 模型',body:'在這裡切換不同的 AI 模型，找到最適合你的比價與議價風格。'},
  {selector:'[data-tour="header-actions"]',title:'設定與歷史紀錄',body:'調整個人化的購物偏好，或回顧過去的購物需求與結果。'},
  {selector:'[data-tour="chat-input"]',title:'說出你的需求',body:'輸入想買的商品、預算或任何在意的條件，Buyer Agent 會依此開始比價。'},
  {selector:'[data-tour="send-button"]',title:'送出開始比價',body:'準備好後按下送出，AI 就會開始幫你尋找、議價、比較最適合的方案。'},
] as const;

interface Rect{top:number;left:number;width:number;height:number}

function measure(selector:string):Rect|null{
  const el=document.querySelector<HTMLElement>(selector);
  if(!el)return null;
  const r=el.getBoundingClientRect();
  return {top:r.top,left:r.left,width:r.width,height:r.height};
}

export function OnboardingTour({onDone}:{onDone:()=>void}){
  const [step,setStep]=useState(0);
  const [rect,setRect]=useState<Rect|null>(null);
  const overlayRef=useRef<HTMLDivElement>(null);
  const focusedOnce=useRef(false);

  useEffect(()=>{
    // The overlay only mounts into the DOM once `rect` is known; focus it the first time that happens.
    if(rect&&!focusedOnce.current){focusedOnce.current=true;overlayRef.current?.focus();}
  },[rect]);

  useEffect(()=>{
    const update=()=>setRect(measure(STEPS[step].selector));
    update();
    // The tour can start before its target exists yet (the app-phase transition is still
    // exiting/entering, or the target's own entrance transform hasn't settled) — keep polling
    // instead of measuring once, so the spotlight reliably appears and tracks into place.
    const poll=window.setInterval(update,150);
    window.addEventListener('resize',update);
    return()=>{window.clearInterval(poll);window.removeEventListener('resize',update);};
  },[step]);

  const advance=()=>{
    if(step<STEPS.length-1)setStep(s=>s+1);
    else onDone();
  };

  if(!rect)return null;
  const pad=8;
  const spotW=rect.width+pad*2,spotH=rect.height+pad*2;
  const spotLeft=rect.left-pad,spotTop=rect.top-pad;
  const spotRadius=Math.min(spotH/2,26);
  const cx=spotLeft+spotW/2;
  // Whichever side of the spotlight has more room wins, so the card never gets squeezed against an edge.
  const placeBelow=(window.innerHeight-(spotTop+spotH))>=spotTop;
  const cardTop=placeBelow?spotTop+spotH+18:undefined;
  const cardBottom=placeBelow?undefined:window.innerHeight-spotTop+18;
  const cardLeft=Math.min(Math.max(cx-150,16),window.innerWidth-316);
  const {title,body}=STEPS[step];

  return createPortal(
    <div
      ref={overlayRef}
      className="tour-overlay"
      onClick={advance}
      role="button"
      tabIndex={0}
      aria-label="繼續導覽"
      onKeyDown={e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();advance();}
        if(e.key==='Escape'){e.preventDefault();onDone();}
      }}
    >
      <div
        className="tour-spot"
        style={{left:spotLeft,top:spotTop,width:spotW,height:spotH,borderRadius:spotRadius}}
      />
      <div
        key={step}
        className="tour-card tour-card-enter"
        style={{left:cardLeft,top:cardTop,bottom:cardBottom,width:300}}
        onClick={e=>e.stopPropagation()}
      >
        <div className="tour-card-head">
          <span className="tour-dots">{STEPS.map((_,i)=><i key={i} data-active={i===step}/>)}</span>
          <button type="button" className="tour-skip" onClick={onDone}>略過導覽</button>
        </div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="tour-card-foot">
          <span>{step+1} / {STEPS.length}</span>
          <button type="button" className="tour-next" onClick={advance}>{step<STEPS.length-1?'下一步':'開始使用'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
