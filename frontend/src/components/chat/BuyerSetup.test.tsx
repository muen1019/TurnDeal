import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {BuyerSetup,defaultBuyerProfile} from './BuyerSetup';
import type {BuyerProfile} from '../../contract.generated';
afterEach(cleanup);
const props=()=>({initial:null,onSave:vi.fn(async(_p:BuyerProfile)=>true),busy:false,error:'',uncertain:false,onRetry:vi.fn(),onReload:vi.fn()});
const shipping={email:'buyer@example.test',city:'台北市',state:'中正區',postal_code:'100',country:'TW' as const};
function fillShipping(){fireEvent.change(screen.getByRole('textbox',{name:'電子郵件'}),{target:{value:shipping.email}});fireEvent.change(screen.getByRole('combobox',{name:'縣市'}),{target:{value:'臺北市'}});fireEvent.change(screen.getByRole('combobox',{name:'鄉鎮市區'}),{target:{value:shipping.state}});}

it('asks an existing profile missing shipping details to complete it before saving',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:''}}/>);
 fireEvent.submit(screen.getByRole('button',{name:'儲存'}).closest('form')!);
 expect(screen.getByRole('alert')).toHaveTextContent('請填妥收件');
 expect(screen.queryAllByRole('slider')).toHaveLength(0);
 expect(p.onSave).not.toHaveBeenCalled();
});

it('starts pre-filled with fake test data (still fully editable), then walks through weights and a ranked color pick',async()=>{
 const p=props();render(<BuyerSetup {...p}/>);
 expect(screen.getByRole('textbox',{name:/名稱/})).toHaveValue('Jonathan');
 expect(screen.getByRole('textbox',{name:'電子郵件'})).toHaveValue('jonathan@gmail.com');
 expect(screen.getByRole('button',{name:/下一步/})).not.toBeDisabled();
 fireEvent.change(screen.getByRole('textbox',{name:/名稱/}),{target:{value:''}});
 expect(screen.getByRole('button',{name:/下一步/})).toBeDisabled();
 fireEvent.change(screen.getByRole('textbox',{name:/名稱/}),{target:{value:'Demo Buyer'}});
 fireEvent.change(screen.getByRole('textbox',{name:/街道、門牌與樓層/}),{target:{value:'示範地址'}});
 fillShipping();
 fireEvent.click(screen.getByRole('button',{name:/下一步/}));
 expect(screen.getAllByRole('slider')).toHaveLength(4);expect(p.onSave).not.toHaveBeenCalled();
 const priceSlider=screen.getByRole('slider',{name:'價格'});
 expect(priceSlider).toHaveValue('53');
 expect(priceSlider).toHaveAttribute('step','1');
 expect(priceSlider.closest('.preference-card')).toHaveTextContent('53%');
 expect(screen.getByRole('slider',{name:'顏色符合度'})).toBeDisabled();
 fireEvent.change(priceSlider,{target:{value:'80'}});
 expect(priceSlider).toHaveValue('80');
 expect(priceSlider.closest('.preference-card')).toHaveTextContent('80%');
 // Colors open in their own ranking picker, not an inline list.
 fireEvent.click(screen.getByRole('button',{name:'點此挑選喜歡的顏色'}));
 fireEvent.click(screen.getByRole('button',{name:'冰藍'}));
 expect(screen.getByText('已選順序')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'完成'}));
 expect(screen.getByRole('button',{name:/已選 1 種顏色/})).toBeInTheDocument();
 expect(screen.getByRole('slider',{name:'顏色符合度'})).not.toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:/儲存並開始/}));
 await waitFor(()=>expect(p.onSave).toHaveBeenCalledTimes(1));
 expect(p.onSave.mock.calls[0][0]).toMatchObject({name:'Demo Buyer',shipping_address:'示範地址',payment_method:'card',colors:['blue'],weights:{price:80}});
});

it('lets you rank up to five colors, reorder and remove them from the picker',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}} initialStep={1}/>);
 fireEvent.click(screen.getByRole('button',{name:'點此挑選喜歡的顏色'}));
 fireEvent.click(screen.getByRole('button',{name:'墨黑'}));
 fireEvent.click(screen.getByRole('button',{name:'冰藍'}));
 const ranked=()=>screen.getAllByText(/^\d\. /).map(el=>el.textContent);
 expect(ranked()).toEqual(['1. 墨黑','2. 冰藍']);
 fireEvent.click(screen.getByRole('button',{name:'把冰藍往前移'}));
 expect(ranked()).toEqual(['1. 冰藍','2. 墨黑']);
 fireEvent.click(screen.getByRole('button',{name:'移除墨黑'}));
 expect(ranked()).toEqual(['1. 冰藍']);
 fireEvent.click(screen.getByRole('button',{name:'完成'}));
 expect(screen.getByRole('button',{name:/已選 1 種顏色/})).toBeInTheDocument();
});

