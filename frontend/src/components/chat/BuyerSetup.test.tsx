import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {BuyerSetup,defaultBuyerProfile} from './BuyerSetup';
import type {BuyerProfile} from '../../contract.generated';
afterEach(cleanup);
const props=()=>({initial:null,onSave:vi.fn(async(_p:BuyerProfile)=>true),busy:false,error:'',uncertain:false,onRetry:vi.fn(),onReload:vi.fn()});
const shipping={email:'buyer@example.test',city:'台北市',state:'中正區',postal_code:'100',country:'TW' as const};
function fillShipping(){fireEvent.change(screen.getByRole('textbox',{name:'電子郵件'}),{target:{value:shipping.email}});fireEvent.change(screen.getByRole('combobox',{name:'縣市'}),{target:{value:'臺北市'}});fireEvent.change(screen.getByRole('combobox',{name:'鄉鎮市區'}),{target:{value:shipping.state}});}
it('asks legacy profiles to complete shipping before continuing',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer'}}/>);
 fireEvent.submit(screen.getByRole('button',{name:/下一步/}).closest('form')!);
 expect(screen.getByRole('alert')).toHaveTextContent('請填妥收件');
 expect(screen.queryAllByRole('slider')).toHaveLength(0);
 expect(p.onSave).not.toHaveBeenCalled();
});
it('collects basic details then four explicit weights and colors; never asks for card credentials',async()=>{
 const p=props();render(<BuyerSetup {...p}/>);
 expect(screen.getByRole('button',{name:/下一步/})).toBeDisabled();
 fireEvent.change(screen.getByRole('textbox',{name:/名稱/}),{target:{value:'Demo Buyer'}});
 fireEvent.change(screen.getByRole('textbox',{name:/街道、門牌與樓層/}),{target:{value:'示範地址'}});
 fillShipping();
 fireEvent.click(screen.getByRole('button',{name:/下一步/}));
 expect(screen.getAllByRole('slider')).toHaveLength(4);expect(p.onSave).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('slider',{name:/價格/}),{target:{value:'80'}});
 fireEvent.click(screen.getByRole('button',{name:'冰藍'}));
 fireEvent.click(screen.getByRole('button',{name:/儲存並開始/}));
 await waitFor(()=>expect(p.onSave).toHaveBeenCalledTimes(1));
 expect(p.onSave.mock.calls[0][0]).toMatchObject({name:'Demo Buyer',shipping_address:'示範地址',payment_method:'later',colors:['blue'],weights:{price:80}});
});
it('guards sensitive input and requires active weights; back retains the draft',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}}/>);
 fireEvent.click(screen.getByRole('button',{name:/下一步/}));
 for(const slider of screen.getAllByRole('slider'))fireEvent.change(slider,{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:/儲存並開始/}));expect(p.onSave).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('至少提高');
 fireEvent.click(screen.getByRole('button',{name:'返回基本資料'}));expect(screen.getByRole('textbox',{name:/名稱/})).toHaveValue('Demo Buyer');
 fireEvent.change(screen.getByRole('textbox',{name:/街道、門牌與樓層/}),{target:{value:'4111111111111111'}});
 fireEvent.click(screen.getByRole('button',{name:/下一步/}));expect(screen.getByRole('alert')).toHaveTextContent('信用卡號');
});
