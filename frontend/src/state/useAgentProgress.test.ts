import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentProgress } from "./useAgentProgress";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_OFFERMESH_MOCK", "true");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("useAgentProgress", () => {
  it("uses contract snapshots without requesting a progress endpoint in normal mode", () => {
    vi.stubEnv("VITE_OFFERMESH_MOCK", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ status }) => useAgentProgress("req_real", status),
      { initialProps: { status: "formatting" as "formatting" | "awaiting_user" } },
    );

    expect(result.current).toEqual({ stage: "formatting", error: undefined });
    rerender({ status: "awaiting_user" });
    expect(result.current).toEqual({ stage: "awaiting_user", error: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the mock progress endpoint when mock mode is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ request_id: "req_mock", sequence: 2, stage: "negotiating" }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentProgress("req_mock", "formatting"));
    await flushAsync();

    expect(result.current.stage).toBe("negotiating");
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/__mock/requests/req_mock/progress", {
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight request when the request id changes and does not apply stale data across tabs", async () => {
    const first = createDeferred<Response>();
    const second = createDeferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_path: string, init?: RequestInit) => {
        first.signal = init?.signal ?? undefined;
        return first.promise;
      })
      .mockImplementationOnce((_path: string, init?: RequestInit) => {
        second.signal = init?.signal ?? undefined;
        return second.promise;
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ requestId }) => useAgentProgress(requestId, "formatting"),
      { initialProps: { requestId: "req_1" as string | null } },
    );

    expect(first.signal?.aborted).toBe(false);
    rerender({ requestId: "req_2" });
    expect(first.signal?.aborted).toBe(true);
    expect(result.current).toEqual({ stage: "formatting", error: undefined });

    await act(async () => {
      first.resolve(json({ request_id: "req_1", sequence: 9, stage: "negotiating" }));
      await first.promise;
      await Promise.resolve();
    });
    expect(result.current).toEqual({ stage: "formatting", error: undefined });

    await act(async () => {
      second.resolve(json({ request_id: "req_2", sequence: 0, stage: "orchestrating" }));
      await second.promise;
    });
    await flushAsync();
    expect(result.current.stage).toBe("orchestrating");
    expect(result.current.error).toBeUndefined();
  });

  it("ignores sequence rollback and keeps the newest known stage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ request_id: "req_1", sequence: 3, stage: "negotiating" }))
        .mockResolvedValueOnce(json({ request_id: "req_1", sequence: 2, stage: "orchestrating" })),
    );

    const { result } = renderHook(() => useAgentProgress("req_1", "formatting"));

    await flushAsync();
    expect(result.current.stage).toBe("negotiating");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushAsync();

    expect(result.current.stage).toBe("negotiating");
  });

  it("falls back quietly to the snapshot status on 404 and stops retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentProgress("req_1", "formatting"));

    await flushAsync();
    expect(result.current.stage).toBe("formatting");
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets terminal snapshots win and does not poll", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentProgress("req_1", "awaiting_user"));

    expect(result.current).toEqual({ stage: "awaiting_user", error: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats accepted decisions as terminal and clears progress without polling", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAgentProgress("req_1", "accepted"));

    expect(result.current).toEqual({ stage: undefined, error: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not show completed progress before the ready snapshot arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ request_id: "req_1", sequence: 4, stage: "awaiting_user" })),
    );

    const { result } = renderHook(() => useAgentProgress("req_1", "formatting"));

    await flushAsync();
    expect(result.current.stage).toBe("evaluating");
  });

  it("surfaces a recoverable polling error and clears it on the next successful poll", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 500 }))
        .mockResolvedValueOnce(json({ request_id: "req_1", sequence: 1, stage: "orchestrating" })),
    );

    const { result } = renderHook(() => useAgentProgress("req_1", "formatting"));

    await flushAsync();
    expect(result.current.error).toBe("暫時無法更新進度");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushAsync();

    expect(result.current).toEqual({ stage: "orchestrating", error: undefined });
  });

  it("hides progress when there is no request id", () => {
    const { result } = renderHook(() => useAgentProgress(null, undefined));

    expect(result.current).toEqual({ stage: undefined, error: undefined });
  });
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject, signal: undefined as AbortSignal | undefined };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
