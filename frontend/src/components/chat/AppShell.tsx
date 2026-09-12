import {
  MessageCircle,
  MousePointer2,
  PanelLeft,
  Plus,
  Settings,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import type { AppShellProps, AppShellView } from "./types";
import { useState } from 'react';

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
}: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  return (
    <div className="chat-app-shell" data-active-view={activeView} data-navigation-open={navigationOpen}>
      <header className="chat-shell-header" aria-label="OfferMesh workspace">
        <div className="chat-brand">
          <span className="chat-brand-mark" aria-hidden="true">
            <MousePointer2 size={18} />
          </span>
          <span>OfferMesh</span>
        </div>
        <div className="chat-header-actions">
          <button className="icon-button mobile-navigation-toggle" type="button" onClick={()=>setNavigationOpen(v=>!v)} aria-label="切換導覽" aria-expanded={navigationOpen}><PanelLeft size={20}/></button>
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

      <aside className="chat-sidebar" aria-label="Buyer Agent navigation">
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
            onClick={onChat}
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
            onClick={onSettings}
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
              onClick={onNewConversation}
            >
              <Plus size={17} aria-hidden="true" />
              <span>新對話</span>
            </button>
          </div>

          <div className="chat-recents-list">
            {recentRequests.length === 0 ? (
              <p className="chat-empty-note">尚無對話</p>
            ) : (
              recentRequests.map((request) => (
                <button
                  className="chat-recent-item"
                  data-active={request.isActive}
                  key={request.id}
                  type="button"
                  onClick={() => onSelectConversation(request.id)}
                  aria-label={request.title}
                  aria-current={request.isActive ? "page" : undefined}
                >
                  <PanelLeft size={18} aria-hidden="true" />
                  <span>
                    <strong>{request.title}</strong>
                    {request.subtitle ? <small>{request.subtitle}</small> : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <button className="chat-account-button" type="button" onClick={onSettings} aria-label="我的 Buyer Agent 設定">
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
      >
        {children}
      </main>
    </div>
  );
}
