import type {DatabaseSync} from 'node:sqlite';
import {UserPreferenceRepository} from '../../backend/dist/src/user-preferences.js';

export function preferenceStore(db:DatabaseSync,now:()=>Date=()=>new Date()){
  return new UserPreferenceRepository({rows:(sql:string,args:(string|number|null)[]=[])=>db.prepare(sql).all(...args),
    run:(sql:string,args:(string|number|null)[]=[])=>{db.prepare(sql).run(...args);},now});
}
