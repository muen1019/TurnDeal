import type { Plugin } from "vite";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../contracts/a2a-commerce.v0.3.schema.json";
import happyPath from "../../contracts/fixtures/happy-path.json";
import type {
  AcceptDecision,
  AcceptDecisionResult,
  ApiError,
  CreateRequest,
  DecisionResult,
  RejectDecision,
  RejectDecisionResult,
  RequestSnapshot,
} from "../src/contract.generated";

export type MockScenario = "success" | "failed" | "needs_clarification" | "needs_confirmation" | "no_match";
type JsonResult = { status: number; body: unknown };

interface MockRequestRecord {
  requestId: string;
  createdAt: number;
  scenario: MockScenario;
  decision: DecisionResult | null;
  formatting: RequestSnapshot;
}

export interface MockApiOptions {
  now?: () => number;
  readyAfterMs?: number;
  scenario?: MockScenario;
}

export interface MockProgressResponse {
  request_id: string;
  sequence: number;
  stage:
    | "formatting"
    | "orchestrating"
    | "negotiating"
    | "evaluating"
    | "awaiting_user"
    | "failed"
    | "needs_clarification"
    | "needs_confirmation"
    | "no_match";
}

const readyFixture = happyPath.snapshot as RequestSnapshot;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export const mockStageTimeline = [
  { name: "formatting", atMs: 0, label: "整理需求" },
  { name: "orchestrating", atMs: 2500, label: "選擇 Seller Agent" },
  { name: "negotiating", atMs: 5000, label: "同步議價" },
  { name: "evaluating", atMs: 7500, label: "評估優惠" },
  { name: "awaiting_user", atMs: 10000, label: "等待選擇" },
] as const;

export type MockStageName = (typeof mockStageTimeline)[number]["name"];

export function mockStageForElapsed(elapsedMs: number): MockStageName {
  return [...mockStageTimeline].reverse().find((stage) => elapsedMs >= stage.atMs)?.name ?? "formatting";
}

