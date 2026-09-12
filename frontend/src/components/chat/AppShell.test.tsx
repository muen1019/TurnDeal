import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AppShell} from './AppShell';
beforeEach(()=>vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const props=()=>({activeView:'chat' as const,recentRequests:[{id:'c1',title:'滑鼠',isActive:true},{id:'c2',title:'安靜的滑鼠'}],onChat:vi.fn(),onSettings:vi.fn(),onNewConversation:vi.fn(),onSelectConversation:vi.fn(),onDeleteConversation:vi.fn(),children:<div>購物畫面</div>});
it('keeps settings in the gear and new conversations inside history only',()=>{
 const p=props();render(<AppShell {...p}/>);
 expect(screen.queryByRole('button',{name:'代理設定'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'開始新對話'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'開啟設定'}));expect(p.onSettings).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'新對話'}));expect(p.onNewConversation).toHaveBeenCalledOnce();
});
it('deletes only the confirmed row and can cancel',()=>{
 const p=props();render(<AppShell {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'刪除對話：滑鼠'}));expect(p.onDeleteConversation).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(p.onDeleteConversation).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'刪除對話：安靜的滑鼠'}));fireEvent.click(screen.getByRole('button',{name:'確認刪除'}));expect(p.onDeleteConversation).toHaveBeenCalledWith('c2');
});
it('locks history deletion during uncertain submissions',()=>{
 render(<AppShell {...props()} historyLocked/>);
 expect(screen.getByRole('button',{name:'刪除對話：滑鼠'})).toBeDisabled();
});
it('clear all requires confirmation, supports cancel and locks while busy',()=>{
 const clear=vi.fn();const {rerender}=render(<AppShell {...props()} onClearHistory={clear}/>);
 fireEvent.click(screen.getByRole('button',{name:'清除全部歷史紀錄'}));
 fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(clear).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'清除全部歷史紀錄'}));
 fireEvent.click(screen.getByRole('button',{name:'確認清除全部'}));expect(clear).toHaveBeenCalledTimes(1);
 rerender(<AppShell {...props()} onClearHistory={clear} historyLocked/>);
 expect(screen.getByRole('button',{name:'清除全部歷史紀錄'})).toBeDisabled();
});
