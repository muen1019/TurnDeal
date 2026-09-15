import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../contracts/a2a-commerce.v0.3.schema.json";
import { apiPaths } from "./routes.generated";
export { apiPaths };
export const decisionPath = (id: string) => apiPaths.submitDecision.replace("{request_id}", encodeURIComponent(id));
import type {
  CreateRequest,
  DecisionResult,
  RequestSnapshot,
} from "../contract.generated";

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);

const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter = 1,
  ) {
    super(message);
  }
}

export function validateWire<T>(name: string, value: unknown): T {
  const ref = `${schema.$id}#/$defs/${name}`;
  let validate = validators.get(ref);

  if (!validate) {
    validate = ajv.getSchema(ref) ?? ajv.compile({ $ref: ref });
    validators.set(ref, validate);
  }

  if (!validate(value)) {
    throw new ApiFailure(0, "invalid_response", "回傳資料格式不完整，已停用決策。請核對服務版本並重試。");
  }

  return value as T;
}

export function validateSnapshot(value: unknown): RequestSnapshot {
  const snapshot = validateWire<RequestSnapshot>("RequestSnapshot", value);

  const decision = snapshot.decision;
  if (
    decision &&
    (decision.request_id !== snapshot.request_id ||
      (decision.action === "accept" &&
        (decision.selected_offer_id !== snapshot.selected_offer_id ||
          decision.expires_at !==
            snapshot.offers.find((offer) => offer.offer_id === decision.selected_offer_id)?.expires_at)) ||
      (decision.action === "reject" &&
        (decision.source_documents.revision !== snapshot.documents.revision ||
          decision.source_documents.intent_md !== snapshot.documents.intent_md ||
          decision.source_documents.preference_md !== snapshot.documents.preference_md)))
  ) {
    throw new ApiFailure(0, "invalid_response", "決策與原始需求不一致，請重新核對。");
  }

  const offerIds = snapshot.offers.map((offer) => offer.offer_id);
  const sellerIds = snapshot.seller_agents.map((seller) => seller.seller_id);
  const rankedIds = snapshot.ranked_offers.map((rank) => rank.offer_id);
  const offerIdSet = new Set(offerIds);
  const sellerIdSet = new Set(sellerIds);
  const rankedIdSet = new Set(rankedIds);

  if (
    offerIdSet.size !== offerIds.length ||
    sellerIdSet.size !== sellerIds.length ||
    rankedIdSet.size !== rankedIds.length ||
    snapshot.offers.some((offer) => !sellerIdSet.has(offer.seller_id)) ||
    snapshot.ranked_offers.some(
      (rank, index) =>
        rank.rank !== index + 1 ||
        !snapshot.offers.some(
          (offer) =>
            offer.offer_id === rank.offer_id &&
            offer.eligibility.status === "eligible",
        ),
    ) ||
    snapshot.confirmation_offer_ids.some((offerId) => !offerIdSet.has(offerId)) ||
    (snapshot.selected_offer_id !== null && !offerIdSet.has(snapshot.selected_offer_id))
  ) {
    throw new ApiFailure(0, "invalid_response", "方案排名或資料關聯不一致，已停用決策。");
  }

  if (
    snapshot.status === "awaiting_user" &&
    snapshot.offers
      .filter((offer) => offer.eligibility.status === "eligible")
      .some((offer) => !rankedIdSet.has(offer.offer_id))
  ) {
    throw new ApiFailure(0, "invalid_response", "方案排名不完整，已停用決策。");
  }

  return snapshot;
}

export async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const abort = () => controller.abort();

  init.signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(path, { ...init, signal: controller.signal });
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      throw new ApiFailure(response.status, "invalid_response", "無法讀取服務回應，請核對原提交結果。");
    }

    if (!response.ok) {
      const error = body as { error?: { code?: string; message?: string } };
      throw new ApiFailure(
        response.status,
        error.error?.code ?? "service_error",
        error.error?.message ?? "服務暫時無法使用，請稍後重試。",
        Math.max(1, Number(response.headers.get("Retry-After")) || 1),
      );
    }

    return body;
  } catch (error) {
    if (error instanceof ApiFailure) {
      throw error;
    }

    throw new ApiFailure(0, "network_error", "連線中斷或逾時，請核對原提交結果。");
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

export async function getSnapshot(id: string, signal?: AbortSignal) {
  const snapshot = validateSnapshot(
    await request(apiPaths.getRequestResult.replace("{request_id}", encodeURIComponent(id)), { signal }),
  );

  if (snapshot.request_id !== id) {
    throw new ApiFailure(0, "invalid_response", "回傳的需求編號不一致。");
  }

  return snapshot;
}

export async function postJournal(path: string, body: unknown, key: string) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

export function composeRequest(
  intent: string,
  preference: string,
  message: string,
): CreateRequest {
  const text = message.trim();

  if (!text || [...text].length > 2000) {
    throw new Error("需求必須為 1–2000 個 Unicode 字元。");
  }

  return validateWire<CreateRequest>("CreateRequest", {
    intent_md: intent.trim() ? `${intent}\n\n## 本次購買需求\n${text}` : text,
    preference_md: preference,
  });
}

export function decisionResponse(value: unknown) {
  return validateWire<DecisionResult>("DecisionResult", value);
}
