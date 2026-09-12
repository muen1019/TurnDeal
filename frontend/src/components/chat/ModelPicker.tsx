import type {LlmModel} from '../../contract.generated';
export const modelChoices: LlmModel[]=['gpt-5.6-sol','gpt-4.1','gpt-4.1-mini'];
export function initialModel():LlmModel {
  try {const value=sessionStorage.getItem('offermesh.model');if(modelChoices.includes(value as LlmModel))return value as LlmModel;}catch{}
  return 'gpt-5.6-sol';
}
export function ModelPicker({value,onChange}:{value:LlmModel;onChange:(model:LlmModel)=>void}) {
  return <select className="model-picker" aria-label="新需求使用的模型" title="只影響新需求；補充回答沿用該輪模型。Sol 品質優先，Mini 費用較低。" value={value} onChange={e=>onChange(e.target.value as LlmModel)}>
    <option value="gpt-5.6-sol">GPT-5.6 Sol</option><option value="gpt-4.1">GPT-4.1</option><option value="gpt-4.1-mini">GPT-4.1 Mini</option>
  </select>;
}
