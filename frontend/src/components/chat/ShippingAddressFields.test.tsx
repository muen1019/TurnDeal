import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach,expect,it} from 'vitest';
import {ShippingAddressFields,validShippingRegion} from './ShippingAddressFields';
afterEach(cleanup);
function Form(){const [value,setValue]=useState({city:'台北市',state:'中正區',postal_code:'100',line_one:'測試路 1 號'});return <ShippingAddressFields value={value} onChange={setValue}/>;}
it('normalizes old 台 city names and resets district/zip when county changes',()=>{
 render(<Form/>);
 expect(screen.getByRole('combobox',{name:'縣市'})).toHaveValue('臺北市');
 expect(screen.getByRole('combobox',{name:'鄉鎮市區'})).toHaveValue('中正區');
 fireEvent.change(screen.getByRole('combobox',{name:'縣市'}),{target:{value:'新北市'}});
 expect(screen.getByRole('combobox',{name:'鄉鎮市區'})).toHaveValue('');
 expect(screen.getByText(/郵遞區號 自動帶入/)).toBeInTheDocument();
 fireEvent.change(screen.getByRole('combobox',{name:'鄉鎮市區'}),{target:{value:'板橋區'}});
 expect(screen.getByText(/郵遞區號 220/)).toBeInTheDocument();
 expect(screen.getByText('新北市板橋區測試路 1 號')).toBeInTheDocument();
 expect(screen.queryByRole('textbox',{name:'運送地址'})).not.toBeInTheDocument();
});
it('does not accept mismatched counties, districts or zip prefixes',()=>{
 const v={city:'台北市',state:'中正區',postal_code:'100',line_one:'測試路 1 號'};
 expect(validShippingRegion(v)).toBe(true);
 expect(validShippingRegion({...v,postal_code:'100001'})).toBe(true);
 expect(validShippingRegion({...v,state:'板橋區'})).toBe(false);
 expect(validShippingRegion({...v,postal_code:'220'})).toBe(false);
 expect(validShippingRegion({...v,line_one:' '})).toBe(false);
});
