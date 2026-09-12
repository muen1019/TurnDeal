import {Send, X} from 'lucide-react';
import {codePointLength} from './offerUtils';
import {OfferButton, StatusMessage} from './offerPrimitives';
import '../../styles/offers.css';

const MAX_FEEDBACK_CODEPOINTS = 2000;

export interface FeedbackFormProps {
  value: string;
  pending?: boolean;
  fieldMessage?: string;
  submitLabel?: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function FeedbackForm({value, pending = false, fieldMessage, submitLabel = '送出回饋', onChange, onSubmit, onCancel}: FeedbackFormProps) {
  const count = codePointLength(value);
  const trimmed = value.trim();
  const invalid = trimmed.length === 0 || count > MAX_FEEDBACK_CODEPOINTS;

  return (
    <form
      className="offer-ui feedback-form"
      aria-labelledby="feedback-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid && !pending) {
          onSubmit(value);
        }
      }}
    >
      <div className="feedback-form__header">
        <h2 id="feedback-title">補充需求</h2>
        <p>略過不會自動送出拒絕。請寫下想調整的條件；系統會保存回饋，供 Buyer Agent 後續處理。</p>
      </div>

      <label className="offer-form-field">
        <span>回饋內容</span>
        <textarea
          value={value}
          rows={7}
          disabled={pending}
          aria-describedby="feedback-help feedback-count"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="feedback-form__meta">
        <span id="feedback-help">{count > MAX_FEEDBACK_CODEPOINTS ? '回饋超過 2000 個 Unicode 字元，請縮短後送出。' : '最多 2000 個 Unicode 字元。'}</span>
        <span id="feedback-count">{count} / {MAX_FEEDBACK_CODEPOINTS}</span>
      </div>

      {fieldMessage ? <StatusMessage tone="danger">{fieldMessage}</StatusMessage> : null}

      <div className="feedback-form__actions">
        <OfferButton type="submit" variant="primary" icon={<Send size={18} />} disabled={pending || invalid}>
          {submitLabel}
        </OfferButton>
        <OfferButton type="button" variant="quiet" icon={<X size={18} />} disabled={pending} onClick={onCancel}>
          取消
        </OfferButton>
      </div>
    </form>
  );
}