export function createMockApi(options: MockApiOptions = {}) {
  const now = options.now ?? Date.now;
  const readyAfterMs = options.readyAfterMs ?? 10000;
  const requests = new Map<string, MockRequestRecord>();
  const idempotency = new Map<string, { bodyJson: string; requestId: string }>();
  const decisionIdempotency = new Map<string, { bodyJson: string; result: DecisionResult }>();

  const create = (body: unknown, idempotencyKey: string | null, url = new URL("http://mock.local/api/requests")): JsonResult => {
    if (!idempotencyKey || [...idempotencyKey].length > 128) {
      return error(400, "invalid_request", "POST requires Idempotency-Key (1–128 characters).", ["Idempotency-Key"]);
    }

    const validBody = validate<CreateRequest>("CreateRequest", body);
    if (!validBody.ok) return validBody.error;
    if(validBody.value.clarification||validBody.value.refinement)return error(400,'invalid_request','問答需要使用整合 runtime，固定預覽不會解析回答。',['clarification']);

    const bodyJson = canonicalJson(validBody.value);
    const replay = idempotency.get(idempotencyKey);
    if (replay) {
      if (replay.bodyJson !== bodyJson) {
        return error(409, "idempotency_conflict", "Idempotency-Key was already used with a different request body.", []);
      }
      return { status: 202, body: requests.get(replay.requestId)!.formatting };
    }

    const requestId = `req_mock_${globalThis.crypto.randomUUID()}`;
    const formatting = validateOrThrow<RequestSnapshot>("RequestSnapshot", {
      request_id: requestId,
      root_request_id: requestId,
      parent_request_id: null,
      status: "formatting",
      documents: {
        revision: 1,
        intent_md: validBody.value.intent_md,
        preference_md: validBody.value.preference_md ?? "",
      },
      intent: null,
      seller_agents: [],
      discovery_exclusions: [],
      sponsored_placement: null,
      offers: [],
      ranked_offers: [],
      confirmation_offer_ids: [],
      selected_offer_id: null,
      next_request_id: null,
      error: null,
      decision: null,
    });

    requests.set(requestId, {
      requestId,
      createdAt: now(),
      scenario: scenarioFromQuery(url, options.scenario),
      decision: null,
      formatting,
    });
    idempotency.set(idempotencyKey, { bodyJson, requestId });
    return { status: 202, body: formatting };
  };

  const get = (requestId: string): JsonResult => {
    const record = requests.get(requestId);
    if (!record) return error(404, "not_found", "Request not found.", ["request_id"]);
    if (record.decision) return { status: 200, body: snapshotWithDecision(record) };

    const elapsed = now() - record.createdAt;
    if (record.scenario === "failed" && elapsed >= readyAfterMs) {
      return { status: 200, body: terminalSnapshot(record, "failed") };
    }
    if (record.scenario === "needs_clarification" && elapsed >= readyAfterMs) {
      return { status: 200, body: terminalSnapshot(record, "needs_clarification") };
    }
    if (record.scenario === "needs_confirmation" && elapsed >= readyAfterMs) {
      return { status: 200, body: needsConfirmationSnapshot(record) };
    }
    if (record.scenario === "no_match" && elapsed >= readyAfterMs) {
      return { status: 200, body: terminalSnapshot(record, "no_match") };
    }
    if (elapsed >= readyAfterMs) {
      return { status: 200, body: readySnapshot(record) };
    }
    return { status: 200, body: record.formatting };
  };

  const decide = (requestId: string, body: unknown, idempotencyKey: string | null): JsonResult => {
    if (!idempotencyKey || [...idempotencyKey].length > 128) {
      return error(400, "invalid_request", "POST requires Idempotency-Key (1–128 characters).", ["Idempotency-Key"]);
    }

    const record = requests.get(requestId);
    if (!record) return error(404, "not_found", "Request not found.", ["request_id"]);
    const replayKey = `${requestId}:${idempotencyKey}`;
    const bodyJson = canonicalJson(body);
    const replay = decisionIdempotency.get(replayKey);
    if (replay) {
      if (replay.bodyJson !== bodyJson) {
        return error(409, "idempotency_conflict", "Idempotency-Key was already used with a different decision body.", []);
      }
      return { status: 200, body: replay.result };
    }
    const current = get(requestId).body as RequestSnapshot | { error: ApiError };
    if (!("status" in current) || !["awaiting_user", "needs_clarification", "needs_confirmation", "no_match"].includes(current.status)) {
      return error(409, "state_conflict", "Request is not awaiting a user decision.", []);
    }

    if (isAccept(body)) {
      const selected = current.offers.find((offer) => offer.offer_id === body.offer_id && offer.eligibility.status === "eligible");
      if (!selected) return error(409, "state_conflict", "Offer is not eligible.", ["offer_id"]);
      const result = validateOrThrow<AcceptDecisionResult>("AcceptDecisionResult", {
        action: "accept",
        request_id: requestId,
        status: "accepted",
        selected_offer_id: selected.offer_id,
        expires_at: selected.expires_at,
      });
      record.decision = result;
      decisionIdempotency.set(replayKey, { bodyJson, result });
      return { status: 200, body: result };
    }

    const reject = validate<RejectDecision>("RejectDecision", body);
    if (!reject.ok) return reject.error;
    const result = validateOrThrow<RejectDecisionResult>("RejectDecisionResult", {
      action: "reject",
      request_id: requestId,
      status: "rejected",
      feedback: reject.value.feedback,
      source_documents: record.formatting.documents,
    });
    record.decision = result;
    decisionIdempotency.set(replayKey, { bodyJson, result });
    return { status: 200, body: result };
  };

  const progress = (requestId: string): JsonResult => {
    const record = requests.get(requestId);
    if (!record) return error(404, "not_found", "Request not found.", ["request_id"]);
    const elapsed = Math.max(0, now() - record.createdAt);
    const stage = progressStage(record, elapsed, readyAfterMs);

    return {
      status: 200,
      body: {
        request_id: requestId,
        sequence: sequenceForStage(stage),
        stage,
      } satisfies MockProgressResponse,
    };
  };

  return {
    create,
    get,
    decide,
    progress,
    stageFor: (requestId: string) => {
      const record = requests.get(requestId);
      return record ? mockStageForElapsed(now() - record.createdAt) : null;
    },
  };
}

