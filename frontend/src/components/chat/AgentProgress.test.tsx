import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProgress } from "./AgentProgress";
import { ChatPanel } from "./ChatPanel";
import type { ChatPanelProps } from "./types";

afterEach(() => {
  cleanup();
});

function states() {
  return Array.from(document.querySelectorAll<HTMLElement>(".agent-progress__step")).map((step) =>
    step.dataset.state,
  );
}

function currentStep() {
  return document.querySelector<HTMLElement>('.agent-progress__step[aria-current="step"]');
}

function renderChat(overrides: Partial<ChatPanelProps> = {}) {
  const props: ChatPanelProps = {
    messages: [{ id: "m1", role: "assistant", content: "需求已送出" }],
    status: "processing",
    draft: "",
    onDraft: vi.fn(),
    onSend: vi.fn(),
    onOpenOffers: vi.fn(),
    sending: true,
    unsavedDefinitions: false,
    ...overrides,
  };

  render(<ChatPanel {...props} />);
  return props;
}

describe("AgentProgress", () => {
  it("marks the current contract stage and leaves future stages waiting", () => {
    render(<AgentProgress status="negotiating" />);

    expect(screen.getByRole("heading", { name: "Negotiation 正在處理" })).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("Negotiation");
    expect(states()).toEqual(["complete", "complete", "current", "waiting"]);
  });

  it("keeps all pipeline steps waiting while the request is only submitting", () => {
    render(<AgentProgress status="submitting" />);

    expect(screen.getByRole("heading", { name: "正在送出需求" })).toBeInTheDocument();
    expect(states()).toEqual(["waiting", "waiting", "waiting", "waiting"]);
    expect(currentStep()).toBeNull();
  });

  it("marks every step complete only when offers are ready", () => {
    render(<AgentProgress status="awaiting_user" />);

    expect(screen.getByRole("heading", { name: "優惠已準備好" })).toHaveAttribute("aria-live", "polite");
    expect(states()).toEqual(["complete", "complete", "complete", "complete"]);
    expect(currentStep()).toBeNull();
  });

  it("marks needs_clarification at Formatter without claiming later success", () => {
    render(<AgentProgress status="needs_clarification" />);

    expect(states()).toEqual(["blocked", "waiting", "waiting", "waiting"]);
    expect(currentStep()).toHaveTextContent("Formatter");
  });

  it("keeps unknown failure states unconfirmed instead of inventing completed steps", () => {
    for (const status of ["needs_confirmation", "no_match", "failed"] as const) {
      cleanup();
      render(<AgentProgress status={status} />);

      expect(states()).toEqual(["waiting", "waiting", "waiting", "waiting"]);
      expect(currentStep()).toBeNull();
      expect(states()).not.toEqual(["complete", "complete", "complete", "complete"]);
    }
  });

  it("uses generic progress error copy without exposing raw technical text", () => {
    render(<AgentProgress status="evaluating" error="HTTP 500 request_id=req_123 raw stack" />);

    expect(screen.getByRole("heading", { name: "暫時無法更新進度" })).toBeInTheDocument();
    expect(screen.getByText("系統保留目前狀態，請重新載入以確認最新進度。")).toBeInTheDocument();
    expect(screen.queryByText(/request_id=req_123|raw stack/)).not.toBeInTheDocument();
    expect(states()).toEqual(["waiting", "waiting", "waiting", "waiting"]);
    expect(states()).not.toContain("current");
  });
});

describe("ChatPanel progress integration", () => {
  it("renders progress after messages and before the offer teaser without nesting the message live region", () => {
    renderChat({
      progressStatus: "evaluating",
      teaser: {
        requestId: "req_1",
        title: "推薦優惠",
        offerCount: 4,
        lowestTotalTwd: 760,
      },
    });

    const thread = document.querySelector(".chat-thread");
    const messageList = document.querySelector(".chat-message-list");
    const progress = document.querySelector(".agent-progress");
    const teaser = document.querySelector(".chat-offer-teaser");

    expect(thread).not.toHaveAttribute("aria-live");
    expect(messageList).toHaveAttribute("aria-live", "polite");
    expect(progress?.compareDocumentPosition(teaser as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(messageList?.compareDocumentPosition(progress as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("passes existing errors as sanitized progress errors", () => {
    renderChat({
      progressStatus: "submitting",
      error: "network_error /api/requests request_id=req_123",
    });
    const progress = document.querySelector(".agent-progress") as HTMLElement;

    expect(within(progress).getByRole("heading", { name: "正在確認送出結果" })).toBeInTheDocument();
    expect(within(progress).queryByText(/network_error|request_id=req_123/)).not.toBeInTheDocument();
  });
});
