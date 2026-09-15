import {useEffect,useRef,useState} from 'react';
import type {BuyerProfile,BuyerProfileResponse} from '../contract.generated';
import {ApiFailure,postJournal,request,validateWire} from '../api/client';
import {newId} from './id';
// The server rebuilds the profile object (shipping fields spread first, then colors/weights appended),
// so its key order never matches what the client sent even on a clean save. Compare by value, not by
// JSON.stringify text, so a harmless key-order difference doesn't get reported as an unconfirmed save.
function sameValue(a:unknown,b:unknown):boolean{
  if(a===b)return true;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]));
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const ak=Object.keys(a as object),bk=Object.keys(b as object);
    return ak.length===bk.length&&ak.every(k=>sameValue((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
  }
  return false;
}
export function useBuyerProfile(){
  const [profile,setProfile]=useState<BuyerProfile|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef<{key:string;body:BuyerProfile}|null>(null),locked=useRef(false);
  const [uncertain,setUncertain]=useState(false);
  async function load(){
    setLoading(true);setError('');
    try{const result=validateWire<BuyerProfileResponse>('BuyerProfileResponse',await request('/api/buyer-profile'));setProfile(result.profile);}
    catch{setError('無法讀取設定。若剛更新程式，請重啟 dev:secure，再按重新載入。');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function save(body:BuyerProfile){
    if(locked.current)return false;
    locked.current=true;setBusy(true);setError('');
    const original=pending.current??{key:newId(),body:structuredClone(body)};pending.current=original;
    try{
      validateWire('BuyerProfile',original.body);
      const result=validateWire<BuyerProfileResponse>('BuyerProfileResponse',await postJournal('/api/buyer-profile',original.body,original.key));
      if(!result.profile||!sameValue(result.profile,original.body))throw new Error('profile_response_mismatch');
      setProfile(result.profile);pending.current=null;setUncertain(false);return true;
    }catch(e){
      const definite=e instanceof ApiFailure&&[400,404,422].includes(e.status);
      if(definite)pending.current=null;
      setUncertain(!definite);setError(definite?e.message:'尚未確認是否儲存成功；請核對原提交，不要重複輸入。');return false;
    }finally{locked.current=false;setBusy(false);}
  }
  return {profile,loading,busy,error,uncertain,load,save,retry:()=>pending.current?save(pending.current.body):Promise.resolve(false)};
}