export function createOfferMeshMockPlugin(options: MockApiOptions = {}): Plugin {
  const api = createMockApi(options);
  return {
    name: "offermesh-dev-mock-api",
    configureServer(server) {
      server.middlewares.use("/__mock/requests", (req, res, next) => {
        const parts = (req.url ?? "").split("?")[0].split("/").filter(Boolean);
        if (req.method === "GET" && parts.length === 2 && parts[1] === "progress") {
          return send(res, api.progress(decodeURIComponent(parts[0])));
        }
        next();
      });
      server.middlewares.use("/api", async (req, res, next) => {
        if (!req.url || !req.method) return next();
        const url = new URL(req.url, "http://mock.local/api");
        const parts = url.pathname.split("/").filter(Boolean);
        const idempotencyKey = Array.isArray(req.headers["idempotency-key"])
          ? req.headers["idempotency-key"][0]
          : (req.headers["idempotency-key"] ?? null);

        try {
          if (req.method === "POST" && parts.length === 1 && parts[0] === "requests") {
            return send(res, api.create(await readJson(req), idempotencyKey, url));
          }
          if (req.method === "GET" && parts.length === 2 && parts[0] === "requests") {
            const requestId = decodeURIComponent(parts[1]);
            const result = api.get(requestId);
            const stage = api.stageFor(requestId);
            if (stage) res.setHeader("X-OfferMesh-Mock-Stage", stage);
            return send(res, result);
          }
          if (req.method === "POST" && parts.length === 3 && parts[0] === "requests" && parts[2] === "decisions") {
            return send(res, api.decide(decodeURIComponent(parts[1]), await readJson(req), idempotencyKey));
          }
          return next();
        } catch {
          return send(res, error(400, "invalid_request", "Invalid JSON or oversized request body.", ["body"]));
        }
      });
    },
  };
}

function scenarioFromQuery(url: URL, fallback: MockScenario | undefined): MockScenario {
  const value = url.searchParams.get("scenario") ?? fallback ?? "success";
  return isScenario(value) ? value : "success";
}

function isScenario(value: string): value is MockScenario {
  return ["success", "failed", "needs_clarification", "needs_confirmation", "no_match"].includes(value);
}

function readySnapshot(record: MockRequestRecord): RequestSnapshot {
  const snapshot = structuredClone(readyFixture) as RequestSnapshot;
  snapshot.request_id = record.requestId;
  snapshot.root_request_id = record.requestId;
  snapshot.parent_request_id = null;
  snapshot.status = "awaiting_user";
  snapshot.documents = record.formatting.documents;
  snapshot.selected_offer_id = null;
  snapshot.next_request_id = null;
  snapshot.error = null;
  snapshot.decision = null;
  return validateOrThrow("RequestSnapshot", snapshot);
}

function terminalSnapshot(record: MockRequestRecord, status: "failed" | "needs_clarification" | "no_match"): RequestSnapshot {
  return validateOrThrow("RequestSnapshot", {
    ...record.formatting,
    status,
    error: {
      code: status,
      message: terminalMessage(status),
      fields: status === "needs_clarification" ? ["intent_md"] : [],
    },
  });
}

function needsConfirmationSnapshot(record: MockRequestRecord): RequestSnapshot {
  const snapshot = readySnapshot(record);
  return validateOrThrow("RequestSnapshot", {
    ...snapshot,
    status: "needs_confirmation",
    ranked_offers: [],
    confirmation_offer_ids: [snapshot.offers[0].offer_id],
    selected_offer_id: null,
    error: null,
    decision: null,
  });
}

