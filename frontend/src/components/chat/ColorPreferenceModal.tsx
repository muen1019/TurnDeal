import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,ChevronUp,Palette,X} from 'lucide-react';
import '../../styles/color-modal.css';

type ColorOption=readonly [value:string,label:string,hex:string];

export function ColorPreferenceModal({open,options,selected,max=5,onChange,onClose}:{open:boolean;options:readonly ColorOption[];selected:readonly string[];max?:number;onChange:(colors:string[])=>void;onClose:()=>void}){
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[open,onClose]);
  if(!open)return null;
  const toggle=(value:string)=>{
    if(selected.includes(value)){onChange(selected.filter(v=>v!==value));return;}
    if(selected.length>=max)return;
    onChange([...selected,value]);
  };
  const move=(index:number,dir:-1|1)=>{
    const next=[...selected];
    const target=index+dir;
    if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    onChange(next);
  };
  return createPortal(<div className="color-modal-backdrop" onClick={onClose}>
    <div ref={panel} className="color-modal" role="dialog" aria-modal="true" aria-labelledby="color-modal-title" onClick={e=>e.stopPropagation()}>
      <div className="color-modal-head">
        <div><span className="color-modal-kicker"><Palette size={13}/>顏色偏好</span><h2 id="color-modal-title">挑出你的前 {max} 名</h2></div>
        <button type="button" className="icon-button" aria-label="關閉" onClick={onClose}><X size={20}/></button>
      </div>
      <p className="color-modal-hint">點選加入清單，依序就是你的優先順序；最多可選 {max} 種，不選代表不限顏色。</p>
      <div className="color-modal-grid">
        {options.map(([value,label,hex])=>{
          const rank=selected.indexOf(value);
          const disabled=rank<0&&selected.length>=max;
          return <button key={value} type="button" className="color-modal-swatch" data-selected={rank>=0} disabled={disabled} onClick={()=>toggle(value)}>
            <span className="color-modal-dot" style={{background:hex}}>{rank>=0&&<em>{rank+1}</em>}</span>
            <span>{label}</span>
          </button>;
        })}
      </div>
      {selected.length>0&&<div className="color-modal-ranked">
        <p>已選順序</p>
        <ol>
          {selected.map((value,index)=>{
            const option=options.find(o=>o[0]===value);
            return <li key={value}>
              <span className="color-modal-ranked-dot" style={{background:option?.[2]}}/>
              <span className="color-modal-ranked-label">{index+1}. {option?.[1]}</span>
              <span className="color-modal-ranked-actions">
                <button type="button" aria-label={`把${option?.[1]}往前移`} disabled={index===0} onClick={()=>move(index,-1)}><ChevronUp size={15}/></button>
                <button type="button" aria-label={`把${option?.[1]}往後移`} disabled={index===selected.length-1} onClick={()=>move(index,1)}><ChevronDown size={15}/></button>
                <button type="button" aria-label={`移除${option?.[1]}`} onClick={()=>toggle(value)}><X size={15}/></button>
              </span>
            </li>;
          })}
        </ol>
      </div>}
      <button type="button" className="color-modal-done" onClick={onClose}>完成</button>
    </div>
  </div>,document.body);
}
