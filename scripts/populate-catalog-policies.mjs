import { DatabaseSync } from 'node:sqlite';
import { existsSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { initializeDatabase,applyMigrations } from './db.mjs';
import { seedDiscovery } from './discovery-db.mjs';
import { applySalesProfiles } from './lib/sales-profiles.mjs';
import { populateNegotiationCatalog,catalogPolicies } from './lib/catalog-policies.mjs';
const path=resolve(process.argv[2]??'data/app.sqlite'),existing=existsSync(path);
mkdirSync(dirname(path),{recursive:true});
const db=new DatabaseSync(path);
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000');
  if(existing){
    const hasSeed=db.prepare("SELECT 1 FROM sqlite_schema WHERE name='seller_policy_seeds'").get();
    if(!hasSeed || !db.prepare('SELECT 1 FROM seller_policy_seeds WHERE version=?').get(catalogPolicies.version))
      db.prepare('VACUUM INTO ?').run(`${path}.backup-${Date.now()}.sqlite`);
    applyMigrations(db);
  } else {initializeDatabase(db);applySalesProfiles(db);}
  seedDiscovery(db);populateNegotiationCatalog(db);
  const count=table=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
  console.log(JSON.stringify({database:path,sellers:count('sellers'),personas:count('seller_persona_policies'),
    inventory:count('seller_inventory'),sku_policies:count('seller_sku_policies'),listing_bindings:count('seller_listing_bindings'),
    foreign_key_errors:db.prepare('PRAGMA foreign_key_check').all().length},null,2));
}finally{db.close();}
