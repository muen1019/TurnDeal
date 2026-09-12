import type { ErrorResponse } from "./types.js";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: string[];
  readonly headers: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: string[] = [], headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.headers = headers;
  }

  body(): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        fields: this.fields
      }
    };
  }
}

export function invalidRequest(message: string, fields: string[] = []): HttpError {
  return new HttpError(400, "invalid_request", message, fields);
}

export function notFound(): HttpError {
  return new HttpError(404, "not_found", "Resource was not found.", []);
}

export function stateConflict(message = "The request no longer allows that operation.", fields: string[] = []): HttpError {
  return new HttpError(409, "state_conflict", message, fields);
}

export function offerExpired(): HttpError {
  return new HttpError(410, "offer_expired", "The selected offer has expired.", ["offer_id"]);
}

export function inventoryUnavailable(): HttpError {
  return new HttpError(409, "inventory_unavailable", "The selected offer is no longer available.", ["offer_id"]);
}
