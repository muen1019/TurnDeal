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
  const intentTooLong = Array.from(intent).length > DOC_LIMIT;
  const preferenceTooLong = Array.from(preference).length > DOC_LIMIT;
  const currentTooLong = Array.from(currentValue).length > DOC_LIMIT;
  const canSave =
    isDirty && !saving && !intentTooLong && !preferenceTooLong;

  return (
    <section className="agent-editor" aria-labelledby="agent-editor-title">
      <div className="agent-editor-heading">
        <div>
          <h2 id="agent-editor-title">Buyer Agent 定義</h2>
          <p className="chat-introduction">購買意圖是本次需求；偏好由你的所有對話共用。</p>
        </div>
        <span className="agent-save-state" data-dirty={isDirty}>
          <span aria-hidden="true" />
          {isDirty ? "尚未儲存" : "已儲存"}
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
          placeholder={activeTab === "intent" ? "選填，例如：辦公用無線滑鼠。也可以直接在對話輸入需求。" : "選填，例如：喜歡黑色、小尺寸，不接受付費配件。"}
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
            <p>intent.md：本輪購買意圖。此處是意圖模板，可留空；未設定時直接使用本次輸入。預算、交期與臨時偏好請寫在本次需求，避免沿用舊條件。</p>
          ) : (
            <p>preference.md：你的共用偏好，例如顏色、尺寸與排序原則。儲存後，新對話與需求改善都會使用最新版。留空並儲存會清除共用偏好。</p>
          )}
          <p className="agent-counter" data-invalid={currentTooLong}>
            {Array.from(currentValue).length.toLocaleString("zh-TW")} /{" "}
            {DOC_LIMIT.toLocaleString("zh-TW")}
          </p>
          <p>偏好修改會套用於後續需求，已產生的報價保持不變。</p>
          {currentValue !== currentSaved ? (
            <p className="chat-warning">這個分頁有尚未儲存的變更。</p>
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
