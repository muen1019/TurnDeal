import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MobileAccessGate} from './MobileAccessGate';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('does not mount the paid application until pairing is confirmed',async()=>{
 vi.stubEnv('VITE_OFFERMESH_MOBILE_LIVE','true');
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({mode:'live',connected:false})).mockResolvedValueOnce(Response.json({mode:'live',connected:true}));
 vi.stubGlobal('fetch',fetcher);
 render(<MobileAccessGate><div>購物首頁</div></MobileAccessGate>);
 expect(screen.queryByText('購物首頁')).not.toBeInTheDocument();
 const input=await screen.findByRole('textbox',{name:'手機配對碼'});
 fireEvent.change(input,{target:{value:'abc123def456'}});
 fireEvent.click(screen.getByRole('button',{name:'連接並開始'}));
 await screen.findByText('購物首頁');
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({code:'abc123def456'});
});
it('shows a safe error when pairing fails without mounting the application',async()=>{
 vi.stubEnv('VITE_OFFERMESH_MOBILE_LIVE','true');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({mode:'live',connected:false})).mockResolvedValueOnce(Response.json({error:'no'},{status:401})));
 render(<MobileAccessGate><div>購物首頁</div></MobileAccessGate>);
 fireEvent.change(await screen.findByRole('textbox',{name:'手機配對碼'}),{target:{value:'abc123def456'}});
 fireEvent.click(screen.getByRole('button',{name:'連接並開始'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('配對碼不正確'));
 expect(screen.queryByText('購物首頁')).not.toBeInTheDocument();
});
