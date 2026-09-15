import {useEffect,useState,type ReactNode} from 'react';
import {LockKeyhole} from 'lucide-react';
export function MobileAccessGate({children}:{children:ReactNode}){
 const enabled=import.meta.env.VITE_OFFERMESH_MOBILE_LIVE;
 const [connected,setConnected]=useState(!enabled),[loading,setLoading]=useState(!!enabled),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const check=async()=>{
  setLoading(true);setError('');
  try{const r=await fetch('/api/mobile-session',{cache:'no-store'}),data=await r.json();if(!r.ok||typeof data.connected!=='boolean'||data.mode!=='live')throw Error();setConnected(data.connected);}
  catch{setError('無法連上手機版後端，請確認電腦上的啟動終端仍在運作。');}
  finally{setLoading(false);}
 };
 useEffect(()=>{if(enabled)void check();},[enabled]);
 async function pair(){
  if(busy)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/mobile-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.trim()})}),data=await r.json();
   if(!r.ok||data.connected!==true){setError(r.status===429?'嘗試次數過多，請等一分鐘再試。':'配對碼不正確，請查看電腦終端。');return;}
   setCode('');setConnected(true);
  }catch{setError('連線中斷，請重新確認配對。');}finally{setBusy(false);}
 }
 if(connected)return children;
 return <main className="mobile-access"><section><span className="mobile-access-symbol"><LockKeyhole size={26}/></span><small>TURNDEAL · LIVE AI</small><h1>連接你的購物代理</h1><p>輸入電腦終端顯示的手機配對碼。<br/>不是 OpenAI API key，請勿在此貼上 key。</p>
 {loading?<p role="status">正在確認連線…</p>:<form onSubmit={e=>{e.preventDefault();void pair();}}><label>手機配對碼<input autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={12} minLength={12} required aria-label="手機配對碼" value={code} onChange={e=>setCode(e.target.value)} disabled={busy}/></label><button disabled={busy||code.trim().length!==12}>{busy?'連線中…':'連接並開始'}</button></form>}
 {error&&<p role="alert">{error}<button type="button" className="mobile-access-retry" onClick={()=>void check()}>重新確認連線</button></p>}
 <footer>此模式會呼叫 LLM 並產生 API 費用。<br/>僅限可信任 Wi-Fi；付款與出貨仍為模擬。</footer></section></main>;
}
