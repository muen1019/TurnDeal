import {useState} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ClarificationPanel} from './ClarificationPanel';
import type {FormatterSummary} from '../../contract.generated';
afterEach(cleanup);
const colorQuestion={question_id:'q_0',field:'color' as const,text:'你想選什麼顏色？',suggestions:[{label:'藍色',value:'藍色',source:'preference' as const},{label:'紅色',value:'紅色',source:'preference' as const}]};
const budgetQuestion={question_id:'q_1',field:'budget' as const,text:'含運的最高預算是多少元？',suggestions:[]};
const deliveryQuestion={question_id:'q_2',field:'delivery' as const,text:'最晚幾天到貨？',suggestions:[]};
const singleFormatter:FormatterSummary={provider:'openai',model:'gpt-4.1-mini',questions:[colorQuestion]};

function Harness({formatter,onSubmit}:{formatter:FormatterSummary;onSubmit:()=>void}){
  const [answers,set]=useState<Record<string,string>>({});
  return <ClarificationPanel formatter={formatter} answers={answers} onAnswer={(id,value)=>set(a=>({...a,[id]:value}))} onSubmit={onSubmit} busy={false} message="買滑鼠"/>;
}

it('shows one question at a time; a quick choice fills the editable answer and the final button submits',()=>{
  const submit=vi.fn();
  render(<Harness formatter={singleFormatter} onSubmit={submit}/>);
  expect(screen.getByText('第 1 / 1 題')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'送出'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'藍色'}));
  expect(screen.getByRole('textbox')).toHaveValue('藍色');expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'白色也可以'}});
  expect(screen.getByRole('button',{name:'藍色'})).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByRole('button',{name:'送出'}));expect(submit).toHaveBeenCalledTimes(1);
});

it('walks through several questions one at a time, only submitting after the last one', () => {
  const submit=vi.fn();
  const formatter:FormatterSummary={provider:'rules',model:null,questions:[colorQuestion,deliveryQuestion]};
  render(<Harness formatter={formatter} onSubmit={submit}/>);
  expect(screen.getByText('第 1 / 2 題')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'藍色'}));
  fireEvent.click(screen.getByRole('button',{name:'下一題'}));
  expect(screen.getByText('第 2 / 2 題')).toBeInTheDocument();
  expect(screen.getByText(deliveryQuestion.text)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'7 天內'})).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'7 天內'}));
  fireEvent.click(screen.getByRole('button',{name:'送出'}));
  expect(submit).toHaveBeenCalledTimes(1);
});

it('renders a budget question as a slider seeded with a sensible default', () => {
  const submit=vi.fn();
  const formatter:FormatterSummary={provider:'rules',model:null,questions:[budgetQuestion]};
  render(<Harness formatter={formatter} onSubmit={submit}/>);
  const slider=screen.getByRole('slider',{name:budgetQuestion.text});
  expect(slider).toHaveValue('1000');
  expect(screen.getByText('NT$ 1,000')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'送出'})).not.toBeDisabled();
  fireEvent.change(slider,{target:{value:'1500'}});
  expect(screen.getByText('NT$ 1,500')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'送出'}));
  expect(submit).toHaveBeenCalledTimes(1);
});

it('renders a delivery question as four day-range choices that must be picked before advancing', () => {
  const submit=vi.fn();
  const formatter:FormatterSummary={provider:'rules',model:null,questions:[deliveryQuestion]};
  render(<Harness formatter={formatter} onSubmit={submit}/>);
  expect(screen.getByRole('button',{name:'送出'})).toBeDisabled();
  ['隔天','3 天內','7 天內','14 天內'].forEach(label=>expect(screen.getByRole('button',{name:label})).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'3 天內'}));
  expect(screen.getByRole('button',{name:'3 天內'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'送出'}));
  expect(submit).toHaveBeenCalledTimes(1);
});

it('blocks overlong or busy answers on whichever question is showing', () => {
  const p={formatter:singleFormatter,answers:{q_0:'x'.repeat(501)},onAnswer:vi.fn(),onSubmit:vi.fn(),busy:false,message:''};
  const {rerender}=render(<ClarificationPanel {...p}/>);
  expect(screen.getByRole('button',{name:'送出'})).toBeDisabled();
  rerender(<ClarificationPanel {...p} answers={{q_0:'紅色'}} busy/>);
  expect(screen.getByRole('textbox')).toBeDisabled();expect(screen.getByRole('button',{name:'正在送出…'})).toBeDisabled();
});
