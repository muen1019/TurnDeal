import { Check, FileText, Loader2, RotateCcw, Save } from "lucide-react";
import type { AgentDefinitionEditorProps, DefinitionTab } from "./types";

const DOC_LIMIT = 20000;

export function AgentDefinitionEditor({
  intent,
  preference,
  savedIntent,
  savedPreference,
  dirty,
  activeTab,
  onTabChange,
  onIntentChange,
  onPreferenceChange,
  onSave,
  onCancel,
  saving,
  error,
}: AgentDefinitionEditorProps) {
  const currentValue = activeTab === "intent" ? intent : preference;
  const currentSaved = activeTab === "intent" ? savedIntent : savedPreference;
  const isDirty = dirty ?? (intent !== savedIntent || preference !== savedPreference);
  const intentInvalid = intent.trim().length === 0;
  const intentTooLong = Array.from(intent).length > DOC_LIMIT;
  const preferenceTooLong = Array.from(preference).length > DOC_LIMIT;
  const currentTooLong = Array.from(currentValue).length > DOC_LIMIT;
  const canSave =
    isDirty && !saving && !intentInvalid && !intentTooLong && !preferenceTooLong;

  return (
    <section className="agent-editor" aria-labelledby="agent-editor-title">
      <div className="agent-editor-heading">
        <div>
          <h2 id="agent-editor-title">Buyer Agent 定義</h2>
          <p className="chat-introduction">調整代理理解與購買原則</p>
        </div>
        <span className="agent-save-state" data-dirty={isDirty}>
          <span aria-hidden="true" />
          {isDirty ? "尚未儲存" : "已儲存於此分頁"}
        </span>
      </div>

      <div className="agent-tabs" role="tablist" aria-label="Buyer Agent 文件">
        <EditorTab
          active={activeTab === "intent"}
          id="intent"
          label="intent.md"
          saved={intent === savedIntent}
          onTabChange={onTabChange}
        />
        <EditorTab
          active={activeTab === "preference"}
          id="preference"
          label="preference.md"
          saved={preference === savedPreference}
          onTabChange={onTabChange}
        />
      </div>

      <div className="agent-document-frame" role="tabpanel" id={`agent-panel-${activeTab}`} aria-labelledby={`agent-tab-${activeTab}`}>
        <div className="agent-line-rail" aria-hidden="true">
          {Array.from({ length: Math.max(8, currentValue.split("\n").length) }).map(
            (_, index) => (
              <span key={index}>{index + 1}</span>
            ),
          )}
        </div>
        <label className="sr-only" htmlFor={`agent-${activeTab}-document`}>
          編輯 {activeTab === "intent" ? "intent.md" : "preference.md"}
        </label>
        <textarea
          id={`agent-${activeTab}-document`}
          value={currentValue}
          onChange={(event) => {
            if (activeTab === "intent") {
              onIntentChange(event.target.value);
            } else {
              onPreferenceChange(event.target.value);
            }
          }}
          spellCheck={false}
          aria-describedby="agent-editor-state"
        />
      </div>

      <div className="agent-editor-footer" id="agent-editor-state" aria-live="polite">
        <div>
          {activeTab === "intent" ? (
            <p>intent.md 會和每次新需求組成送出的購買意圖。</p>
          ) : (
            <p>preference.md 可留空，會原樣套用到下一次需求。</p>
          )}
          <p className="agent-counter" data-invalid={currentTooLong}>
            {Array.from(currentValue).length.toLocaleString("zh-TW")} /{" "}
            {DOC_LIMIT.toLocaleString("zh-TW")}
          </p>
          <p>儲存後套用於下一次需求。</p>
          {currentValue !== currentSaved ? (
            <p className="chat-warning">這個分頁有尚未儲存的變更。</p>
          ) : null}
          {intentInvalid ? (
            <p className="chat-error">intent.md 不能空白。</p>
          ) : null}
          {intentTooLong || preferenceTooLong ? (
            <p className="chat-error">每個定義文件最多 20,000 個 Unicode 字元。</p>
          ) : null}
          {error ? <p className="chat-error">{error}</p> : null}
        </div>

        <div className="agent-editor-actions">
          <button
            className="button secondary"
            type="button"
            onClick={onCancel}
            disabled={!isDirty || saving}
          >
            <RotateCcw size={17} aria-hidden="true" />
            <span>取消變更</span>
          </button>
          <button
            className="button primary"
            type="button"
            onClick={onSave}
            disabled={!canSave}
          >
            {saving ? (
              <Loader2 className="agent-spin" size={17} aria-hidden="true" />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            <span>{saving ? "儲存中" : "儲存設定"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

interface EditorTabProps {
  active: boolean;
  id: DefinitionTab;
  label: string;
  saved: boolean;
  onTabChange: (tab: DefinitionTab) => void;
}

function EditorTab({ active, id, label, saved, onTabChange }: EditorTabProps) {
  return (
    <button
      role="tab"
      type="button"
      id={`agent-tab-${id}`}
      aria-selected={active}
      aria-controls={active ? `agent-panel-${id}` : undefined}
      tabIndex={active ? 0 : -1}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'intent' : event.key === 'End' ? 'preference' : id === 'intent' ? 'preference' : 'intent';
        onTabChange(next);
        document.getElementById(`agent-tab-${next}`)?.focus();
      }}
      className="agent-tab"
      data-active={active}
      onClick={() => onTabChange(id)}
    >
      <FileText size={16} aria-hidden="true" />
      <span>{label}</span>
      {saved ? (
        <small>
          <Check size={13} aria-hidden="true" />
          saved
        </small>
      ) : null}
    </button>
  );
}
