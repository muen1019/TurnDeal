import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {OnboardingTour} from './OnboardingTour';
afterEach(cleanup);

function Targets(){
  return <div>
    <div data-tour="model-picker">model</div>
    <div data-tour="header-actions">actions</div>
    <textarea data-tour="chat-input" />
    <button data-tour="send-button">送出需求</button>
  </div>;
}

it('walks through all four steps as the screen is clicked, then finishes on the last step', () => {
  const onDone=vi.fn();
  render(<><Targets/><OnboardingTour onDone={onDone}/></>);
  expect(screen.getByText('1 / 4')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'選擇 AI 模型'})).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button',{name:'繼續導覽'}));
  expect(screen.getByText('2 / 4')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'設定與歷史紀錄'})).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  expect(screen.getByText('3 / 4')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'說出你的需求'})).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  expect(screen.getByText('4 / 4')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'送出開始比價'})).toBeInTheDocument();
  expect(onDone).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button',{name:'開始使用'}));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('lets the user skip the tour at any step', () => {
  const onDone=vi.fn();
  render(<><Targets/><OnboardingTour onDone={onDone}/></>);
  fireEvent.click(screen.getByRole('button',{name:'略過導覽'}));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('keeps polling for its target instead of giving up, e.g. while the app is still mid-transition when the tour starts', async () => {
  const onDone=vi.fn();
  const {rerender}=render(<OnboardingTour onDone={onDone}/>);
  expect(screen.queryByRole('heading',{name:'選擇 AI 模型'})).not.toBeInTheDocument();
  rerender(<><Targets/><OnboardingTour onDone={onDone}/></>);
  await waitFor(()=>expect(screen.getByRole('heading',{name:'選擇 AI 模型'})).toBeInTheDocument(),{timeout:1000});
});
