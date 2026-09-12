import type { ReactNode } from "react";
import type { AgentProgressStatus } from "./AgentProgress";

export type AppShellView =
  | "chat"
  | "offers"
  | "definitions"
  | "details"
  | "feedback"
  | "settings";

export interface RecentRequest {
  id: string;
  title: string;
  subtitle?: string;
  isActive?: boolean;
}

export interface AppShellProps {
  activeView: AppShellView;
  children: ReactNode;
  recentRequests: RecentRequest[];
  onChat: () => void;
  onSettings: () => void;
  onNewConversation: () => void;
  onSelectConversation: (requestId: string) => void;
}

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp?: string;
  chips?: string[];
}

export interface OfferTeaser {
  requestId: string;
  title: string;
  subtitle?: string;
  offerCount: number;
  lowestTotalTwd?: number;
  imageUrl?: string;
}

export type ChatStatus =
  | "empty"
  | "draft"
  | "sending"
  | "processing"
  | "ready"
  | "failed";

export interface ChatPanelProps {
  messages: ChatMessage[];
  status: ChatStatus;
  progressStatus?: AgentProgressStatus;
  teaser?: OfferTeaser;
  draft: string;
  onDraft: (draft: string) => void;
  onSend: () => void;
  onOpenOffers: (requestId: string) => void;
  sending: boolean;
  error?: string;
  progressError?: string;
  unsavedDefinitions: boolean;
  savedDefinitionValid: boolean;
  onEditDefinitions?: () => void;
}

export type DefinitionTab = "intent" | "preference";

export interface AgentDefinitionEditorProps {
  intent: string;
  preference: string;
  savedIntent: string;
  savedPreference: string;
  dirty?: boolean;
  activeTab: DefinitionTab;
  onTabChange: (tab: DefinitionTab) => void;
  onIntentChange: (value: string) => void;
  onPreferenceChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error?: string;
}
