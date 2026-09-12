import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type {ValidateFunction} from 'ajv';
import type {ImprovementContext, ImprovementResult, RevisionProposal} from './types.js';
import {contractSchema} from '../schema.js';

const text = {type: 'string', maxLength: 20000};
const id = {type: 'string', minLength: 1, maxLength: 200};
const nullableText = {anyOf: [text, {type: 'null'}]};
const integer = {type: 'integer', minimum: 0};
const list = (items: unknown, maxItems = 100) => ({type: 'array', items, maxItems});
const object = <T extends Record<string, unknown>>(properties: T) => ({type: 'object', properties, required: Object.keys(properties), additionalProperties: false});
const scope = {type:'string',enum: ['all_categories', 'category:mouse', 'category:mouse_pad']};
const change = object({target: {type:'string',const: 'intent_md'}, before: nullableText, after: text, evidence_ids: list(id)});
const preferenceDocument = object({revision: integer, markdown: text, entries: list(object({preference_id: id, scope, value: text}))});
const documents = object({revision: {type:'integer',minimum:1},intent_md:text,preference_md:text});

export const proposalSchema = object({
  intent: object({markdown: text, changes: list(change)}),
  preference: {anyOf: [object({action: {type:'string',const: 'keep'}}), object({
    action: {type:'string',const: 'patch'}, base_revision: integer,
    operations: list(object({operation: {type:'string',enum: ['add', 'replace', 'remove']}, preference_id: id,
      before: nullableText, value: nullableText, scope, evidence_id: id, explicit_quote: text})),
  })]},
  outcome: {type:'string',enum: ['ready', 'needs_clarification']}, questions: list(text, 10),
});

const Ajv = AjvModule as unknown as new(options: object) => {compile(schema: unknown): ValidateFunction;addSchema(schema: unknown):unknown};
const ajv = new Ajv({strict: false, allErrors: true});
(addFormatsModule as unknown as (instance:unknown)=>void)(ajv);
ajv.addSchema(contractSchema);
const proposalValidator = ajv.compile(proposalSchema);
// The canonical NormalizedIntent shape is checked by the existing shared-contract validator at context assembly.
const contextValidator = ajv.compile(object({
  improvement_id: id, buyer_id: id, parent_request_id: id, root_request_id: id,
  source_documents: documents, hard_constraints: {$ref:`${contractSchema.$id}#/$defs/NormalizedIntent`},
  request_preference_revision: {anyOf:[integer,{type:'null'}]}, global_preference: preferenceDocument,
  rejected_offers: list(object({offer_id:id,items:list(object({product_id:id,quantity:{type:'integer',minimum:1}})),total_price_twd:integer,delivery_days:integer,terms_id:id,signature:id})),
  evidence:list(object({evidence_id:id,text,kind:{enum:['user_feedback','rejection']}})),
  history:list(object({improvement_id:id,status:id,intent_md:text}),20),
}));
const resultValidator = ajv.compile(object({
  improvement_id:id,parent_request_id:id,status:{enum:['ready','needs_clarification']},intent_revision_id:id,
  intent_state:{enum:['ready','draft']},documents,preference_revision:integer,preference_updated:{type:'boolean'},
  changes:list(change),questions:list(text,10),audit:list(id),provider:{enum:['llm','deterministic','fallback']},
}));
function validate<T>(validator: ValidateFunction, value: unknown, name: string): T {
  if (!validator(value)) throw new Error(`${name}_invalid:${(validator.errors??[]).map(e=>e.keyword).join(',')}`);
  return structuredClone(value) as T;
}
export const parseProposal = (value: unknown) => validate<RevisionProposal>(proposalValidator,value,'proposal');
export const parseContext = (value: unknown) => validate<ImprovementContext>(contextValidator,value,'context');
export const parseResult = (value: unknown) => validate<ImprovementResult>(resultValidator,value,'result');
