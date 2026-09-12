import {act,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useBuyerProfile} from './useBuyerProfile';
import {defaultBuyerProfile} from '../components/chat/BuyerSetup';
afterEach(()=>{vi.unstubAllGlobals();sessionStorage.clear();});
it('saves once and recovers an uncertain save with the exact same key; no private browser persistence',async()=>{
 let posts=0;const mock=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  if(init?.method!=='POST')return Response.json({profile:null});
  posts++;if(posts===1)throw new Error('network interrupted');
  return Response.json({profile:JSON.parse(String(init.body))});
 });vi.stubGlobal('fetch',mock);
 const {result}=renderHook(()=>useBuyerProfile());await waitFor(()=>expect(result.current.loading).toBe(false));
 const body={...defaultBuyerProfile,name:'Demo Buyer',shipping_address:'Private Demo Address'};
 await act(async()=>{await result.current.save(body);});expect(result.current.uncertain).toBe(true);
 await act(async()=>{await result.current.retry();});expect(result.current.profile).toEqual(body);expect(result.current.uncertain).toBe(false);
 const calls=mock.mock.calls.filter(([,i])=>i?.method==='POST');expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1]);
 expect(JSON.stringify(sessionStorage)).not.toContain(body.shipping_address);
});
