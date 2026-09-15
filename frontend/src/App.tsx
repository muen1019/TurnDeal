import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,ArrowRight,Check,MessageCircle,ShieldCheck} from 'lucide-react';
import {AppShell,ChatPanel,AgentDefinitionEditor,type ChatMessage,type ChatStatus,type DefinitionTab} from './components/chat';
import {OfferDeck,FeedbackForm} from './components/offers';
import {useWorkspace} from './state/useWorkspace';
import {useAgentProgress} from './state/useAgentProgress';
import {currentRank,processing,type View} from './state/model';
import type {Offer,RequestSnapshot} from './contract.generated';
import './styles/chat.css';
import './styles/offers.css';
import {CheckoutProductHeader} from './components/offers/CheckoutProductHeader';
import {MobileJourney} from './components/chat/MobileJourney';
import {ClarificationPanel} from './components/chat/ClarificationPanel';
import {BuyerSetup} from './components/chat/BuyerSetup';
import {SettingsHub} from './components/chat/SettingsHub';
import {useBuyerProfile} from './state/useBuyerProfile';
import {ModelPicker,initialModel} from './components/chat/ModelPicker';
import {PurchasePanel} from './components/offers/PurchasePanel';
import {ImprovementPanel} from './components/chat/ImprovementPanel';
import {WelcomeScreen} from './components/chat/WelcomeScreen';
import {OnboardingTour} from './components/chat/OnboardingTour';
import {TurnDealMark} from './components/chat/TurnDealMark';

const stateCopy:Record<string,string>={formatting:'正在整理你的需求與購買限制。',orchestrating:'正在尋找符合需求的賣家。',negotiating:'各賣家正在獨立議價，完成後會一起比較。',evaluating:'正在根據預算、交期與偏好整理推薦。',needs_clarification:'需要更明確的需求才能繼續。',needs_confirmation:'有配件需要額外授權，尚未開放採用。',no_match:'目前沒有符合所有條件的方案。',failed:'這次比價未完成，請查看原因後重新開始。',accepted:'本輪已採用一個方案，決策已保存。',rejected:'你的回饋已保存。可開始新對話，繼續尋找合適的優惠。'};

