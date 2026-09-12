import { existsSync, mkdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, applyMigrations } from './db.mjs';
import { applySalesProfiles } from './lib/sales-profiles.mjs';
import { prepareDemoRequest } from './lib/negotiation-demo.mjs';
import { NegotiationRepository } from '../src/negotiation/repository.mjs';
import { negotiate } from '../src/negotiation/manager.mjs';

const root = new URL('../', import.meta.url);
const env = fileURLToPath(new URL('.env', root));
if (existsSync(env)) loadEnvFile(env);
const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--offline', '--memory', '--live', '--personas'].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
if (args.has('--live') && args.has('--offline')) throw new Error('Choose --live or --offline');
const apiKey = args.has('--offline') ? '' : process.env.API_KEY ?? '';
if (args.has('--live') && !apiKey.trim()) throw new Error('Fill API_KEY in .env before using --live');
const databasePath = args.has('--memory') ? ':memory:' : fileURLToPath(new URL(args.has('--personas') ? 'data/persona-negotiation.sqlite' : 'data/negotiation.sqlite', root));
if (!args.has('--memory')) mkdirSync(new URL('data/', root), { recursive: true });
const fresh = databasePath === ':memory:' || !existsSync(databasePath);
const db = new DatabaseSync(databasePath);
try {
  if (fresh) initializeDatabase(db);
  else applyMigrations(db);
  if (fresh && args.has('--personas')) applySalesProfiles(db);
  const repository = new NegotiationRepository(db);
  const input = prepareDemoRequest(db);
  const model = process.env.NEGOTIATION_MODEL || 'gpt-4.1-mini-2025-04-14';
  console.log(`Negotiation: ${apiKey.trim() ? model : 'deterministic fallback'}; ${input.requestId}`);
  const result = await negotiate({ ...input, repository, apiKey, model, onEvent(event) {
    if (event.type === 'round_started') console.log(`Round ${event.round}: ${event.seller_ids.length} active sellers, context ${event.context_revision}`);
    if (event.type === 'seller_round_completed') console.log(`  ${event.seller_id}: ${event.outcome}${event.is_final ? ' (final)' : ''}; ${event.offers.map(o => `${o.variant} NT$${o.total_price_twd} / ${o.eligibility.status}`).join(', ')} [${event.buyer_provider}/${event.seller_provider}]`);
  } });
  console.log(JSON.stringify(result, null, 2));
  if (!args.has('--memory')) console.log(`Audit saved to ${databasePath}`);
} finally { db.close(); }