function snapshotWithDecision(record: MockRequestRecord): RequestSnapshot {
  const base = record.decision?.action === "accept" ? readySnapshot(record) : getReadyOrTerminal(record);
  if (record.decision?.action === "accept") {
    return validateOrThrow("RequestSnapshot", {
      ...base,
      status: "accepted",
      selected_offer_id: record.decision.selected_offer_id,
      error: null,
      decision: record.decision,
    });
  }
  return validateOrThrow("RequestSnapshot", {
    ...base,
    status: "rejected",
    selected_offer_id: null,
    error: null,
    decision: record.decision,
  });
}

function getReadyOrTerminal(record: MockRequestRecord) {
  if (record.scenario === "needs_clarification") return terminalSnapshot(record, "needs_clarification");
  if (record.scenario === "failed") return terminalSnapshot(record, "failed");
  if (record.scenario === "needs_confirmation") return needsConfirmationSnapshot(record);
  if (record.scenario === "no_match") return terminalSnapshot(record, "no_match");
  return readySnapshot(record);
}

function isAccept(body: unknown): body is AcceptDecision {
  return Boolean(body && typeof body === "object" && "action" in body && body.action === "accept");
}

function progressStage(
  record: MockRequestRecord,
  elapsed: number,
  readyAfterMs: number,
): MockProgressResponse["stage"] {
  if (elapsed < readyAfterMs) return mockStageForElapsed(elapsed);
  if (record.scenario === "failed") return "failed";
  if (record.scenario === "needs_clarification") return "needs_clarification";
  if (record.scenario === "needs_confirmation") return "needs_confirmation";
  if (record.scenario === "no_match") return "no_match";
  return "awaiting_user";
}

function sequenceForStage(stage: MockProgressResponse["stage"]) {
  return [
    "formatting",
    "orchestrating",
    "negotiating",
    "evaluating",
    "awaiting_user",
    "failed",
    "needs_clarification",
    "needs_confirmation",
    "no_match",
  ].indexOf(stage);
}

function terminalMessage(status: "failed" | "needs_clarification" | "no_match") {
  if (status === "failed") return "模擬處理暫時未完成，請稍後重試。";
  if (status === "no_match") return "目前沒有找到符合條件的示範優惠，請調整需求後再試一次。";
  return "示範需要更多需求細節，請確認預算、交期或滑鼠墊偏好。";
}

function validate<T>(name: string, value: unknown): { ok: true; value: T } | { ok: false; error: JsonResult } {
  const validator = validatorFor(name);
  if (validator(value)) return { ok: true, value: value as T };
  return { ok: false, error: error(400, "invalid_request", `Invalid ${name}.`, []) };
}

function validateOrThrow<T>(name: string, value: unknown): T {
  const validator = validatorFor(name);
  if (!validator(value)) {
    throw new Error(`Mock generated invalid ${name}: ${ajv.errorsText(validator.errors)}`);
  }
  return value as T;
}

function validatorFor(name: string) {
  const ref = `${schema.$id}#/$defs/${name}`;
  let validator = validators.get(ref);
  if (!validator) {
    validator = ajv.getSchema(ref) ?? ajv.compile({ $ref: ref });
    validators.set(ref, validator);
  }
  return validator;
}

function error(status: number, code: string, message: string, fields: string[]): JsonResult {
  return { status, body: { error: { code, message, fields } } };
}

function send(
  res: { statusCode: number; setHeader(name: string, value: string): void; end(value: string): void },
  result: JsonResult,
) {
  res.statusCode = result.status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(result.body));
}

async function readJson(req: AsyncIterable<Uint8Array | string>): Promise<unknown> {
  const decoder = new TextDecoder();
  let raw = "";
  for await (const chunk of req) {
    raw += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
  }
  raw += decoder.decode();
  return raw ? JSON.parse(raw) : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
