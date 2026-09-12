import { ArrowRight, Bot, Paperclip, Sparkles } from "lucide-react";
import {useEffect, useRef, type ChangeEvent, type KeyboardEvent} from "react";
import { AgentProgress } from "./AgentProgress";
import type { ChatPanelProps } from "./types";

const DRAFT_LIMIT = 2000;

export function ChatPanel({
  messages,
  status,
  progressStatus,
  teaser,
  draft,
  onDraft,
  onSend,
  onOpenOffers,
  sending,
  error,
  progressError,
  unsavedDefinitions,
  savedDefinitionValid,
  onEditDefinitions,
}: ChatPanelProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lastMessage = messages.at(-1);
  const progressErrorSignal = progressStatus ? (progressError ?? error) : undefined;
  useEffect(() => {
    if (followLatest.current && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [lastMessage?.id, lastMessage?.content, progressStatus, teaser?.requestId]);
  const trimmedDraft = draft.trim();
  const draftTooLong = Array.from(trimmedDraft).length > DRAFT_LIMIT;
  const canSend =
    trimmedDraft.length > 0 && !draftTooLong && !sending && savedDefinitionValid;

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onDraft(event.target.value);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    if (isComposing(event)) {
      return;
    }

    event.preventDefault();
    if (canSend) {
      onSend();
    }
  };

  return (
    <section className="chat-panel" aria-labelledby="chat-panel-title">
      <div className="chat-panel-heading">
        <div>
          <h1 id="chat-panel-title">購物助理</h1>
          <p className="chat-introduction">告訴我需求，讓 Buyer Agent 幫你比較優惠。</p>
        </div>
        <span className="chat-status-pill" data-status={status}>
          {statusLabel(status)}
        </span>
      </div>

      <div ref={threadRef} className="chat-thread" onScroll={(event)=>{const el=event.currentTarget;followLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<32;}}>
        <div className="chat-message-list" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <span aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <p>輸入預算、用途和不能妥協的條件，Buyer Agent 會用已儲存的設定整理成購物需求。</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className="chat-message"
              data-role={message.role}
              key={message.id}
            >
              {message.role !== "user" ? (
                <span className="chat-agent-icon" aria-hidden="true">
                  <Bot size={18} />
                </span>
              ) : null}
              <div className="chat-bubble">
                <p>{message.content}</p>
                {message.chips && message.chips.length > 0 ? (
                  <ul className="chat-chip-list" aria-label="需求摘要">
                    {message.chips.map((chip) => (
                      <li key={chip}>{chip}</li>
                    ))}
                  </ul>
                ) : null}
                {message.timestamp ? (
                  <time dateTime={message.timestamp}>{message.timestamp}</time>
                ) : null}
              </div>
            </article>
          ))
        )}
        </div>

        {progressStatus ? <AgentProgress status={progressStatus} error={progressErrorSignal} /> : null}

        {teaser ? (
          <article className="chat-offer-teaser" aria-label="可查看優惠結果">
            {teaser.imageUrl ? (
              <img src={teaser.imageUrl} alt="" loading="lazy" />
            ) : (
              <div className="chat-teaser-visual" aria-hidden="true">
                <MouseGlyph />
              </div>
            )}
            <div>
              <p className="chat-teaser-kicker">已找到 {teaser.offerCount} 組優惠</p>
              <h2>{teaser.title}</h2>
              {teaser.lowestTotalTwd ? (
                <p>最低 NT${teaser.lowestTotalTwd.toLocaleString("zh-TW")} 起</p>
              ) : teaser.subtitle ? (
                <p>{teaser.subtitle}</p>
              ) : null}
              <button
                className="button primary"
                type="button"
                onClick={() => onOpenOffers(teaser.requestId)}
              >
                <span>查看 {teaser.offerCount} 組優惠</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </article>
        ) : null}
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) {
            onSend();
          }
        }}
      >
        <label className="sr-only" htmlFor="buyer-requirement">
          輸入購物需求
        </label>
        <span className="chat-composer-icon" aria-hidden="true">
          <Paperclip size={20} aria-hidden="true" />
        </span>
        <textarea
          id="buyer-requirement"
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleComposerKeyDown}
          placeholder="輸入需求，或補充你在意的條件..."
          rows={1}
          aria-describedby="chat-composer-help chat-composer-state"
        />
        <button
          className="icon-button chat-send-button"
          type="submit"
          disabled={!canSend}
          aria-label={sending ? "送出中" : "送出需求"}
        >
          <ArrowRight size={22} aria-hidden="true" />
        </button>
      </form>

      <div className="chat-composer-meta" id="chat-composer-state" aria-live="polite">
        <p id="chat-composer-help">
          送出後，Buyer Agent 會使用目前已儲存的設定處理需求。
        </p>
        {unsavedDefinitions ? (
          <p className="chat-warning">
            尚未儲存的代理設定不會用於這次送出。
            {onEditDefinitions ? (
              <button type="button" onClick={onEditDefinitions}>
                前往編輯
              </button>
            ) : null}
          </p>
        ) : null}
        {!savedDefinitionValid ? (
          <p className="chat-error">
            需要先儲存有效的 intent.md 才能送出新需求。
            {onEditDefinitions ? (
              <button type="button" onClick={onEditDefinitions}>
                開啟代理設定
              </button>
            ) : null}
          </p>
        ) : null}
        {draftTooLong ? (
          <p className="chat-error">需求最多 {DRAFT_LIMIT} 個 Unicode 字元。</p>
        ) : null}
        {error ? <p className="chat-error">{error}</p> : null}
      </div>
    </section>
  );
}

function statusLabel(status: ChatPanelProps["status"]) {
  switch (status) {
    case "sending":
      return "送出中";
    case "processing":
      return "比價中";
    case "ready":
      return "可查看";
    case "failed":
      return "需處理";
    case "draft":
      return "草稿";
    case "empty":
    default:
      return "待輸入";
  }
}

function isComposing(event: KeyboardEvent<HTMLTextAreaElement>) {
  return event.nativeEvent.isComposing;
}

function MouseGlyph() {
  return (
    <svg viewBox="0 0 140 104" role="img" aria-label="滑鼠與滑鼠墊示意">
      <rect x="10" y="30" width="120" height="58" rx="18" fill="#dfecef" />
      <rect x="43" y="11" width="54" height="70" rx="27" fill="#ffffff" />
      <path d="M70 13v24" stroke="#9fb4bd" strokeWidth="3" />
      <rect x="64" y="19" width="12" height="18" rx="6" fill="#252a28" />
    </svg>
  );
}
