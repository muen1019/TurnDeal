import { useEffect, useRef, useState } from "react";
import type { RequestSnapshot } from "../contract.generated";
import {
  getRequestProgress,
  ProgressFetchError,
  ProgressNotFound,
  type RequestProgressStage,
} from "../api/progress";

type SnapshotProgressStatus = RequestSnapshot["status"] | "accepted" | "rejected";

export interface AgentProgressState {
  stage?: RequestProgressStage;
  error?: string;
}

interface ScopedAgentProgressState extends AgentProgressState {
  requestId: string | null;
}

const POLL_MS = 1000;
const UPDATE_ERROR = "暫時無法更新進度";

export function useAgentProgress(
  requestId: string | null,
  snapshotStatus?: SnapshotProgressStatus,
): AgentProgressState {
  const [state, setState] = useState<ScopedAgentProgressState>(() => ({
    requestId,
    stage: fallbackStage(snapshotStatus),
    error: undefined,
  }));
  const lastSequenceRef = useRef(-1);
  const activeRequestIdRef = useRef<string | null>(requestId);
  const mockProgressEnabled = import.meta.env.DEV && String(import.meta.env.VITE_OFFERMESH_MOCK) === "true";

  useEffect(() => {
    if (activeRequestIdRef.current !== requestId) {
      activeRequestIdRef.current = requestId;
      lastSequenceRef.current = -1;
      setState({
        requestId,
        stage: fallbackStage(snapshotStatus),
        error: undefined,
      });
    }

    if (!requestId) {
      setState({ requestId: null, stage: undefined, error: undefined });
      return;
    }

    if (!mockProgressEnabled) {
      setState({ requestId, stage: fallbackStage(snapshotStatus), error: undefined });
      return;
    }

    if (isTerminalSnapshot(snapshotStatus)) {
      setState({
        requestId,
        stage: terminalSnapshotStage(snapshotStatus),
        error: undefined,
      });
      return;
    }

    const fallback = fallbackStage(snapshotStatus);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();

      try {
        const progress = await getRequestProgress(requestId, controller.signal);
        if (stopped) return;

        if (progress.sequence < lastSequenceRef.current) {
          schedule();
          return;
        }

        lastSequenceRef.current = progress.sequence;
        setState({
          requestId,
          stage: safeProgressStage(progress.stage, snapshotStatus),
          error: undefined,
        });
        schedule();
      } catch (error) {
        if (stopped || isAbortError(error)) return;

        if (error instanceof ProgressNotFound) {
          setState({ requestId, stage: fallback, error: undefined });
          return;
        }

        setState((current) => ({
          requestId,
          stage: current.requestId === requestId ? current.stage ?? fallback : fallback,
          error: error instanceof ProgressFetchError ? error.message : UPDATE_ERROR,
        }));
        schedule();
      }
    };

    const schedule = () => {
      if (!stopped) {
        timer = setTimeout(poll, POLL_MS);
      }
    };

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [requestId, snapshotStatus, mockProgressEnabled]);

  if (state.requestId !== requestId) {
    return { stage: fallbackStage(snapshotStatus), error: undefined };
  }

  return { stage: state.stage, error: state.error };
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

function isTerminalSnapshot(status?: SnapshotProgressStatus): boolean {
  return (
    status === "awaiting_user" ||
    status === "failed" ||
    status === "needs_clarification" ||
    status === "needs_confirmation" ||
    status === "no_match" ||
    status === "accepted" ||
    status === "rejected"
  );
}

function fallbackStage(status?: SnapshotProgressStatus): RequestProgressStage | undefined {
  if (status === "formatting" || status === "orchestrating" || status === "negotiating" || status === "evaluating") return status;
  return terminalSnapshotStage(status);
}

function safeProgressStage(
  stage: RequestProgressStage,
  snapshotStatus?: SnapshotProgressStatus,
): RequestProgressStage {
  if (stage === "awaiting_user" && snapshotStatus !== "awaiting_user") {
    return "evaluating";
  }

  return stage;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
