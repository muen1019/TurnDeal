import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { isValid } from "../src/schema.js";
import type { Offer, RequestSnapshot } from "../src/types.js";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "offermesh-backend-"));
  createdDirs.push(dir);
  return join(dir, "state.sqlite");
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    intent_md: "# Request\nWireless silent mouse under TWD 1000, delivery within 7 days.",
    preference_md: "# Preferences\nPrefer black, small, and symmetrical. Free related accessories are okay.",
    ...overrides
  };
}

async function readySnapshot(app: Awaited<ReturnType<typeof createApp>>, requestId: string): Promise<RequestSnapshot> {
  for (let index = 0; index < 20; index += 1) {
    const response = await request(app).get(`/api/requests/${requestId}`).expect(200);
    if (response.body.status !== "formatting") {
      return response.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("request did not finish processing");
}

function offerEnding(snapshot: RequestSnapshot, suffix: string): Offer {
  const offer = snapshot.offers.find((item) => item.offer_id.endsWith(suffix));
  if (!offer) throw new Error(`missing offer ${suffix}`);
  return offer;
}

describe("OfferMesh backend API", () => {
  it("publishes request-scoped five-round offers and persists an accepted decision", async () => {
    const dbPath = tempDbPath();
    let currentTime = new Date("2026-09-12T02:00:00.000Z");
    const app = await createApp({ dbPath, now: () => currentTime });

    const created = await request(app).post("/api/requests").set("Idempotency-Key", "create-happy").send(createBody()).expect(202);
    expect(isValid("RequestSnapshot", created.body)).toBe(true);
    expect(created.body.status).toBe("formatting");

    const snapshot = await readySnapshot(app, created.body.request_id);
    expect(isValid("RequestSnapshot", snapshot)).toBe(true);
    expect(snapshot.status).toBe("awaiting_user");
    expect(snapshot.seller_agents).toHaveLength(5);
    expect(snapshot.offers).toHaveLength(24);

    const knownOfferIds = new Set(snapshot.offers.map((offer) => offer.offer_id));
    for (const seller of snapshot.seller_agents) {
      for (const round of seller.rounds) {
        for (const offerId of round.offer_ids) {
          expect(knownOfferIds.has(offerId)).toBe(true);
        }
      }
    }

    expect(snapshot.offers.filter((offer) => offer.round === 1 && offer.seller_id !== "seller_e").every((offer) => offer.eligibility.status === "rejected")).toBe(true);
    expect(snapshot.ranked_offers.map((offer) => offer.offer_id)).toEqual([
      offerEnding(snapshot, "offer_a_r5").offer_id,
      offerEnding(snapshot, "offer_c_standalone_r5").offer_id,
      offerEnding(snapshot, "offer_c_bundle_r5").offer_id,
      offerEnding(snapshot, "seller_d_r3").offer_id,
      offerEnding(snapshot, "seller_e_r1").offer_id,
      offerEnding(snapshot, "offer_b_r5").offer_id
    ]);
    expect(JSON.stringify(snapshot.ranked_offers)).not.toContain("campaign");

    const selectedOfferId = snapshot.ranked_offers[0].offer_id;
    const accepted = await request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "accept-happy")
      .send({ action: "accept", offer_id: selectedOfferId })
      .expect(200);
    expect(isValid("AcceptDecisionResult", accepted.body)).toBe(true);

    currentTime = new Date(Date.parse(offerEnding(snapshot, "offer_a_r5").expires_at) + 1000);
    const replay = await request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "accept-happy")
      .send({ action: "accept", offer_id: selectedOfferId })
      .expect(200);
    expect(replay.body).toEqual(accepted.body);

    const after = await request(app).get(`/api/requests/${snapshot.request_id}`).expect(200);
    expect(after.body.status).toBe("accepted");
    expect(after.body.decision).toEqual(accepted.body);
  });

  it("does not expose arbitrary CORS headers because Vite owns local proxying", async () => {
    const app = await createApp({ dbPath: tempDbPath(), now: () => new Date("2026-09-12T02:00:00.000Z") });
    const response = await request(app).get("/api/requests/missing").set("Origin", "https://example.invalid").expect(404);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects invalid input and unknown resources without trusting buyer_id", async () => {
    const app = await createApp({ dbPath: tempDbPath(), now: () => new Date("2026-09-12T02:00:00.000Z") });

    await request(app).post("/api/requests").send(createBody()).expect(400);
    await request(app).post("/api/requests").set("Idempotency-Key", "bad-create").send(createBody({ buyer_id: "other" })).expect(400);
    await request(app).post("/api/requests").set("Idempotency-Key", "unsupported").send({
      intent_md: "我要無線鍵盤，預算900元，七天內到貨。",
      preference_md: ""
    }).expect(202);

    const unsupported = await readySnapshot(app, (await request(app).post("/api/requests").set("Idempotency-Key", "unsupported-2").send({
      intent_md: "我要無線鍵盤，預算900元，七天內到貨。",
      preference_md: ""
    }).expect(202)).body.request_id);
    expect(unsupported.status).toBe("needs_clarification");
    expect(unsupported.error?.code).toBe("needs_clarification");

    const missing = await request(app).get("/api/requests/missing_request").expect(404);
    expect(isValid("ErrorResponse", missing.body)).toBe(true);
    expect(missing.body.error.code).toBe("not_found");
  });

  it("rejects expired accepts while preserving the published snapshot", async () => {
    const dbPath = tempDbPath();
    let currentTime = new Date("2026-09-12T02:00:00.000Z");
    const app = await createApp({ dbPath, now: () => currentTime });
    const created = await request(app).post("/api/requests").set("Idempotency-Key", "create-expiry").send(createBody()).expect(202);
    const snapshot = await readySnapshot(app, created.body.request_id);
    const offerId = offerEnding(snapshot, "offer_a_r5").offer_id;

    currentTime = new Date(Date.parse(offerEnding(snapshot, "offer_a_r5").expires_at));
    const expired = await request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "accept-expired")
      .send({ action: "accept", offer_id: offerId })
      .expect(410);
    expect(expired.body.error.code).toBe("offer_expired");

    const after = await request(app).get(`/api/requests/${snapshot.request_id}`).expect(200);
    expect(after.body.status).toBe("awaiting_user");
    expect(after.body.selected_offer_id).toBeNull();
  });

  it("handles idempotency replay, conflicts, and in-progress duplicates", async () => {
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredGate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const reserved = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = await createApp({
      dbPath: tempDbPath(),
      now: () => new Date("2026-09-12T02:00:00.000Z"),
      afterIdempotencyReserved: async ({ key }) => {
        if (key === "slow-create") {
          entered?.();
          await reserved;
        }
      }
    });

    const first = new Promise<request.Response>((resolve, reject) => {
      request(app)
        .post("/api/requests")
        .set("Idempotency-Key", "slow-create")
        .send(createBody())
        .expect(202)
        .end((error, response) => (error ? reject(error) : resolve(response)));
    });
    await enteredGate;
    const duplicate = await request(app).post("/api/requests").set("Idempotency-Key", "slow-create").send(createBody()).expect(409);
    expect(duplicate.headers["retry-after"]).toBe("1");
    expect(duplicate.body.error.code).toBe("request_in_progress");
    release?.();

    const created = await first;
    const replay = await request(app).post("/api/requests").set("Idempotency-Key", "slow-create").send(createBody()).expect(202);
    expect(replay.body).toEqual(created.body);

    await request(app)
      .post("/api/requests")
      .set("Idempotency-Key", "slow-create")
      .send(createBody({ preference_md: "changed" }))
      .expect(409)
      .expect((response) => expect(response.body.error.code).toBe("idempotency_conflict"));
  });

  it("lets only one accept or reject decision commit", async () => {
    let releaseReject: (() => void) | undefined;
    const rejectGate = new Promise<void>((resolve) => {
      releaseReject = resolve;
    });
    const app = await createApp({
      dbPath: tempDbPath(),
      now: () => new Date("2026-09-12T02:00:00.000Z"),
      afterIdempotencyReserved: async ({ key }) => {
        if (key === "reject-race") await rejectGate;
      }
    });

    const created = await request(app).post("/api/requests").set("Idempotency-Key", "create-race").send(createBody()).expect(202);
    const snapshot = await readySnapshot(app, created.body.request_id);
    const reject = request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "reject-race")
      .send({ action: "reject", feedback: "預算改成900元，不需要滑鼠墊，七天內到貨。" });
    await new Promise((resolve) => setTimeout(resolve, 10));

    await request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "accept-race")
      .send({ action: "accept", offer_id: snapshot.ranked_offers[0].offer_id })
      .expect(200);
    releaseReject?.();
    await reject.expect(409).expect((response) => expect(response.body.error.code).toBe("state_conflict"));

    const after = await request(app).get(`/api/requests/${snapshot.request_id}`).expect(200);
    expect(after.body.status).toBe("accepted");
    expect(after.body.decision.action).toBe("accept");
  });

  it("validates actionable Chinese reject feedback without rewriting documents in v0.2", async () => {
    const app = await createApp({ dbPath: tempDbPath(), now: () => new Date("2026-09-12T02:00:00.000Z") });
    const created = await request(app).post("/api/requests").set("Idempotency-Key", "create-reject").send(createBody()).expect(202);
    const snapshot = await readySnapshot(app, created.body.request_id);

    const rejected = await request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "reject-chinese")
      .send({ action: "reject", feedback: "不要配件，預算改成800元，仍需七天內到貨。" })
      .expect(200);
    expect(isValid("RejectDecisionResult", rejected.body)).toBe(true);
    expect(rejected.body.status).toBe("rejected");
    expect(rejected.body.source_documents).toEqual(snapshot.documents);

    const after = await request(app).get(`/api/requests/${snapshot.request_id}`).expect(200);
    expect(after.body.status).toBe("rejected");
    expect(after.body.decision).toEqual(rejected.body);
  });

  it("saves ambiguous feedback verbatim for the Buyer Agent", async () => {
    const app = await createApp({ dbPath: tempDbPath(), now: () => new Date("2026-09-12T02:00:00.000Z") });
    const created = await request(app).post("/api/requests").set("Idempotency-Key", "create-rollback").send(createBody()).expect(202);
    const snapshot = await readySnapshot(app, created.body.request_id);

    await request(app)
      .post(`/api/requests/${snapshot.request_id}/decisions`)
      .set("Idempotency-Key", "reject-ambiguous")
      .send({ action: "reject", feedback: "ambiguous" })
      .expect(200);

    const after = await request(app).get(`/api/requests/${snapshot.request_id}`).expect(200);
    expect(after.body.status).toBe("rejected");
    expect(after.body.decision.feedback).toBe("ambiguous");
  });

  it("marks interrupted formatting work failed after restart", async () => {
    const dbPath = tempDbPath();
    const now = () => new Date("2026-09-12T02:00:00.000Z");
    const firstApp = await createApp({ dbPath, now, autoProcess: false });
    const created = await request(firstApp).post("/api/requests").set("Idempotency-Key", "create-restart").send(createBody()).expect(202);

    const restarted = await createApp({ dbPath, now, autoProcess: false });
    const snapshot = await request(restarted).get(`/api/requests/${created.body.request_id}`).expect(200);
    expect(snapshot.body.status).toBe("failed");
    expect(snapshot.body.error.code).toBe("processing_interrupted");
    expect(isValid("RequestSnapshot", snapshot.body)).toBe(true);
  });
});
