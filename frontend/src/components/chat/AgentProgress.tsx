import type { RequestSnapshot } from "../../contract.generated";
import type { RequestProgressStage } from "../../state/useAgentProgress";
import "./AgentProgress.css";

export type AgentProgressStatus =
  | RequestSnapshot["status"]
  | RequestProgressStage
  | "submitting"
  | "accepted"
  | "rejected";

export interface AgentProgressProps {
  status: AgentProgressStatus;
  error?: string;
}

type StepState = "complete" | "current" | "waiting" | "blocked";

interface StepDefinition {
  key: "formatting" | "orchestrating" | "negotiating" | "evaluating";
  label: string;
  idle: string;
  current: string;
  complete: string;
  blocked: string;
}

const STEPS: StepDefinition[] = [
  {
    key: "formatting",
    label: "Formatter",
    idle: "等待整理購買需求",
    current: "正在整理需求與限制",
    complete: "需求與偏好已整理",
    blocked: "需要補齊需求條件",
  },
  {
    key: "orchestrating",
    label: "Orchestrator",
    idle: "等待分派給可用賣家",
    current: "正在選擇符合條件的賣家",
    complete: "已分派給候選賣家",
    blocked: "暫時無法完成分派",
  },
  {
    key: "negotiating",
    label: "Negotiation",
    idle: "等待賣家回覆報價",
    current: "正在與賣家議價",
    complete: "賣家回覆已收齊",
    blocked: "沒有可用的合格報價",
  },
  {
    key: "evaluating",
    label: "Evaluation",
    idle: "等待獨立評估",
    current: "正在評估價格、配送與條件",
    complete: "已完成排序與建議",
    blocked: "評估結果需要人工確認",
  },
];

const runningOrder = ["submitting", "formatting", "orchestrating", "negotiating", "evaluating"] as const;

export function AgentProgress({ status, error }: AgentProgressProps) {
  const model = progressModel(status, error);

  return (
    <section
      className="agent-progress"
      data-status={model.tone}
      aria-labelledby="agent-progress-title"
    >
      <div className="agent-progress__header">
        <p className="agent-progress__eyebrow">Buyer Agent</p>
        <h2 id="agent-progress-title" aria-live="polite" aria-atomic="true">
          {model.headline}
        </h2>
        <p>{model.summary}</p>
      </div>

      <ol className="agent-progress__steps" aria-label="Agent 處理進度">
        {STEPS.map((step, index) => {
          const state = model.stepStates[index];
          return (
            <li
              className="agent-progress__step"
              data-state={state}
              aria-current={state === "current" || state === "blocked" ? "step" : undefined}
              key={step.key}
            >
              <span className="agent-progress__marker" aria-hidden="true">
                {state === "complete" ? "✓" : null}
              </span>
              <span>
                <strong>{step.label}</strong>
                <small>{stepCopy(step, state)}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function progressModel(status: AgentProgressStatus, error?: string) {
  if (error) {
    const headline = status === "submitting" ? "正在確認送出結果" : "暫時無法更新進度";
    return unresolvedModel(
      headline,
      "系統保留目前狀態，請重新載入以確認最新進度。",
    );
  }

  if (status === "submitting") {
    return {
      tone: "running",
      headline: "正在送出需求",
      summary: "正在把需求交給 Buyer Agent。",
      stepStates: waitingStates(),
    } as const;
  }

  if (status === "awaiting_user") {
    return {
      tone: "ready",
      headline: "優惠已準備好",
      summary: "Buyer Agent 已完成整理、議價與評估，可以查看推薦優惠。",
      stepStates: completeStates(),
    } as const;
  }

  if (status === "needs_clarification") {
    return blockedModel(0, "需要補充購買需求", "請補上明確預算、配送期限或商品條件。");
  }

  if (status === "needs_confirmation") {
    return unresolvedModel("需要確認條件", "有些條件需要你確認後才能安全推薦。");
  }

  if (status === "no_match") {
    return unresolvedModel("沒有找到合格優惠", "目前條件下沒有通過限制的報價。");
  }

  if (status === "failed") {
    return unresolvedModel("本次處理暫時失敗", "系統無法完成本次處理，請稍後重試。");
  }

  if (status === "accepted" || status === "rejected") {
    return unresolvedModel("處理已結束", "這筆需求已進入後續狀態。");
  }

  const currentIndex = currentStepIndex(status);
  const headline = `${STEPS[currentIndex].label} 正在處理`;

  return {
    tone: "running",
    headline,
    summary: STEPS[currentIndex].current,
    stepStates: STEPS.map((_, index) => {
      if (index < currentIndex) return "complete";
      if (index === currentIndex) return "current";
      return "waiting";
    }) as StepState[],
  } as const;
}

function currentStepIndex(status: AgentProgressStatus) {
  return Math.max(0, runningOrder.indexOf(status as (typeof runningOrder)[number]) - 1);
}

function blockedModel(index: number, headline: string, summary: string) {
  return {
    tone: "blocked",
    headline,
    summary,
    stepStates: STEPS.map((_, stepIndex) => {
      if (stepIndex < index) return "complete";
      if (stepIndex === index) return "blocked";
      return "waiting";
    }) as StepState[],
  } as const;
}

function completeStates(): StepState[] {
  return STEPS.map(() => "complete");
}

function waitingStates(): StepState[] {
  return STEPS.map(() => "waiting");
}

function unresolvedModel(headline: string, summary: string) {
  return {
    tone: "blocked",
    headline,
    summary,
    stepStates: waitingStates(),
  } as const;
}

function stepCopy(step: StepDefinition, state: StepState) {
  if (state === "complete") return step.complete;
  if (state === "current") return step.current;
  if (state === "blocked") return step.blocked;
  return step.idle;
}
