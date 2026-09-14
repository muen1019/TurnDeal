import type { RequestSnapshot } from "../contract.generated";

export type RequestProgressStage =
  | "formatting"
  | "orchestrating"
  | "negotiating"
  | "evaluating"
  | "awaiting_user"
  | "failed"
  | "needs_clarification"
  | "needs_confirmation"
  | "no_match";

type SnapshotProgressStatus = RequestSnapshot["status"] | "accepted" | "rejected";

export interface AgentProgressState {
  stage?: RequestProgressStage;
  error?: string;
}

export function useAgentProgress(
  _requestId: string | null,
  snapshotStatus?: SnapshotProgressStatus,
): AgentProgressState {
  return { stage: fallbackStage(snapshotStatus), error: undefined };
}

function terminalSnapshotStage(status?: SnapshotProgressStatus): RequestProgressStage | undefined {
  if (
    status === "awaiting_user" ||
    status === "failed" ||
    status === "needs_clarification" ||
    status === "needs_confirmation" ||
    status === "no_match"
  ) {
    return status;
  }

  return undefined;
}

function fallbackStage(status?: SnapshotProgressStatus): RequestProgressStage | undefined {
  if (status === "formatting" || status === "orchestrating" || status === "negotiating" || status === "evaluating") return status;
  return terminalSnapshotStage(status);
}
