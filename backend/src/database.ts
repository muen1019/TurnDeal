import type initSqlJs from 'sql.js';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {backendRoot,contractFile} from './paths.js';

export function migrateDatabase(db:initSqlJs.Database) {
  const directory=resolve(backendRoot,'../db/migrations');
  for(const filename of readdirSync(directory).filter(f=>/^\d+_.+\.sql$/.test(f)).sort()) {
    const version=filename.slice(0,-4);
    const exists=db.exec("SELECT name FROM sqlite_master WHERE name='schema_migrations'").length>0;
    if(exists && db.exec('SELECT version FROM schema_migrations WHERE version=?',[version]).length)continue;
    db.run('PRAGMA foreign_keys=OFF');db.run('BEGIN IMMEDIATE');
    try {
      db.run(readFileSync(resolve(directory,filename),'utf8'));
      if(db.exec('PRAGMA foreign_key_check').length)throw new Error('Migration broke foreign keys: '+version);
      db.run('INSERT INTO schema_migrations VALUES(?,?)',[version,new Date().toISOString()]);db.run('COMMIT');
    }catch(error){db.run('ROLLBACK');throw error;}finally{db.run('PRAGMA foreign_keys=ON');}
  }
  db.run('PRAGMA user_version=3');
}

/** Seed only an empty catalog; never replace existing prices, inventory or source history. */
export function seedCatalog(db:initSqlJs.Database) {
  if(db.exec('SELECT seller_id FROM sellers LIMIT 1').length)return;
  const catalog=JSON.parse(readFileSync(contractFile('fixtures/sellers.json'),'utf8'));
  const marketplace=JSON.parse(readFileSync(contractFile('fixtures/marketplace-source-snapshot.json'),'utf8'));
  function insert(table:string,row:Record<string,unknown>){
    const columns=Object.keys(row);db.run(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,Object.values(row) as (string|number|null)[]);
  }
  db.run('BEGIN IMMEDIATE');
  try {
    for(const s of marketplace.sources)insert('marketplace_sources',{source_id:s.source_id,snapshot_id:marketplace.snapshot_id,marketplace:s.marketplace,source_type:s.source_type,product_key:s.product_key,title:s.title,url:s.url,retrieved_at:s.retrieved_at,observed_at:s.observed_at,freshness:s.freshness,availability:s.availability,price_amount:s.price?.amount??null,price_currency:s.price?.currency??null,includes_tax:s.price?.includes_tax??null,includes_shipping:s.price?.includes_shipping??null,facts_json:JSON.stringify(s.facts),notes_json:JSON.stringify(s.notes)});
    for(const t of catalog.terms)insert('terms',t);
    for(const s of catalog.sellers){
      insert('sellers',{seller_id:s.seller_id,name:s.name,enabled:Number(s.enabled),strategy_type:s.strategy.type,round_discounts_json:JSON.stringify(s.strategy.round_discounts_twd),final_round:s.strategy.final_round,bundle_mode:s.strategy.bundle_mode,...s.trust});
      for(const p of s.products){
        insert('products',{product_id:p.product_id,category:p.category,brand:p.brand,model:p.model,name:p.name,features_json:JSON.stringify(p.features),attributes_json:JSON.stringify(p.attributes),source_price_twd:p.source_price_twd});
        for(const source of p.source_ids)insert('product_sources',{product_id:p.product_id,source_id:source});
        insert('seller_inventory',{seller_id:s.seller_id,product_id:p.product_id,list_price_twd:p.list_price_twd,floor_price_twd:p.floor_price_twd,stock:p.stock,delivery_days:p.delivery_days,terms_id:p.terms_id,updated_at:new Date().toISOString()});
      }
    }
    for(const c of catalog.campaigns)insert('campaigns',{...c,enabled:Number(c.enabled)});
    db.run('COMMIT');
  }catch(error){db.run('ROLLBACK');throw error;}
}
