// Backend allowlist; a UI selection is a model ID, never an endpoint or credential.
export const DEFAULT_MODEL='gpt-5.6-sol';
export const MODELS=['gpt-5.6-sol','gpt-4.1','gpt-4.1-mini'];
export function selectedModel(value){
  const model=value??process.env.OFFERMESH_MODEL??DEFAULT_MODEL;
  if(!MODELS.includes(model))throw new Error('unsupported_model');
  return model;
}
// Current calls are small schema extractions/decisions, with no cross-call reasoning.
// Start at none to preserve non-reasoning latency/output budgets; no pro/fast mode.
export const modelParameters=model=>model==='gpt-5.6-sol'?{reasoning:{effort:'none'}}:{};
