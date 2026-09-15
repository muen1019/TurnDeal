import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Toast} from './Toast';

describe('Toast',()=>{
  beforeEach(()=>{
    vi.useFakeTimers();
    // Reduced motion: no exit transition to wait out, so removal is synchronous and easy to assert.
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  });
  afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

  it('shows nothing when there is no message',()=>{
    render(<Toast message="" onDismiss={vi.fn()}/>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the message and calls onDismiss after the default 3 seconds, not sooner',()=>{
    const onDismiss=vi.fn();
    render(<Toast message="其他項目都已鎖定" onDismiss={onDismiss}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('其他項目都已鎖定');
    act(()=>vi.advanceTimersByTime(2999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(()=>vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('supports a custom duration',()=>{
    const onDismiss=vi.fn();
    render(<Toast message="hello" onDismiss={onDismiss} duration={1000}/>);
    act(()=>vi.advanceTimersByTime(999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(()=>vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
