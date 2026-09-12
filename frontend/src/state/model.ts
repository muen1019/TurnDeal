import type { RequestSnapshot } from "../contract.generated";
import {newId} from './id';

export type View = "chat" | "offers" | "details" | "settings" | "history" | "feedback";
export type InputSource = "keyboard" | "pointer";

export interface Conversation {
  refinementRequested?: boolean;
  id: string;
  title: string;
  requestId: string | null;
  message: string;
  definitionVersion: number;
  draft: string;
  feedback: string;
  feedbackHistory?: string[];
  clarificationDraft?: {requestId:string;answers:Record<string,string>};
  skipped: string[];
  snapshot: RequestSnapshot | null;
  historyMissing?: boolean;
  unavailableIds?: string[];
}

export interface Definitions {
  intent: string;
  preference: string;
  savedIntent: string;
  savedPreference: string;
  version: number;
}

export interface Workspace {
  definitions: Definitions;
  conversations: Conversation[];
  activeId: string;
}

export interface Pending {
  kind: "create" | "accept" | "reject";
  path: string;
  body: Record<string, unknown>;
  key: string;
  conversationId: string | null;
  requestId: string | null;
  source: InputSource;
}

export const storageKey = "offermesh:demo-buyer:workspace:v1";
export const pendingKey = "offermesh:demo-buyer:pending:v1";

export function freshConversation(): Conversation {
  return {
    id: newId(),
    title: "新的購物需求",
    requestId: null,
    message: "",
    definitionVersion: 0,
    draft: "",
    feedback: "",
    feedbackHistory: [],
    skipped: [],
    snapshot: null,
  };
}

export function initialWorkspace(): Workspace {
  const conversation = freshConversation();

  return {
    definitions: {
      intent: "",
      preference: "",
      savedIntent: "",
      savedPreference: "",
      version: 0,
    },
    conversations: [conversation],
    activeId: conversation.id,
  };
}

export function loadWorkspace(): { workspace: Workspace; error: string } {
  try {
    const text = sessionStorage.getItem(storageKey);
    if (!text) {
      return { workspace: initialWorkspace(), error: "" };
    }

    const value = JSON.parse(text) as Workspace;
    if (!isWorkspace(value)) {
      throw new Error("invalid workspace");
    }

    return { workspace: value, error: "" };
  } catch {
    return {
      workspace: initialWorkspace(),
      error: "無法恢復本分頁草稿。已發布的結果仍可透過連結開啟。",
    };
  }
}

export function saveWorkspace(value: Workspace) {
  sessionStorage.setItem(storageKey, JSON.stringify(value));
}

export function loadPending(): Pending | null {
  const text = sessionStorage.getItem(pendingKey);
  if (!text) {
    return null;
  }

  const raw = JSON.parse(text) as Partial<Pending>;
  if (!isPending(raw)) {
    throw new Error("無法讀取待確認提交紀錄，上一筆提交結果尚未確認。");
  }

  return raw;
}

export function currentRank(conversation: Conversation) {
  return conversation.snapshot?.ranked_offers.find(
    (rank) => !conversation.skipped.includes(rank.offer_id),
  );
}

export function skipOffer(conversation: Conversation): Conversation {
  const rank = currentRank(conversation);
  return rank
    ? { ...conversation, skipped: [...conversation.skipped, rank.offer_id] }
    : conversation;
}

export function undoSkip(conversation: Conversation): Conversation {
  return { ...conversation, skipped: conversation.skipped.slice(0, -1) };
}

export function patchConversation(
  workspace: Workspace,
  id: string,
  patch: Partial<Conversation>,
): Workspace {
  return {
    ...workspace,
    conversations: workspace.conversations.map((conversation) =>
      conversation.id === id ? { ...conversation, ...patch } : conversation,
    ),
  };
}

export function parseLocation(): {
  requestId: string | null;
  view: View;
  offerId: string | null;
} {
  const query = new URLSearchParams(location.search);
  const match = location.pathname.match(/^\/requests\/([^/]+)$/);

  return {
    requestId: match ? decodeURIComponent(match[1]) : query.get("request_id"),
    view: match ? (query.get("view") === "details" ? "details" : "offers") : "chat",
    offerId: query.get("offer_id"),
  };
}

export const processing = (status: string | undefined) =>
  Boolean(status && ["formatting", "orchestrating", "negotiating", "evaluating"].includes(status));

function isWorkspace(value: Workspace) {
  return (
    value &&
    isDefinitions(value.definitions) &&
    Array.isArray(value.conversations) &&
    value.conversations.length > 0 &&
    value.conversations.every(isConversation) &&
    value.conversations.some((conversation) => conversation.id === value.activeId)
  );
}

function isDefinitions(value: Definitions) {
  return (
    value &&
    typeof value.intent === "string" &&
    typeof value.preference === "string" &&
    typeof value.savedIntent === "string" &&
    typeof value.savedPreference === "string" &&
    Number.isInteger(value.version)
  );
}

function isConversation(value: Conversation) {
  return (
    value &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (typeof value.requestId === "string" || value.requestId === null) &&
    typeof value.message === "string" &&
    Number.isInteger(value.definitionVersion) &&
    typeof value.draft === "string" &&
    typeof value.feedback === "string" &&
    Array.isArray(value.skipped) &&
    (value.feedbackHistory === undefined || Array.isArray(value.feedbackHistory))
  );
}

function isPending(value: Partial<Pending>): value is Pending {
  const source = value.source ?? "pointer";
  const normalized = {
    ...value,
    conversationId:
      typeof value.conversationId === "string" ? value.conversationId : null,
    requestId: typeof value.requestId === "string" ? value.requestId : null,
    source,
  };

  Object.assign(value, normalized);

  return (
    typeof normalized.key === "string" &&
    normalized.key.length > 0 &&
    typeof normalized.path === "string" &&
    normalized.path.startsWith("/api/") &&
    normalized.body !== null &&
    typeof normalized.body === "object" &&
    !Array.isArray(normalized.body) &&
    ["create", "accept", "reject"].includes(String(normalized.kind)) &&
    ["keyboard", "pointer"].includes(source)
  );
}
