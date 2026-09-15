import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAgentProgress } from "./useAgentProgress";

describe("useAgentProgress", () => {
  it("derives progress exclusively from the real RequestSnapshot status", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ status }) => useAgentProgress("req_real", status),
      { initialProps: { status: "formatting" as "formatting" | "negotiating" | "awaiting_user" } },
    );

    expect(result.current).toEqual({ stage: "formatting", error: undefined });
    rerender({ status: "negotiating" });
    expect(result.current).toEqual({ stage: "negotiating", error: undefined });
    rerender({ status: "awaiting_user" });
    expect(result.current).toEqual({ stage: "awaiting_user", error: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("hides progress without a runtime snapshot status", () => {
    const { result } = renderHook(() => useAgentProgress(null, undefined));
    expect(result.current).toEqual({ stage: undefined, error: undefined });
  });
});
