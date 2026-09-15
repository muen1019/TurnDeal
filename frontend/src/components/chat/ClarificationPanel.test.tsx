import {useState} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ClarificationPanel} from './ClarificationPanel';
import type {FormatterSummary} from '../../contract.generated';
afterEach(cleanup);
const formatter:FormatterSummary={provider:'openai',model:'gpt-4.1-mini',questions:[{question_id:'q_0',field:'color',text:'你想選什麼顏色？',suggestions:[{label:'藍色',value:'藍色',source:'preference'},{label:'紅色',value:'紅色',source:'preference'}]}]};
it('quick choices only fill the editable answer; explicit submit is required',()=>{
  const submit=vi.fn();
  function Harness(){const [answers,set]=useState<Record<string,string>>({});return <ClarificationPanel formatter={formatter} answers={answers} onAnswer={(id,value)=>set({...answers,[id]:value})} onSubmit={submit} busy={false} message="買滑鼠"/>;}
  render(<Harness/>);
  expect(screen.getByText(/LLM 已解析/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'繼續'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'藍色'}));
  expect(screen.getByRole('textbox')).toHaveValue('藍色');expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'白色也可以'}});
  expect(screen.getByRole('button',{name:'藍色'})).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByRole('button',{name:'繼續'}));expect(submit).toHaveBeenCalledTimes(1);
});
it('shows real fallback and blocks overlong or busy answers',()=>{
  const p={formatter:{...formatter,provider:'rules' as const,model:null},answers:{q_0:'x'.repeat(501)},onAnswer:vi.fn(),onSubmit:vi.fn(),busy:false,message:''};
  const {rerender}=render(<ClarificationPanel {...p}/>);
  expect(screen.getByText(/非 LLM 成功/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'繼續'})).toBeDisabled();
  rerender(<ClarificationPanel {...p} answers={{q_0:'紅色'}} busy/>);
  expect(screen.getByRole('textbox')).toBeDisabled();expect(screen.getByRole('button',{name:'正在送出…'})).toBeDisabled();
});
