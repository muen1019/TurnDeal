import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MobileJourney,mobileProgress} from './MobileJourney';
afterEach(cleanup);
const props=()=>({draft:'買滑鼠',onDraft:vi.fn(),onSend:vi.fn(),ready:false,requestId:null,busy:false,onReady:vi.fn(),onNew:vi.fn(),onRetry:vi.fn(),unsaved:false,message:''});
describe('mobile purchase journey',()=>{
  it('uses explicit stage estimates and never gives failure 100%',()=>{
    expect(['submitting','formatting','orchestrating','negotiating','evaluating','awaiting_user'].map(s=>mobileProgress(s as Parameters<typeof mobileProgress>[0])?.percent)).toEqual([3,12,30,60,88,100]);
    for(const status of ['failed','needs_clarification','no_match','needs_confirmation'] as const)expect(mobileProgress(status)).toBeNull();
  });
  it('allows direct input, respects IME, and blocks duplicate sends',()=>{
    const p=props();const {rerender}=render(<MobileJourney {...p}/>);
    fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter',isComposing:true});expect(p.onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'送出需求'}));expect(p.onSend).toHaveBeenCalledTimes(1);
    rerender(<MobileJourney {...p} busy status="submitting"/>);expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','3');
  });
  it('opens verified results once after observing processing',()=>{
    const p=props();const {rerender}=render(<MobileJourney {...p} requestId="r1" status="negotiating"/>);
    rerender(<MobileJourney {...p} requestId="r1" status="awaiting_user" ready/>);
    expect(p.onReady).toHaveBeenCalledTimes(1);
    rerender(<MobileJourney {...p} requestId="r1" status="awaiting_user" ready/>);expect(p.onReady).toHaveBeenCalledTimes(1);
  });
  it('does not redirect historical ready snapshots or incomplete results',()=>{
    const p=props();const {rerender}=render(<MobileJourney {...p} requestId="r1" status="awaiting_user" ready/>);expect(p.onReady).not.toHaveBeenCalled();
    rerender(<MobileJourney {...p} requestId="r1" status="failed" error="服務中斷"/>);
    expect(screen.queryByRole('progressbar')).toBeNull();expect(screen.getByText('服務中斷')).toBeInTheDocument();expect(p.onReady).not.toHaveBeenCalled();
  });
  it('keeps reconciliation available during unknown submission',()=>{
    const p=props();render(<MobileJourney {...p} busy status="submitting" error="核對原提交"/>);
    fireEvent.click(screen.getByRole('button',{name:'重新核對狀態'}));expect(p.onRetry).toHaveBeenCalledTimes(1);
  });
});
