import type {DocumentBundle, NormalizedIntent, RequestSnapshot} from '../types.js';

export type Scope = 'all_categories' | 'category:mouse' | 'category:mouse_pad';
export type PreferenceEntry = {preference_id: string; scope: Scope; value: string};
export type PreferenceDocument = {revision: number; markdown: string; entries: PreferenceEntry[]};
export type Evidence = {evidence_id: string; text: string; kind: 'user_feedback' | 'rejection'};
export type OfferSummary = {
  offer_id: string; items: {product_id: string; quantity: number}[];
  total_price_twd: number; delivery_days: number; terms_id: string; signature: string;
};
export type ImprovementContext = {
  improvement_id: string; buyer_id: string; parent_request_id: string; root_request_id: string;
  source_documents: DocumentBundle; hard_constraints: NormalizedIntent;
  request_preference_revision: number | null; global_preference: PreferenceDocument;
  rejected_offers: OfferSummary[]; evidence: Evidence[];
  history: {improvement_id: string; status: string; intent_md: string}[];
};
export type Change = {target: string; before: string | null; after: string; evidence_ids: string[]};
export type PreferenceOperation = {
  operation: 'add' | 'replace' | 'remove'; preference_id: string; before: string | null;
  value: string | null; scope: Scope; evidence_id: string; explicit_quote: string;
};
export type RevisionProposal = {
  intent: {markdown: string; changes: Change[]};
  preference: {action: 'keep'} | {action: 'patch'; base_revision: number; operations: PreferenceOperation[]};
  outcome: 'ready' | 'needs_clarification'; questions: string[];
};
export type Candidate = {
  proposal: RevisionProposal; preference: PreferenceDocument;
  status: 'ready' | 'needs_clarification'; questions: string[];
  audit: string[]; provider: 'llm' | 'deterministic' | 'fallback';
};
export type ImprovementResult = {
  improvement_id: string; parent_request_id: string;
  status: 'ready' | 'needs_clarification'; intent_revision_id: string;
  intent_state: 'ready' | 'draft'; documents: DocumentBundle;
  preference_revision: number; preference_updated: boolean;
  changes: Change[]; questions: string[]; audit: string[]; provider: Candidate['provider'];
};
export type Job = {
  improvement_id: string; status: 'queued' | 'running' | 'ready' | 'needs_clarification' | 'failed';
  context: ImprovementContext; attempts: number; claims: number;
  lease_token: string | null; lease_until: number | null;
  result: ImprovementResult | null; error: string | null;
};
export interface RevisionProvider {
  kind: 'llm' | 'deterministic';
  generate(context: ImprovementContext, errors: string[], signal: AbortSignal): Promise<unknown>;
}
export type IntentNormalizer = (documents: DocumentBundle) => NormalizedIntent;
export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;
/** Internal same-process port: never expose through HTTP. Uses the store's live DB after rollback. */
export interface ImprovementStorage {
  rows(sql: string, args?: SqlValue[]): SqlRow[];
  run(sql: string, args?: SqlValue[]): void;
  transaction<T>(operation: () => T): T;
  snapshot(requestId: string, buyerId: string): RequestSnapshot;
  ensureBuyer(buyerId: string): void;
  now(): Date;
}
