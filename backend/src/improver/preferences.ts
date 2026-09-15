import type {Evidence, PreferenceDocument, PreferenceEntry, PreferenceOperation, Scope} from './types.js';

const marker = /<!-- offermesh-preference:([a-zA-Z0-9_-]+) scope=(all_categories|category:mouse|category:mouse_pad) -->\n([^\n]+)\n<!-- \/offermesh-preference -->/g;
const block = (entry: PreferenceEntry) => `<!-- offermesh-preference:${entry.preference_id} scope=${entry.scope} -->\n${entry.value}\n<!-- /offermesh-preference -->`;

/** Managed blocks are addressable; everything outside them is preserved byte-for-byte. */
export function preferenceDocument(markdown: string, revision: number): PreferenceDocument {
  if ([...markdown].length > 20000) throw new Error('preference_too_long');
  const matches = [...markdown.matchAll(marker)];
  const entries = matches.map(m=>({preference_id:m[1],scope:m[2] as Scope,value:m[3]}));
  if (new Set(entries.map(e=>e.preference_id)).size !== entries.length) throw new Error('duplicate_preference_id');
  const residue = markdown.replace(marker,'');
  if (residue.includes('<!-- offermesh-preference:') || residue.includes('<!-- /offermesh-preference')) throw new Error('unaddressable_preference');
  return {revision,markdown,entries};
}

/** The same projection is used in initial formatting, validation and child formatting.
 * Plain user prose remains visible to the strict parser; unsupported text cannot disappear. */
export function effectivePreferenceText(preference:PreferenceDocument):string {
  const prose=preference.markdown.replace(marker,'').replace(/^\s*#{1,6}[^\n]*$/gm,'').trim();
  return [prose,...preference.entries.filter(e=>e.scope==='all_categories'||e.scope==='category:mouse').map(e=>e.value)].filter(Boolean).join('\n');
}

/** Conservative whole-sentence whitelist, not an arbitrary-language classifier. */
export function explicitLongTermMeaning(quote: string): {scope: Scope; value: string} | null {
  const sentence = quote.trim().replace(/[。.!！]$/,'');
  if (/^我(?:買東西|購物)(?:一向|一直|總是)(?:先看|優先考慮|優先選擇)耐用(?:度|性)?$/.test(sentence)) return {scope:'all_categories',value:'優先考慮耐用度'};
  if (/^我(?:挑|買|選購|使用)滑鼠(?:一直都|一向|一直|總是)偏好小尺寸$/.test(sentence)) return {scope:'category:mouse',value:'偏好小尺寸'};
  if (/^我(?:挑|買|選購)滑鼠(?:一直都|一向|一直|總是)偏好黑色$/.test(sentence)) return {scope:'category:mouse',value:'偏好黑色'};
  if (/^我(?:買東西|購物)(?:一向|一直|總是)(?:優先考慮價格|價格優先)$/.test(sentence)) return {scope:'all_categories',value:'價格優先'};
  return null;
}

export function supportedStatements(evidence: Evidence[]): {evidence_id:string; quote:string; scope:Scope; value:string}[] {
  return evidence.filter(e=>e.kind==='user_feedback').flatMap(e=>e.text.split(/[\n。!！?？;；]/).map(s=>s.trim()).filter(Boolean).flatMap(quote=>{
    const meaning=explicitLongTermMeaning(quote);
    return meaning ? [{evidence_id:e.evidence_id,quote,...meaning}] : [];
  }));
}

function explicitRevocation(operation:PreferenceOperation,evidence:Evidence[]):boolean {
  const source=evidence.find(e=>e.kind==='user_feedback'&&e.evidence_id===operation.evidence_id);
  const quote=operation.explicit_quote.trim().replace(/[。.!！]$/,'');
  if(!source || !source.text.split(/[\n。!！?？;；]/).map(s=>s.trim()).includes(quote))return false;
  const removal=quote.match(/^我以後(?:挑|買|選購)滑鼠不再(偏好小尺寸|偏好黑色|價格優先)$/);
  const replacement=quote.match(/^我以後(?:挑|買|選購)滑鼠不再(偏好小尺寸|偏好黑色|價格優先)[，,]改成(偏好小尺寸|偏好黑色|價格優先)$/);
  if(operation.scope!=='category:mouse')return false;
  if(operation.operation==='remove')return !!removal&&operation.before===removal[1]&&operation.value===null;
  return operation.operation==='replace'&&!!replacement&&operation.before===replacement[1]&&operation.value===replacement[2];
}

export function applyPreferencePatch(document: PreferenceDocument, operations: PreferenceOperation[], evidence: Evidence[], validatedProse=false): {document:PreferenceDocument;audit:string[]} {
  // Conflicting operations are treated as a single dependent group.
  if (new Set(operations.map(o=>o.preference_id)).size!==operations.length) return {document,audit:['conflicting_preference_operations']};
  const statements=supportedStatements(evidence);
  let markdown=document.markdown;
  const audit:string[]=[];
  for(const operation of operations){
    const current=preferenceDocument(markdown,document.revision);
    const entry=current.entries.find(e=>e.preference_id===operation.preference_id);
    const meaning=statements.find(s=>s.evidence_id===operation.evidence_id && s.quote===operation.explicit_quote.trim().replace(/[。.!！]$/,''));
    const revocation=explicitRevocation(operation,evidence);
    const supported=revocation || operation.operation==='add' && meaning && meaning.scope===operation.scope && meaning.value===operation.value;
    if(!supported){audit.push('preference_missing_explicit_long_term_evidence');continue;}
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(operation.preference_id) || operation.operation!=='remove'&&(!operation.value || /[\r\n<>]/.test(operation.value))) {audit.push('preference_invalid_target');continue;}
    if(operation.operation==='add'){
      // Legacy prose cannot be searched-and-replaced or contradicted safely.
      const unmanaged=markdown.replace(marker,'').replace(/^\s*#{1,6}[^\n]*$/gm,'').trim();
      if(entry || operation.before!==null || (unmanaged && !validatedProse) || current.entries.some(e=>e.scope===operation.scope && e.value===operation.value)){audit.push('preference_unaddressable_or_duplicate');continue;}
      markdown += `${markdown && !markdown.endsWith('\n')?'\n':''}${block({preference_id:operation.preference_id,scope:operation.scope,value:operation.value!})}\n`;
    }else{
      if(!entry || entry.value!==operation.before || entry.scope!==operation.scope || !revocation){audit.push('preference_replacement_requires_explicit_revocation');continue;}
      markdown=markdown.replace(block(entry),operation.operation==='remove'?'':block({...entry,value:operation.value!}));
    }
  }
  if([...markdown].length>20000)return {document,audit:[...audit,'preference_too_long']};
  return {document:{...document,...preferenceDocument(markdown,document.revision)},audit};
}
