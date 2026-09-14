import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { contractFile } from "./paths.js";
import { invalidRequest } from "./httpError.js";

export type ValidatorName =
  | "ProductPreference"
  | "CreateRequest"
  | "AcceptDecision"
  | "RejectDecision"
  | "RedeemRequest"
  | "RequestSnapshot"
  | "AcceptDecisionResult"
  | "RejectDecisionResult"
  | "RedemptionReceipt"
  | "ErrorResponse";

const contractPath = contractFile("a2a-commerce.v0.3.schema.json");
export const contractSchema = JSON.parse(readFileSync(contractPath, "utf8"));

const AjvCtor = Ajv2020Module as unknown as new (options: Record<string, unknown>) => {
  addSchema: (schema: unknown, key?: string) => void;
  compile: (schema: unknown) => ValidateFunction;
};
const addFormats = addFormatsModule as unknown as (ajv: unknown) => void;

const ajv = new AjvCtor({
  allErrors: true,
  strict: false,
  validateFormats: true
});
addFormats(ajv);
ajv.addSchema(contractSchema, contractSchema.$id);

const validators = new Map<ValidatorName, ValidateFunction>();

export function validator(name: ValidatorName): ValidateFunction {
  const existing = validators.get(name);
  if (existing) {
    return existing;
  }

  const compiled = ajv.compile({
    $ref: `${contractSchema.$id}#/$defs/${name}`
  });
  validators.set(name, compiled);
  return compiled;
}

export function assertValid<T>(name: ValidatorName, value: unknown): T {
  const validate = validator(name);
  if (validate(value)) {
    return value as T;
  }

  const fields = [
    ...new Set(
      (validate.errors ?? []).map((error) => {
        const path = error.instancePath.replace(/^\//, "").replaceAll("/", ".");
        return path || error.params.missingProperty?.toString() || "body";
      })
    )
  ];
  throw invalidRequest(`Invalid ${name} payload.`, fields);
}

export function isValid(name: ValidatorName, value: unknown): boolean {
  return validator(name)(value);
}
