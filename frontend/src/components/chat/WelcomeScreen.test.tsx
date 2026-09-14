import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {WelcomeScreen} from './WelcomeScreen';

describe('WelcomeScreen',()=>{
  it('shows the TurnDeal brand and slogan, and starts on click',()=>{
    const onStart=vi.fn();
    render(<WelcomeScreen onStart={onStart}/>);
    expect(screen.getByRole('heading',{name:'TurnDeal'})).toBeInTheDocument();
    expect(screen.getByText(/Turn Your Need/)).toHaveTextContent('Turn Your Need into a Deal');
    fireEvent.click(screen.getByRole('button',{name:'開始使用'}));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
