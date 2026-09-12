import {
  MessageCircle,
  MousePointer2,
  PanelLeft,
  Plus,
  Settings,
  SlidersHorizontal,
  UserRound,
  Trash2,
  X,
} from "lucide-react";
import type { AppShellProps, AppShellView } from "./types";
import { useEffect, useRef, useState } from 'react';
import '../../styles/history.css';

const viewLabel: Record<AppShellView, string> = {
  chat: "AI 對話",
  offers: "優惠結果",
  definitions: "代理設定",
  details: "優惠詳情",
  feedback: "調整需求",
  settings: "設定",
};

export function AppShell({
  activeView,
  children,
  recentRequests,
  onChat,
  onSettings,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onClearHistory,
  modelPicker,
  historyLocked=false,
}: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 767px)').matches);
  const sidebar=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
  const close=()=>{setNavigationOpen(false);setDeleting(null);requestAnimationFrame(()=>toggle.current?.focus());};
  const choose=(action:()=>void)=>{close();action();};
  useEffect(()=>{const m=window.matchMedia('(max-width: 767px)');const change=()=>{setMobile(m.matches);if(!m.matches)setNavigationOpen(false);};m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);
  useEffect(()=>{
    if(!mobile||!navigationOpen)return;
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        const buttons=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')??[]).filter(x=>x.getClientRects().length);
        const first=buttons[0],last=buttons.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',trap);return()=>document.removeEventListener('keydown',trap);
  },[navigationOpen,mobile]);
  return (
    <div className="chat-app-shell" data-active-view={activeView} data-navigation-open={navigationOpen}>
      <header className="chat-shell-header" aria-label="TurnDeal workspace" inert={mobile&&navigationOpen}>
        <div className="chat-brand">
          <span className="chat-brand-mark" aria-hidden="true">
            <MousePointer2 size={18} />
          </span>
          <div className="brand-with-model"><span>TurnDeal</span>{modelPicker}</div>
        </div>
        <div className="chat-header-actions">
          <button ref={toggle} className="icon-button mobile-navigation-toggle" type="button" onClick={()=>setNavigationOpen(v=>!v)} aria-label="切換導覽" aria-controls="history-sidebar" aria-expanded={navigationOpen}><PanelLeft size={20}/></button>
          <button className="icon-button" type="button" onClick={onNewConversation} aria-label="開始新對話"><Plus size={20}/></button>
          <button
            className="icon-button"
            type="button"
            onClick={onSettings}
            aria-label="開啟設定"
          >
            <Settings size={20} aria-hidden="true" />
          </button>
          <span className="chat-avatar" aria-label="我的 Buyer Agent" role="img">
            <UserRound size={20} aria-hidden="true" />
          </span>
        </div>
      </header>

      {mobile&&navigationOpen&&<div className="history-backdrop" onClick={close} aria-hidden="true"/>}
      <aside ref={sidebar} id="history-sidebar" className="chat-sidebar" aria-label="Buyer Agent navigation" role={mobile?'dialog':undefined} aria-modal={mobile&&navigationOpen?true:undefined} inert={mobile&&!navigationOpen}>
        <div className="history-drawer-heading"><div><span>YOUR SPACE</span><h2>購物紀錄</h2></div><button className="icon-button" onClick={close} aria-label="關閉歷史紀錄"><X size={22}/></button></div>
        <div className="chat-agent-card">
          <p className="chat-agent-title">Buyer Agent</p>
          <p className="chat-agent-status">
            <span aria-hidden="true" />
            已啟用
          </p>
        </div>

        <nav className="chat-primary-nav" aria-label="主要功能">
          <button
            className="chat-nav-button"
            data-active={activeView === "chat"}
            type="button"
            onClick={()=>choose(onChat)}
            aria-label="AI 對話"
            aria-current={activeView === "chat" ? "page" : undefined}
          >
            <MessageCircle size={21} aria-hidden="true" />
            <span>AI 對話</span>
          </button>
          <button
            className="chat-nav-button"
            data-active={activeView === "definitions"}
            type="button"
            onClick={()=>choose(onSettings)}
            aria-label="代理設定"
            aria-current={activeView === "definitions" ? "page" : undefined}
          >
            <SlidersHorizontal size={21} aria-hidden="true" />
            <span>代理設定</span>
          </button>
        </nav>

        <section className="chat-recents" aria-labelledby="chat-recents-title">
          <div className="chat-recents-heading">
            <h2 id="chat-recents-title">最近對話</h2>
            <button
              className="button secondary chat-new-button"
              type="button"
              onClick={()=>choose(onNewConversation)}
            >
              <Plus size={17} aria-hidden="true" />
              <span>新對話</span>
            </button>
          </div>

          <div className="chat-recents-list">
            {onClearHistory&&<button className="history-clear-all" disabled={historyLocked} onClick={()=>setDeleting('all')}><Trash2 size={15}/>清除全部歷史紀錄</button>}
            {deleting==='all'&&<div className="history-delete-confirm" role="group" aria-label="確認清除全部歷史"><p>清除這個分頁的全部對話與草稿？<small>保留個人設定；SQLite 報價與決策稽核不刪除。</small></p><button disabled={historyLocked} onClick={()=>{onClearHistory?.();close();}}>確認清除全部</button><button onClick={()=>setDeleting(null)}>取消</button></div>}
            {recentRequests.length === 0 ? (
              <p className="chat-empty-note">尚無對話</p>
            ) : (
              recentRequests.map((request) => (
                <div className="history-row" key={request.id} data-active={request.isActive}>
                <button
                  className="chat-recent-item"
                  data-active={request.isActive}
                  key={request.id}
                  type="button"
                  onClick={() => choose(()=>onSelectConversation(request.id))}
                  aria-label={request.title}
                  aria-current={request.isActive ? "page" : undefined}
                >
                  <PanelLeft size={18} aria-hidden="true" />
                  <span>
                    <strong>{request.title}</strong>
                    {request.subtitle ? <small>{request.subtitle}</small> : null}
                  </span>
                </button>
                {onDeleteConversation&&<button className="history-delete" disabled={historyLocked} aria-label={`刪除對話：${request.title}`} onClick={()=>setDeleting(deleting===request.id?null:request.id)}><Trash2 size={17}/></button>}
                {deleting===request.id&&<div className="history-delete-confirm" role="group" aria-label="確認刪除對話"><p>刪除此分頁的對話與草稿？<small>SQLite 報價與決策稽核仍保留。</small></p><button disabled={historyLocked} onClick={()=>{onDeleteConversation?.(request.id);setDeleting(null);}}>確認刪除</button><button onClick={()=>setDeleting(null)}>取消</button></div>}
                </div>
              ))
            )}
          </div>
        </section>

        <button className="chat-account-button" type="button" onClick={()=>choose(onSettings)} aria-label="我的 Buyer Agent 設定">
          <span className="chat-avatar chat-avatar-small" aria-hidden="true">
            <UserRound size={17} />
          </span>
          <span>我的 Buyer Agent</span>
        </button>
      </aside>

      <main
        className="chat-main-slot"
        aria-label={viewLabel[activeView]}
        tabIndex={-1}
        inert={mobile&&navigationOpen}
      >
        {children}
      </main>
    </div>
  );
}
