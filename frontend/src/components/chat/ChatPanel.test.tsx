import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import type { ChatPanelProps } from "./types";

afterEach(() => {
  cleanup();
});

function renderChat(overrides: Partial<ChatPanelProps> = {}) {
  const props: ChatPanelProps = {
    messages: [],
    status: "draft",
    draft: "quiet mouse",
    onDraft: vi.fn(),
    onSend: vi.fn(),
    onOpenOffers: vi.fn(),
    sending: false,
    unsavedDefinitions: false,
    ...overrides,
  };

  const view = render(<ChatPanel {...props} />);
  return { props, ...view };
}

describe("ChatPanel composer", () => {
  it("does not send for IME Enter or Shift+Enter", () => {
    const { props } = renderChat();
    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });

    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("sends exactly once for a normal Enter", () => {
    const { props } = renderChat();

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });

    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it("blocks drafts longer than 2000 Unicode code points and allows the trimmed boundary", () => {
    const boundary = ` ${"🐭".repeat(2000)} `;
    const { props, rerender } = renderChat({ draft: boundary });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    expect(props.onSend).toHaveBeenCalledTimes(1);

    vi.mocked(props.onSend).mockClear();
    rerender(<ChatPanel {...props} draft={"🐭".repeat(2001)} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });

    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /送出需求/ })).toBeDisabled();
  });

  it("allows submission with optional dirty definitions, but blocks empty drafts and pending sends", () => {
    const { props, rerender } = renderChat({
      unsavedDefinitions: true,
    });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });
    expect(props.onSend).toHaveBeenCalledTimes(1);

    vi.mocked(props.onSend).mockClear();
    rerender(<ChatPanel {...props} draft="   " />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", code: "Enter" });

    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /送出需求/ })).toBeDisabled();
    rerender(<ChatPanel {...props} sending={true} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /送出中/ })).toBeDisabled();
  });
});
