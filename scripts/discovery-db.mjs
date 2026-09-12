import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function seedDiscovery(db) {
  const fixture = JSON.parse(readFileSync(new URL('../contracts/fixtures/discovery-catalog.json', import.meta.url), 'utf8'));
  const migration = readFileSync(new URL('../db/migrations/002_discovery.sql', import.meta.url), 'utf8');
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  try {
    db.exec(migration);
    const old = db.prepare('SELECT content_json FROM discovery_catalogs WHERE snapshot_id=?').get(fixture.snapshot_id);
    if (old && old.content_json !== JSON.stringify(fixture)) throw new Error('Snapshot changed: assign a new snapshot_id');
    if (!old) db.prepare('INSERT INTO discovery_catalogs VALUES (?, ?, ?, ?)').run(
      fixture.snapshot_id, fixture.source_snapshot_id, JSON.stringify(fixture), new Date().toISOString());
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?, ?)').run('002_discovery', new Date().toISOString());
    db.exec('COMMIT');
    return fixture;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = new DatabaseSync(new URL('../data/offermesh.sqlite', import.meta.url));
  try { const f = seedDiscovery(db); console.log(`Discovery seed: ${f.sellers.length} sellers, ${f.listings.length} listings; existing data preserved.`); }
  finally { db.close(); }
}
