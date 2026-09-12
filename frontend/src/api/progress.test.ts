import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRequestProgress,
  ProgressFetchError,
  ProgressNotFound,
  validateRequestProgress,
} from "./progress";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request progress API", () => {
  it("validates the request id, non-negative sequence, and stage enum", () => {
    expect(validateRequestProgress({ request_id: "req_1", sequence: 0, stage: "formatting" }, "req_1")).toEqual({
      request_id: "req_1",
      sequence: 0,
      stage: "formatting",
    });

    expect(() => validateRequestProgress({ request_id: "other", sequence: 0, stage: "formatting" }, "req_1")).toThrow(
      ProgressFetchError,
    );
    expect(() => validateRequestProgress({ request_id: "req_1", sequence: -1, stage: "formatting" }, "req_1")).toThrow(
      ProgressFetchError,
    );
    expect(() => validateRequestProgress({ request_id: "req_1", sequence: 1.5, stage: "formatting" }, "req_1")).toThrow(
      ProgressFetchError,
    );
    expect(() => validateRequestProgress({ request_id: "req_1", sequence: 1, stage: "accepted" }, "req_1")).toThrow(
      ProgressFetchError,
    );
  });

  it("fetches through the progress endpoint and preserves the abort signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(json({ request_id: "req_1", sequence: 2, stage: "negotiating" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRequestProgress("req_1", controller.signal)).resolves.toMatchObject({
      request_id: "req_1",
      sequence: 2,
      stage: "negotiating",
    });

    expect(fetchMock).toHaveBeenCalledWith("/__mock/requests/req_1/progress", { signal: controller.signal });
  });

  it("treats 404 as a quiet not-implemented signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));

    await expect(getRequestProgress("req_missing")).rejects.toBeInstanceOf(ProgressNotFound);
  });

  it("uses a recoverable update error for server and JSON failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("nope", { status: 500 })));
    await expect(getRequestProgress("req_1")).rejects.toBeInstanceOf(ProgressFetchError);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("not json", { status: 200 })));
    await expect(getRequestProgress("req_1")).rejects.toBeInstanceOf(ProgressFetchError);
  });
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
