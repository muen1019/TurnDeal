export const REQUEST_PROGRESS_STAGES = [
  "formatting",
  "orchestrating",
  "negotiating",
  "evaluating",
  "awaiting_user",
  "failed",
  "needs_clarification",
  "needs_confirmation",
  "no_match",
] as const;

export type RequestProgressStage = (typeof REQUEST_PROGRESS_STAGES)[number];

export interface RequestProgress {
  request_id: string;
  sequence: number;
  stage: RequestProgressStage;
}

export class ProgressNotFound extends Error {
  constructor() {
    super("Request progress endpoint is not available.");
  }
}

export class ProgressFetchError extends Error {
  constructor(message = "暫時無法更新進度") {
    super(message);
  }
}

const stageSet = new Set<string>(REQUEST_PROGRESS_STAGES);

export async function getRequestProgress(requestId: string, signal?: AbortSignal) {
  let response: Response;

  try {
    response = await fetch(`/__mock/requests/${encodeURIComponent(requestId)}/progress`, {
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ProgressFetchError();
  }

  if (response.status === 404) {
    throw new ProgressNotFound();
  }

  if (!response.ok) {
    throw new ProgressFetchError();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProgressFetchError();
  }

  return validateRequestProgress(body, requestId);
}

export function validateRequestProgress(value: unknown, expectedRequestId: string): RequestProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProgressFetchError();
  }

  const candidate = value as Partial<RequestProgress>;
  if (
    candidate.request_id !== expectedRequestId ||
    typeof candidate.sequence !== "number" ||
    !Number.isInteger(candidate.sequence) ||
    candidate.sequence < 0 ||
    typeof candidate.stage !== "string" ||
    !stageSet.has(candidate.stage)
  ) {
    throw new ProgressFetchError();
  }

  return {
    request_id: candidate.request_id,
    sequence: candidate.sequence,
    stage: candidate.stage as RequestProgressStage,
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
