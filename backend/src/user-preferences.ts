import {assertValid} from './schema.js';
import {preferenceDocument} from './improver/preferences.js';
import type {ImprovementStorage,PreferenceDocument} from './improver/types.js';

type Storage=Pick<ImprovementStorage,'rows'|'run'|'now'>;
/** Shared persistence for the Formatter, request API and Improver. Call mutations in a transaction. */
export class UserPreferenceRepository {
  constructor(private readonly storage:Storage){}
  current(buyer:string):PreferenceDocument {
    const row=this.storage.rows('SELECT * FROM improver_global_preferences WHERE buyer_id=? ORDER BY revision DESC LIMIT 1',[buyer])[0];
    if(!row)return preferenceDocument('',0);
    const document=preferenceDocument(String(row.markdown),Number(row.revision));
    const saved:NonNullable<PreferenceDocument['saved_preferences']>=[];
    const issues:string[]=JSON.parse(String(row.issues_json??'[]'));
    for(const raw of JSON.parse(String(row.product_preferences_json??'[]'))){
      try{
        let value=raw;
        if('values_json' in raw){
          const values=JSON.parse(raw.values_json);
          const operator=raw.operator==='prefer'?'in':raw.operator==='avoid'?'not_in':raw.operator;
          value={preference_id:raw.preference_id,attribute:raw.attribute,operator,
            strength:raw.strength==='weak'?'preferred':raw.strength,source_text:`Imported preference ${raw.preference_id}`,
            ...(operator==='range'?{min:values.min??null,max:values.max??null}:{values})};
        }
        assertValid('ProductPreference',value);saved.push(value);
      }catch{issues.push('legacy_preference_invalid');}
    }
    return {...document,...(row.ranking_weights_json?{ranking_weights:JSON.parse(String(row.ranking_weights_json))}:{}),...(saved.length?{saved_preferences:saved}:{}),...(issues.length?{issues:[...new Set(issues)]}:{})};
  }
  insert(buyer:string,document:PreferenceDocument):void {
    this.storage.run('INSERT INTO improver_global_preferences(buyer_id,revision,markdown,created_at,product_preferences_json,issues_json,ranking_weights_json) VALUES(?,?,?,?,?,?,?)',
      [buyer,document.revision,document.markdown,this.storage.now().toISOString(),JSON.stringify(document.saved_preferences??[]),JSON.stringify(document.issues??[]),document.ranking_weights?JSON.stringify(document.ranking_weights):null]);
  }
  save(buyer:string,markdown:string,baseRevision:number):PreferenceDocument {
    const current=this.current(buyer);
    if(current.revision!==baseRevision)throw new Error('preference_version_conflict');
    if(current.markdown===markdown&&!current.saved_preferences?.length&&!current.issues?.length&&(markdown.trim()||!current.ranking_weights))return current;
    const document={...preferenceDocument(markdown,current.revision+1),...(markdown.trim()&&current.ranking_weights?{ranking_weights:current.ranking_weights}:{})};
    this.insert(buyer,document);return document;
  }
  forRequest(buyer:string,requestId:string):PreferenceDocument|null {
    const row=this.storage.rows('SELECT preference_json FROM request_preference_bindings WHERE request_id=? AND buyer_id=?',[requestId,buyer])[0];
    return row?JSON.parse(String(row.preference_json)):null;
  }
  bind(buyer:string,requestId:string,document:PreferenceDocument):void {
    if(!this.storage.rows('SELECT 1 FROM requests WHERE request_id=? AND user_id=?',[requestId,buyer]).length)throw new Error('request_owner_mismatch');
    this.storage.run('INSERT INTO request_preference_bindings(request_id,buyer_id,preference_json) VALUES(?,?,?)',[requestId,buyer,JSON.stringify(document)]);
  }
  /** Compatibility: nonempty CreateRequest text can initialize the user's one document.
   * Existing profiles always win over client caches. Edits require the versioned update operation. */
  forSubmission(buyer:string,markdown?:string):PreferenceDocument {
    const current=this.current(buyer);
    if(!markdown?.trim()||markdown===current.markdown)return current;
    if(current.revision!==0)return current;
    return this.save(buyer,markdown,0);
  }
}
