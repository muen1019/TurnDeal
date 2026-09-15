import {useEffect} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {AlertCircle} from 'lucide-react';
import '../../styles/toast.css';

/** A brief floating notice — not a persistent inline box a scrolled-past slider can hide. Auto-dismisses;
 * only for quick client-side nudges (validation, "can't do that right now"), never for errors that need
 * an action button, which stay as a normal inline alert so they can't disappear before the buyer reacts. */
export function Toast({message,onDismiss,duration=3000}:{message:string;onDismiss:()=>void;duration?:number}){
  const reduceMotion=useReducedMotion();
  useEffect(()=>{
    if(!message)return;
    const timer=window.setTimeout(onDismiss,duration);
    return()=>window.clearTimeout(timer);
  },[message,duration,onDismiss]);
  return createPortal(
    <div className="toast-stage" aria-live="assertive">
      <AnimatePresence>
        {message&&<motion.div key={message} className="toast" role="alert"
          initial={reduceMotion?false:{opacity:0,y:-16,scale:.96}}
          animate={{opacity:1,y:0,scale:1}}
          exit={reduceMotion?{opacity:0}:{opacity:0,y:-10,scale:.97}}
          transition={reduceMotion?{duration:0}:{duration:.24,ease:[.22,1,.36,1]}}
        >
          <AlertCircle size={16} aria-hidden="true"/><span>{message}</span>
        </motion.div>}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
