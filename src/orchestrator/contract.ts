import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const schema = JSON.parse(readFileSync(new URL('../../contracts/a2a-commerce.v0.3.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);
export function assertContract(name: string, value: unknown) {
  const validate = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!validate || !validate(value)) throw new Error(`invalid_contract:${name}: ${ajv.errorsText(validate?.errors)}`);
}
