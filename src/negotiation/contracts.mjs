import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const commerceSchema = JSON.parse(readFileSync(new URL('../../contracts/a2a-commerce.v0.3.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(commerceSchema);
export function check(type, value) {
  const validate = ajv.getSchema(`${commerceSchema.$id}#/$defs/${type}`);
  if (!validate || !validate(value)) throw new Error(`Invalid ${type}`);
  return value;
}
export function immutable(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
export const copy = value => structuredClone(value);
export const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
