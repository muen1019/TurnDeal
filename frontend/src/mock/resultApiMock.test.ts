import { describe, expect, it } from "vitest";
import { decisionResponse, validateSnapshot } from "../api/client";
import { createMockApi, mockStageForElapsed } from "../../mock/resultApiMock";
import type { RequestSnapshot } from "../contract.generated";

const body = {
  intent_md: "# 購買需求\n無線靜音滑鼠，含稅運 1000 元內，7 天內到貨。",
  preference_md: "# 偏好\n只接受黑色，偏好小尺寸及左右對稱。",
};

const snapshot = (value: unknown) => validateSnapshot(value) as RequestSnapshot;

describe("dev result API mock", () => {
  it("returns a v0.3 formatting snapshot and then the deterministic ready fixture", () => {
    let clock = 0;
    const api = createMockApi({ now: () => clock });

    const created = api.create(body, "create-1");
    expect(created.status).toBe(202);
    const formatting = snapshot(created.body);
    expect(formatting.status).toBe("formatting");
    expect(formatting.documents.intent_md).toBe(body.intent_md);

    clock = 9900;
    expect(snapshot(api.get(formatting.request_id).body).status).toBe("formatting");

    clock = 10000;
    const ready = snapshot(api.get(formatting.request_id).body);
    expect(ready.status).toBe("awaiting_user");
    expect(ready.request_id).toBe(formatting.request_id);
    expect(ready.documents).toEqual(formatting.documents);
    expect(ready.seller_agents).toHaveLength(5);
    expect(ready.ranked_offers.length).toBeGreaterThan(0);
  });

  it("serves a mock-only progress endpoint across the 10 second stage timeline", () => {
    let clock = 0;
    const api = createMockApi({ now: () => clock });
    const created = snapshot(api.create(body, "progress-key").body);

    expect(api.progress(created.request_id).body).toEqual({
      request_id: created.request_id,
      sequence: 0,
      stage: "formatting",
    });

    clock = 5000;
    expect(api.progress(created.request_id).body).toEqual({
      request_id: created.request_id,
      sequence: 2,
      stage: "negotiating",
    });

    clock = 10000;
    expect(api.progress(created.request_id).body).toEqual({
      request_id: created.request_id,
      sequence: 4,
      stage: "awaiting_user",
    });
  });

  it("keeps idempotent create replay exact and rejects competing body reuse", () => {
    const api = createMockApi({ now: () => 0 });
    const first = api.create(body, "same-key");
    const replay = api.create({ preference_md: body.preference_md, intent_md: body.intent_md }, "same-key");
    expect(replay).toEqual(first);

    const conflict = api.create({ ...body, intent_md: `${body.intent_md}\n加一行` }, "same-key");
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ error: { code: "idempotency_conflict" } });
  });

  it("supports selectable failed and needs_clarification terminal snapshots and progress stages", () => {
    const failedApi = createMockApi({ now: () => 3000, readyAfterMs: 0, scenario: "failed" });
    const failedCreate = snapshot(failedApi.create(body, "failed-key").body);
    const failed = snapshot(failedApi.get(failedCreate.request_id).body);
    expect(failed.status).toBe("failed");
    expect(failed.error?.code).toBe("failed");
    expect(failedApi.progress(failedCreate.request_id).body).toEqual({
      request_id: failedCreate.request_id,
      sequence: 5,
      stage: "failed",
    });

    const clarifyApi = createMockApi({ now: () => 3000, readyAfterMs: 0, scenario: "needs_clarification" });
    const clarifyCreate = snapshot(clarifyApi.create(body, "clarify-key").body);
    const clarify = snapshot(clarifyApi.get(clarifyCreate.request_id).body);
    expect(clarify.status).toBe("needs_clarification");
    expect(clarify.error?.fields).toEqual(["intent_md"]);
    expect(clarifyApi.progress(clarifyCreate.request_id).body).toEqual({
      request_id: clarifyCreate.request_id,
      sequence: 6,
      stage: "needs_clarification",
    });
  });

  it("supports selectable needs_confirmation and no_match boundary stages", () => {
    const confirmationApi = createMockApi({ now: () => 3000, readyAfterMs: 0, scenario: "needs_confirmation" });
    const confirmationCreate = snapshot(confirmationApi.create(body, "confirmation-key").body);
    const confirmation = snapshot(confirmationApi.get(confirmationCreate.request_id).body);
    expect(confirmation.status).toBe("needs_confirmation");
    expect(confirmation.confirmation_offer_ids).toHaveLength(1);
    expect(confirmationApi.progress(confirmationCreate.request_id).body).toEqual({
      request_id: confirmationCreate.request_id,
      sequence: 7,
      stage: "needs_confirmation",
    });

    const noMatchApi = createMockApi({ now: () => 3000, readyAfterMs: 0, scenario: "no_match" });
    const noMatchCreate = snapshot(noMatchApi.create(body, "no-match-key").body);
    const noMatch = snapshot(noMatchApi.get(noMatchCreate.request_id).body);
    expect(noMatch.status).toBe("no_match");
    expect(noMatch.error?.code).toBe("no_match");
    expect(noMatchApi.progress(noMatchCreate.request_id).body).toEqual({
      request_id: noMatchCreate.request_id,
      sequence: 8,
      stage: "no_match",
    });
  });

  it("validates accept and reject responses against the shared contract", () => {
    let clock = 0;
    const api = createMockApi({ now: () => clock });
    const created = snapshot(api.create(body, "decision-key").body);
    clock = 10000;
    const ready = snapshot(api.get(created.request_id).body);
    const offerId = ready.ranked_offers[0].offer_id;

    const accepted = decisionResponse(api.decide(created.request_id, { action: "accept", offer_id: offerId }, "accept-key").body);
    expect(accepted).toMatchObject({ action: "accept", request_id: created.request_id, selected_offer_id: offerId });

    const rejectedApi = createMockApi({ now: () => clock });
    const rejectedCreate = snapshot(rejectedApi.create(body, "reject-create").body);
    clock += 10000;
    const rejected = decisionResponse(
      rejectedApi.decide(rejectedCreate.request_id, { action: "reject", feedback: "不要滑鼠墊" }, "reject-key").body,
    );
    expect(rejected).toMatchObject({
      action: "reject",
      request_id: rejectedCreate.request_id,
      feedback: "不要滑鼠墊",
      source_documents: rejectedCreate.documents,
    });
  });

  it("exposes a stable mock stage timeline for UI progress labels without adding a wire field", () => {
    expect(mockStageForElapsed(0)).toBe("formatting");
    expect(mockStageForElapsed(2500)).toBe("orchestrating");
    expect(mockStageForElapsed(5000)).toBe("negotiating");
    expect(mockStageForElapsed(7500)).toBe("evaluating");
    expect(mockStageForElapsed(10000)).toBe("awaiting_user");
  });
});
