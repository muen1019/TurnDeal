import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {WelcomeScreen} from './WelcomeScreen';

describe('WelcomeScreen',()=>{
  afterEach(()=>{cleanup();vi.useRealTimers();});

  it('shows the TurnDeal brand and slogan, and offers Google and guest entry points',()=>{
    const {container}=render(<WelcomeScreen onStart={vi.fn()}/>);
    // "Deal" is a separate coloured span, so the accessible name computation joins it with a space.
    expect(screen.getByRole('heading',{name:/Turn\s*Deal/})).toBeInTheDocument();
    // The tagline reveals word by word now (each word its own span), so check the whole line's text.
    expect(container.querySelector('.welcome-slogan')).toHaveTextContent('Turn Your Need into a Deal');
    expect(screen.getByRole('button',{name:'使用 Google 帳號繼續'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Facebook/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/以訪客身份繼續/})).toBeInTheDocument();
  });

  it('shows the full-screen transition for a guest too, then starts after it plays',()=>{
    vi.useFakeTimers();
    const onStart=vi.fn();
    const {container}=render(<WelcomeScreen onStart={onStart}/>);
    fireEvent.click(screen.getByRole('button',{name:/以訪客身份繼續/}));
    expect(onStart).not.toHaveBeenCalled();
    expect(container.querySelector('.welcome-transition')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'使用 Google 帳號繼續'})).toBeDisabled();
    act(()=>vi.runAllTimers());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows a brief connecting state for Google before starting, and locks the guest button meanwhile',()=>{
    vi.useFakeTimers();
    const onStart=vi.fn();
    render(<WelcomeScreen onStart={onStart}/>);
    fireEvent.click(screen.getByRole('button',{name:'使用 Google 帳號繼續'}));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:/以訪客身份繼續/})).toBeDisabled();
    act(()=>vi.runAllTimers());
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