export default function App(){
 const [model,setModel]=useState(initialModel);
 const s=useWorkspace({model,fullImprover:true});const c=s.active;const snapshot=c.snapshot;const d=s.workspace.definitions;
 const buyer=useBuyerProfile();const [settingsScreen,setSettingsScreen]=useState<'hub'|'profile'|'preferences'|'advanced'>('hub');
 const agentProgress=useAgentProgress(c.requestId,snapshot?.status);
 const [tab,setTab]=useState<DefinitionTab>('intent');
 const [intro,setIntro]=useState(()=>!new URLSearchParams(location.search).has('request_id'));const leavingIntro=useRef(false);
 const [showTour,setShowTour]=useState(false);
 const dismissTour=()=>{setShowTour(false);try{localStorage.setItem('turndeal.tour.seen','1');}catch{}};
 const startTour=()=>{try{if(localStorage.getItem('turndeal.tour.seen'))return;}catch{}setShowTour(true);};
 // Lives above `content` on purpose: submitting a request can swap MobileJourney straight out
 // for the clarification screen within a render or two, which would unmount a local "launching"
 // flag before it ever got to play. Keeping it here lets the takeover survive that swap.
 const [mobileLaunching,setMobileLaunching]=useState(false);
 const launchMobile=()=>{setMobileLaunching(true);window.setTimeout(()=>setMobileLaunching(false),2600);};
 const reduceMotion=useReducedMotion();
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 767px)').matches);
 useEffect(()=>{const query=window.matchMedia('(max-width: 767px)');const change=()=>setMobile(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 const scrolls=useRef<Record<string,number>>({});const focusText=useRef('');const priorView=useRef<string>(s.view);
 const mainRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const viewport=window.visualViewport;const resize=()=>document.documentElement.style.setProperty('--app-height',`${viewport?.height??window.innerHeight}px`);resize();viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);document.documentElement.style.removeProperty('--app-height');};},[]);
 const go=(view:View,id?:string|null,offerId?:string|null)=>{const el=mainRef.current?.querySelector('.workspace-content,.chat-thread');if(el)scrolls.current[s.view]=el.scrollTop;if(s.view==='offers')focusText.current=(document.activeElement?.textContent??'').trim();s.navigate(view,id,offerId);};
 useEffect(()=>{const focusScope=s.view+(snapshot&&['accepted','rejected'].includes(snapshot.status)?':'+snapshot.status:'');if(priorView.current===focusScope)return;priorView.current=focusScope;const frame=requestAnimationFrame(()=>{const root=mainRef.current;if(!root)return;let target:HTMLElement|null=null;if(s.view==='offers'&&focusText.current)target=Array.from(root.querySelectorAll<HTMLElement>('button')).find(b=>b.textContent?.trim()===focusText.current)??null;target??=root.querySelector<HTMLElement>('.chat-main-slot h1,.chat-main-slot h2,.chat-main-slot textarea');if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}const sc=root.querySelector('.workspace-content,.chat-thread');if(sc)sc.scrollTop=scrolls.current[s.view]??0;});return()=>cancelAnimationFrame(frame);},[s.view,snapshot?.status]);
 // 開始使用: new buyers land on setup (freshHome+no profile already renders it); returning buyers with a saved profile go straight into chat.
 useEffect(()=>{if(intro||!leavingIntro.current||buyer.loading)return;leavingIntro.current=false;},[intro,buyer.loading]);
 const patch=(p:Parameters<typeof s.patch>[1])=>s.patch(c.id,p);
 const definitionEditor=<AgentDefinitionEditor intent={d.intent} preference={d.preference} savedIntent={d.savedIntent} savedPreference={d.savedPreference} activeTab={tab} onTabChange={setTab} onIntentChange={intent=>s.update(w=>({...w,definitions:{...w.definitions,intent}}))} onPreferenceChange={preference=>s.update(w=>({...w,definitions:{...w.definitions,preference}}))} onSave={s.saveDefinitions} onCancel={()=>s.update(w=>({...w,definitions:{...w.definitions,intent:w.definitions.savedIntent,preference:w.definitions.savedPreference}}))} saving={s.saving} error={s.error}/>;
 const ranking=currentRank(c);const offer=snapshot?.offers.find(o=>o.offer_id===ranking?.offer_id)??null;
 const pending=!!s.pending||s.busy||s.unknown;
 const expired=(o:Offer)=>Date.parse(o.expires_at)<=s.now||!!c.unavailableIds?.includes(o.offer_id);
 const verified=s.verified===c.requestId;
 const canFeedback=!!snapshot&&['awaiting_user','no_match','needs_confirmation'].includes(snapshot.status);
 const messages:ChatMessage[]=[];
 if(import.meta.env.VITE_OFFERMESH_RUNTIME_MODE)messages.push({id:'runtime-mode',role:'system',content:import.meta.env.VITE_OFFERMESH_RUNTIME_MODE==='live'?'完整服務已接線 · 模型失敗時會使用安全規則 · 20 家虛擬賣家候選，無實際付款。':'完整離線流程 · 規則 Formatter → 搜尋 → 五家策略議價 → 獨立排序 · 未呼叫 LLM，無實際付款。'});
 if(c.message)messages.push({id:'user-'+c.id,role:'user',content:c.message});
 if(c.historyMissing)messages.push({id:'missing-history',role:'system',content:'本分頁沒有原對話紀錄。以下顯示已發布的需求與結果。'});
 if(snapshot?.intent)messages.push({id:'intent-'+snapshot.request_id,role:'assistant',content:'我會依照以下條件，比較符合需求的優惠。',chips:['無線滑鼠','NT$'+snapshot.intent.max_total_twd.toLocaleString('zh-TW')+' 以內',snapshot.intent.delivery_days_max+' 天內送達']});
 if(snapshot&&!processing(snapshot.status)){const text=snapshot.status==='awaiting_user'?`示範資料：${snapshot.seller_agents.length} 家虛擬賣家，找到 ${snapshot.ranked_offers.length} 組可選方案。`:stateCopy[snapshot.status]??'正在讀取本輪結果。';messages.push({id:'result-'+snapshot.request_id,role:'assistant',content:text+(snapshot.error?' '+snapshot.error.message:'')});}
 const creatingHere=s.pending?.kind==='create'&&s.pending.conversationId===c.id;
 const progressStatus=snapshot&&!processing(snapshot.status)?snapshot.status:agentProgress.stage??snapshot?.status??(creatingHere?'submitting':undefined);
 if(creatingHere&&s.unknown)messages.push({id:'sending',role:'assistant',content:'正在確認送出結果，請勿重複建立需求。'});
 const ready=snapshot?.status==='awaiting_user'&&verified&&snapshot.ranked_offers.some(r=>snapshot.offers.some(o=>o.offer_id===r.offer_id&&!expired(o)));
 const chatStatus:ChatStatus=s.pending?.kind==='create'?'sending':processing(snapshot?.status)?'processing':ready?'ready':snapshot&&snapshot.status!=='awaiting_user'?'failed':c.draft?'draft':'empty';
 const notice=s.error||s.unknown?<div className="global-notice" role="alert"><span>{s.unknown?'確認結果中。保留原提交，暫時鎖定操作。 ':''}{s.error}</span><button className="text-button" disabled={s.busy} onClick={s.retry}>{s.pending?'核對原提交':'重新載入'}</button></div>:null;
 const back=<button className="text-button" onClick={()=>go('chat')}><ArrowLeft size={17}/> 返回對話</button>;
 let content:ReactNode;
 if(s.view==='chat'&&!['accepted','rejected'].includes(snapshot?.status??''))content=<><ChatPanel messages={messages} status={chatStatus} progressStatus={progressStatus} progressError={agentProgress.error} teaser={ready?{requestId:snapshot.request_id,title:'查看優惠組合',offerCount:snapshot.ranked_offers.length,lowestTotalTwd:Math.min(...snapshot.ranked_offers.map(r=>snapshot.offers.find(o=>o.offer_id===r.offer_id)!.total_price_twd)),imageUrl:undefined}:undefined} draft={c.draft} onDraft={draft=>patch({draft})} onSend={s.send} onOpenOffers={id=>go('offers',id)} sending={pending||s.saving||processing(snapshot?.status)} error={s.error} unsavedDefinitions={d.intent!==d.savedIntent||d.preference!==d.savedPreference} onEditDefinitions={()=>{setSettingsScreen('advanced');go('settings');}}/>{definitionEditor}{(pending||snapshot&&snapshot.status!=='awaiting_user'&&!processing(snapshot.status))&&<div className="chat-context-actions">{s.unknown&&<button className="button secondary" disabled={s.busy} onClick={s.retry}>核對原提交</button>}{snapshot&&<button className="text-button" onClick={()=>go('offers')}>查看本輪狀態 <ArrowRight size={16}/></button>}</div>}</>;
 else if(s.view==='settings'&&settingsScreen==='advanced')content=<div className="workspace-content editor-view content-enter">{back}{definitionEditor}</div>;
 else if(s.view==='settings'&&settingsScreen==='hub'&&buyer.profile)content=<SettingsHub onSelect={screen=>setSettingsScreen(screen)} onClose={()=>go('chat')}/>;
 else if(!snapshot)content=<div className="workspace-content">{back}{notice}<Status title={c.requestId?'正在載入這次比價':'還沒有購物需求'} text={c.requestId?'正在讀取已發布的結果，稍候即可繼續。':'先告訴 Buyer Agent 你的預算與用途。'} action={<button className="button primary" onClick={()=>go('chat')}>回到購物助理</button>}/></div>;
 else if(s.view==='feedback'&&canFeedback)content=<div className="workspace-content content-enter">{back}{notice}<FeedbackForm value={c.feedback} pending={pending||!verified} onChange={feedback=>patch({feedback})} onSubmit={s.reject} onCancel={s.review} fieldMessage={s.error} submitLabel="送出回饋"/>{c.skipped.length>0&&<button className="text-button new-round-link" disabled={pending} onClick={s.undo}>撤回最後一次略過</button>}</div>;
 else if(snapshot.status==='accepted'){
   const selected=snapshot.offers.find(o=>o.offer_id===snapshot.selected_offer_id);
   content=<div className="workspace-content content-enter">{notice}{selected?<PurchasePanel key={snapshot.request_id} requestId={snapshot.request_id} offerId={selected.offer_id} profile={buyer.profile} header={<CheckoutProductHeader snapshot={snapshot} offer={selected}/>}/>:<Status title="方案資料不完整" text="無法確認被採用的方案，請重新載入。"/>}<button className="text-button new-round-link" onClick={s.newConversation}>開始新的購物需求</button></div>;
 }else if(snapshot.status==='rejected'&&snapshot.decision?.action==='reject')content=<div className="workspace-content content-enter">{back}{notice}<ImprovementPanel key={snapshot.request_id} requestId={snapshot.request_id} onNext={s.openFollowup} onNew={s.newConversation}/></div>;
 else if(snapshot.status!=='awaiting_user')content=<div className="workspace-content content-enter">{back}{notice}<Status title={processing(snapshot.status)?'Buyer Agent 正在比價':snapshot.status==='no_match'?'沒有符合條件的方案':'這次需求需要處理'} text={(stateCopy[snapshot.status]??'請回到對話查看進度。')+(snapshot.error?' '+snapshot.error.message:'')} action={canFeedback?<button className="button primary" onClick={()=>go('feedback')}>補充需求</button>:<button className="button secondary" onClick={s.newConversation}>新對話</button>}/></div>;
 else content=<div className="workspace-content content-enter" data-testid="offers-workspace">{notice}<div className="workspace-topline">{back}</div><h1 className="workspace-title">為你找到的優惠</h1><p className="workspace-subtitle">無線滑鼠 · 預算 NT${snapshot.intent?.max_total_twd.toLocaleString('zh-TW')} 內 · 獨立比較，依需求推薦</p><OfferDeck snapshot={snapshot} offer={offer} ranking={ranking??null} totalOffers={snapshot.ranked_offers.length} canUndo={c.skipped.length>0} pending={pending||!verified} expired={!!offer&&expired(offer)} disabledReason={s.unknown?'確認結果中':!verified?'正在核對方案':undefined} onAccept={id=>s.accept(id)} onSkip={s.skip} onUndo={s.undo}/>{!offer&&<div className="status-panel"><h2>已瀏覽所有方案</h2><button className="button primary" onClick={()=>go('feedback')}>調整需求</button><button className="text-button" onClick={s.review}>重新瀏覽</button></div>}<div className="offers-footer"><button className="text-button" disabled={pending} onClick={()=>go('feedback')}>都不合適？補充需求</button><span className="app-demo"><ShieldCheck size={14}/> 示範優惠 · 無實際付款</span></div>{snapshot.sponsored_placement&&<Sponsored snapshot={snapshot}/>}</div>;
 if((mobile||!c.requestId&&!pending)&&s.view==='chat'&&!['accepted','rejected'].includes(snapshot?.status??'')) content=<MobileJourney key={c.id} draft={c.draft} onDraft={draft=>patch({draft})} onSend={()=>{launchMobile();s.send();}} status={creatingHere?'submitting':progressStatus} ready={!!ready} requestId={c.requestId} busy={pending||s.saving} retrying={s.busy} error={s.error||agentProgress.error||snapshot?.error?.message} onReady={()=>go('offers',c.requestId)} onNew={s.newConversation} onRetry={s.retry} unsaved={d.intent!==d.savedIntent||d.preference!==d.savedPreference} message={c.message} buyerName={buyer.profile?.name}/>;
 if(s.view==='chat'&&snapshot?.status==='needs_clarification'&&snapshot.formatter?.questions.length){
   const answers=c.clarificationDraft?.requestId===snapshot.request_id?c.clarificationDraft.answers:{};
   content=<div className="clarification-shell">{notice}<ClarificationPanel formatter={snapshot.formatter} answers={answers} onAnswer={(id,value)=>patch({clarificationDraft:{requestId:snapshot.request_id,answers:{...answers,[id]:value}}})} onSubmit={s.answerClarification} busy={pending||!verified} message={c.message||snapshot.documents.intent_md}/></div>;
 }
 const freshHome=s.view==='chat'&&!pending&&(!c.requestId||!new URLSearchParams(location.search).has('request_id'));
 const onboardingLoading=freshHome&&buyer.loading;
 if(onboardingLoading)content=<div className="onboarding-loading" role="status">正在準備你的購物空間…</div>;
 else if((freshHome&&!buyer.profile)||(s.view==='settings'&&(settingsScreen==='profile'||settingsScreen==='preferences')))content=<BuyerSetup key={buyer.profile?'saved':'new'} initial={buyer.profile} initialStep={settingsScreen==='preferences'?1:0} busy={buyer.busy} error={buyer.error} uncertain={buyer.uncertain} onSave={async value=>{const firstTime=!buyer.profile;const saved=await buyer.save(value);if(saved){if(firstTime){s.newConversation();startTour();}else go('chat');}return saved;}} onCancel={buyer.profile?()=>setSettingsScreen('hub'):undefined} onRetry={()=>{void buyer.retry().then(ok=>{if(ok){if(!buyer.profile)s.newConversation();else go('chat');}});}} onReload={()=>void buyer.load()}/>;
 // Nothing about chat/history/settings renders until setup is done: onboarding gets its own full-screen phase, no AppShell chrome.
 const onboarding=onboardingLoading||(freshHome&&!buyer.profile);
 const phase=intro?'welcome':onboarding?'onboarding':'app';
 const phaseNode=intro?<WelcomeScreen onStart={()=>{leavingIntro.current=true;setIntro(false);}}/>:onboarding?<div className="onboarding-page">{content}</div>:<div ref={mainRef} data-keyboard={s.source==='keyboard'}><AppShell activeView={s.view==='settings'?'definitions':s.view==='history'?'offers':s.view} recentRequests={s.workspace.conversations.map(item=>({id:item.id,title:item.title,isActive:item.id===c.id,subtitle:item.snapshot?stateCopy[item.snapshot.status]??'等待選擇':'尚未送出'}))} onChat={()=>go('chat')} onSettings={()=>{setSettingsScreen('hub');go('settings');}} onNewConversation={s.newConversation} onSelectConversation={s.selectConversation} onDeleteConversation={s.deleteConversation} onClearHistory={s.clearHistory} modelPicker={<ModelPicker value={model} onChange={value=>{setModel(value);try{sessionStorage.setItem("offermesh.model",value);}catch{}}}/>} historyLocked={pending||s.workspace.conversations.some(item=>processing(item.snapshot?.status))}>{content}</AppShell></div>;
 return <>
   <AnimatePresence mode="wait">
     <motion.div
       key={phase}
       className="app-phase"
       initial={reduceMotion?false:{opacity:0,scale:.97,filter:'blur(4px)'}}
       animate={{opacity:1,scale:1,filter:'blur(0px)'}}
       exit={reduceMotion?{opacity:0}:{opacity:0,scale:1.02,filter:'blur(6px)'}}
       transition={reduceMotion?{duration:0}:{duration:.46,ease:[.22,1,.36,1]}}
     >
       {phaseNode}
     </motion.div>
   </AnimatePresence>
   {showTour&&<OnboardingTour onDone={dismissTour}/>}
   {mobileLaunching&&<div className="mobile-launch-transition" aria-hidden="true">
     <div className="mobile-launch-orb"><div className="mobile-launch-orb-spin"><span><TurnDealMark size={40}/></span></div></div>
   </div>}
 </>;
}
function Status({title,text,action}:{title:string;text:string;action?:ReactNode}){return <section className="status-panel"><span className="status-icon"><MessageCircle size={26}/></span><h2>{title}</h2><p>{text}</p><div className="actions">{action}</div><p className="app-demo">Demo · 使用可重現的虛擬市場，不會產生真實付款</p></section>;}
function Sponsored({snapshot}:{snapshot:RequestSnapshot}){const placement=snapshot.sponsored_placement!;const seller=snapshot.seller_agents.find(s=>s.seller_id===placement.seller_id);return <aside className="sponsored-placement" aria-label="Sponsored"><span>Sponsored</span><p>{seller?.name??'贊助商家'} <small>展示資訊，與推薦排名分開</small></p><Check size={14} aria-hidden="true"/></aside>;}