it('keeps a locked factor untouched while the other sliders redistribute around it',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}} initialStep={1}/>);
 const deliverySlider=screen.getByRole('slider',{name:'到貨速度'});
 expect(deliverySlider).toHaveValue('24');
 fireEvent.click(screen.getByRole('button',{name:'鎖定到貨速度的百分比，調整其他項目時不受影響'}));
 expect(deliverySlider).toBeDisabled();
 fireEvent.change(screen.getByRole('slider',{name:'價格'}),{target:{value:'70'}});
 expect(deliverySlider).toHaveValue('24');
 expect(screen.getByRole('slider',{name:'賣家評價'})).toHaveValue('6');
 expect(deliverySlider.closest('.preference-card')).toHaveTextContent('24%');
 fireEvent.click(screen.getByRole('button',{name:'解除鎖定到貨速度'}));
 expect(deliverySlider).not.toBeDisabled();
});

it('freezes the last unlocked slider and warns instead of draining its percentage into locked factors',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}} initialStep={1}/>);
 fireEvent.click(screen.getByRole('button',{name:'鎖定到貨速度的百分比，調整其他項目時不受影響'}));
 fireEvent.click(screen.getByRole('button',{name:'鎖定賣家評價的百分比，調整其他項目時不受影響'}));
 const priceSlider=screen.getByRole('slider',{name:'價格'});
 fireEvent.change(priceSlider,{target:{value:'20'}});
 // Nothing moves — there is no unlocked factor left to absorb the difference.
 expect(priceSlider).toHaveValue('53');
 expect(screen.getByRole('slider',{name:'到貨速度'})).toHaveValue('24');
 expect(screen.getByRole('slider',{name:'賣家評價'})).toHaveValue('23');
 expect(screen.getByRole('alert')).toHaveTextContent('其他項目都已鎖定');
});

it('shows the lock warning as a floating toast, not an inline box that a scrolled form can hide',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}} initialStep={1}/>);
 fireEvent.click(screen.getByRole('button',{name:'鎖定到貨速度的百分比，調整其他項目時不受影響'}));
 fireEvent.click(screen.getByRole('button',{name:'鎖定賣家評價的百分比，調整其他項目時不受影響'}));
 fireEvent.change(screen.getByRole('slider',{name:'價格'}),{target:{value:'20'}});
 // Auto-dismiss timing is covered by Toast.test.tsx; this only checks it renders as the floating variant.
 expect(screen.getByRole('alert')).toHaveClass('toast');
});

it('blocks saving preferences with no active weight and explains why',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping,weights:{price:0,delivery:0,trust:0,color:0}}} initialStep={1}/>);
 fireEvent.click(screen.getByRole('button',{name:'儲存'}));
 expect(p.onSave).not.toHaveBeenCalled();
 expect(screen.getByRole('alert')).toHaveTextContent('至少提高');
});

it('guards against a pasted card number, and stepping back during onboarding retains the draft',()=>{
 const p=props();render(<BuyerSetup {...p}/>);
 fireEvent.change(screen.getByRole('textbox',{name:/名稱/}),{target:{value:'Demo Buyer'}});
 fireEvent.click(screen.getByRole('button',{name:/下一步/}));
 fireEvent.click(screen.getByRole('button',{name:'返回基本資料'}));
 expect(screen.getByRole('textbox',{name:/名稱/})).toHaveValue('Demo Buyer');
 fireEvent.change(screen.getByRole('textbox',{name:/街道、門牌與樓層/}),{target:{value:'4111111111111111'}});
 fireEvent.click(screen.getByRole('button',{name:/下一步/}));
 expect(screen.getByRole('alert')).toHaveTextContent('信用卡號');
});

it('hides the onboarding wizard chrome when editing an existing profile from the settings hub, and saves the one section shown directly',async()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}} initialStep={0}/>);
 expect(screen.queryByRole('group',{name:/設定步驟/})).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'編輯基本資料'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/下一步/})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'返回基本資料'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'儲存'}));
 await waitFor(()=>expect(p.onSave).toHaveBeenCalledTimes(1));
 // Never showed or touched the preferences section.
 expect(screen.queryByRole('slider')).toBeNull();
});

it('jumps straight into the preferences section when editing from the hub, with matching edit-mode copy',()=>{
 const p=props();render(<BuyerSetup {...p} initial={{...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'測試路 1 號',shipping_details:shipping}} initialStep={1}/>);
 expect(screen.getByRole('heading',{name:'調整購物偏好'})).toBeInTheDocument();
 expect(screen.queryByRole('textbox',{name:/名稱/})).not.toBeInTheDocument();
 expect(screen.getAllByRole('slider')).toHaveLength(4);
 expect(screen.getByRole('button',{name:'儲存'})).toBeInTheDocument();
});
