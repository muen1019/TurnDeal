import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentDefinitionEditor } from "./AgentDefinitionEditor";
import type { AgentDefinitionEditorProps, DefinitionTab } from "./types";

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<AgentDefinitionEditorProps> = {}) {
  return {
    intent: "# intent",
    preference: "free pad only",
    savedIntent: "# saved intent",
    savedPreference: "free pad only",
    activeTab: "intent" as DefinitionTab,
    onTabChange: vi.fn(),
    onIntentChange: vi.fn(),
    onPreferenceChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    saving: false,
    ...overrides,
  } satisfies AgentDefinitionEditorProps;
}

function renderEditor(overrides: Partial<AgentDefinitionEditorProps> = {}) {
  const props = baseProps(overrides);
  const view = render(<AgentDefinitionEditor {...props} />);
  return { props, ...view };
}

describe("AgentDefinitionEditor actions", () => {
  it("distinguishes request templates from durable preference writes", () => {
    const {rerender}=renderEditor();
    expect(screen.getByText(/此處是意圖模板/)).toBeInTheDocument();
    expect(screen.getByText(/目前不會更新 SQLite 長期偏好/)).toBeInTheDocument();
    rerender(<AgentDefinitionEditor {...baseProps({activeTab:'preference'})} />);
    expect(screen.getByText(/本輪例外不覆寫長期偏好/)).toBeInTheDocument();
    expect(screen.getByText(/仍會繼承後端已保存的商品偏好/)).toBeInTheDocument();
  });
  it("calls save and cancel for a valid dirty definition", () => {
    const { props } = renderEditor({ dirty: true });

    fireEvent.click(screen.getByRole("button", { name: /儲存設定/ }));
    fireEvent.click(screen.getByRole("button", { name: /取消變更/ }));

    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("allows empty intent for preference-only settings but blocks oversized documents", () => {
    const { props: empty, rerender } = renderEditor({ intent: "   ", dirty: true });
    const emptySave = screen.getByRole("button", { name: /儲存設定/ });

    expect(emptySave).toBeEnabled();
    fireEvent.click(emptySave);
    expect(empty.onSave).toHaveBeenCalledTimes(1);

    const tooLong = baseProps({ intent: "🐭".repeat(20001), dirty: true });
    rerender(<AgentDefinitionEditor {...tooLong} />);
    const longSave = screen.getByRole("button", { name: /儲存設定/ });

    expect(longSave).toBeDisabled();
    fireEvent.click(longSave);
    expect(tooLong.onSave).not.toHaveBeenCalled();
  });
});

describe("AgentDefinitionEditor tabs and controlled inputs", () => {
  it("moves focus with arrow keys and persists controlled text across tabs", () => {
    function Harness() {
      const [activeTab, setActiveTab] = useState<DefinitionTab>("intent");
      const [intent, setIntent] = useState("# intent");
      const [preference, setPreference] = useState("free pad only");

      return (
        <AgentDefinitionEditor
          {...baseProps({
            activeTab,
            intent,
            preference,
            onTabChange: setActiveTab,
            onIntentChange: setIntent,
            onPreferenceChange: setPreference,
          })}
        />
      );
    }

    render(<Harness />);

    const intentTab = screen.getByRole("tab", { name: /intent\.md/ });
    intentTab.focus();
    fireEvent.keyDown(intentTab, { key: "ArrowRight", code: "ArrowRight" });

    const preferenceTab = screen.getByRole("tab", { name: /preference\.md/ });
    expect(preferenceTab).toHaveFocus();
    expect(preferenceTab).toHaveAttribute("aria-selected", "true");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "free pad only\nno paid add-ons" },
    });
    expect(screen.getByRole("textbox")).toHaveValue("free pad only\nno paid add-ons");

    fireEvent.keyDown(preferenceTab, { key: "ArrowLeft", code: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /intent\.md/ })).toHaveFocus();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "# intent\nquiet mouse" },
    });
    expect(screen.getByRole("textbox")).toHaveValue("# intent\nquiet mouse");

    fireEvent.click(screen.getByRole("tab", { name: /preference\.md/ }));
    expect(screen.getByRole("textbox")).toHaveValue("free pad only\nno paid add-ons");
  });
});
