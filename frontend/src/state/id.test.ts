import {afterEach,describe,expect,it,vi} from 'vitest';
import {newId} from './id';
afterEach(()=>vi.unstubAllGlobals());
describe('LAN-safe submission identity',()=>{
  it('uses the platform UUID in secure contexts',()=>{
    vi.stubGlobal('crypto',{randomUUID:()=> 'platform-uuid'});expect(newId()).toBe('platform-uuid');
  });
  it('uses secure random bytes on HTTP without randomUUID',()=>{
    const getRandomValues=vi.fn((array:Uint8Array)=>{array.fill(255);return array;});
    vi.stubGlobal('crypto',{getRandomValues});
    expect(newId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');expect(getRandomValues).toHaveBeenCalledTimes(1);
  });
});
