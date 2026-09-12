import { copy } from './contracts.mjs';

export class NegotiationRepository {
  constructor(db) { this.db = db; this.db.exec('PRAGMA busy_timeout = 1000'); }

  request(requestId, buyerId) {
    const request = this.db.prepare('SELECT * FROM requests WHERE request_id = ? AND user_id = ?').get(requestId, buyerId);
    if (!request) throw new Error('not_found');
    return { request_id: request.request_id, buyer_id: request.user_id,
      intent: JSON.parse(request.normalized_intent_json), status: request.status,
      published: request.published_snapshot_json !== null };
  }

  catalog(sellerIds) {
    const sellers = sellerIds.map(id => {
      const row = this.db.prepare('SELECT * FROM sellers WHERE seller_id = ?').get(id);
      if (!row) throw new Error('unknown_seller');
      const products = this.db.prepare(`SELECT p.*, i.list_price_twd, i.floor_price_twd, i.stock, i.delivery_days, i.terms_id
        FROM seller_inventory i JOIN products p ON p.product_id = i.product_id WHERE i.seller_id = ? ORDER BY p.product_id`).all(id).map(p => ({
        product_id: p.product_id, category: p.category, brand: p.brand, model: p.model, name: p.name,
        features: JSON.parse(p.features_json), attributes: JSON.parse(p.attributes_json), list_price_twd: p.list_price_twd,
        floor_price_twd: p.floor_price_twd, stock: p.stock, delivery_days: p.delivery_days, terms_id: p.terms_id,
      }));
      return { seller_id: row.seller_id, enabled: Boolean(row.enabled), products,
        strategy: { type: row.strategy_type, round_discounts_twd: JSON.parse(row.round_discounts_json), final_round: row.final_round, bundle_mode: row.bundle_mode,
          bundle_discount_twd: row.bundle_discount_twd, always_offer_bundle: Boolean(row.always_offer_bundle) } };
    });
    return { sellers, terms: this.db.prepare('SELECT * FROM terms ORDER BY terms_id').all().map(copy) };
  }

  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  existing(requestId, buyerId) {
    this.request(requestId, buyerId);
    const run = this.db.prepare('SELECT status, final_json FROM negotiation_runs WHERE request_id = ?').get(requestId);
    if (!run) return null;
    if (run.status === 'running') throw new Error('negotiation_in_progress');
    return JSON.parse(run.final_json);
  }

  start(requestId, buyerId, input, options, state, now) {
    this.transaction(() => {
      const request = this.request(requestId, buyerId);
      if (request.published || !['orchestrating', 'negotiating'].includes(request.status)) throw new Error('state_conflict');
      this.db.prepare(`INSERT INTO negotiation_runs (request_id, status, options_json, input_json, started_at)
        VALUES (?, 'running', ?, ?, ?)`).run(requestId, JSON.stringify(options), JSON.stringify(input), now);
      this.db.prepare("UPDATE requests SET status = 'negotiating', updated_at = ? WHERE request_id = ?").run(now, requestId);
      this.commit(requestId, state, now);
    });
  }

  commit(requestId, state, now) {
    const write = () => {
      for (const offer of state.offers ?? []) {
        const existing = this.db.prepare('SELECT request_id, offer_json FROM negotiation_offers WHERE offer_id = ?').get(offer.offer_id);
        if (existing) {
          if (existing.request_id !== requestId || existing.offer_json !== JSON.stringify(offer)) throw new Error('immutable_offer_conflict');
        } else {
          if (this.db.prepare('SELECT 1 FROM offers WHERE offer_id = ?').get(offer.offer_id)) throw new Error('immutable_offer_conflict');
          this.db.prepare('INSERT INTO negotiation_offers (offer_id, request_id, offer_json, created_at) VALUES (?, ?, ?, ?)')
            .run(offer.offer_id, requestId, JSON.stringify(offer), now);
        }
      }
      this.db.prepare(`INSERT INTO negotiation_commits (request_id, revision, state_json, committed_at) VALUES (?, ?, ?, ?)`)
        .run(requestId, state.context.context_revision, JSON.stringify(state), now);
    };
    // start() already holds a transaction; subsequent barriers open a short one.
    if (state.context.context_revision === 0) write();
    else this.transaction(write);
  }

  finish(requestId, result, now, failed = false) {
    this.transaction(() => {
      const update = this.db.prepare(`UPDATE negotiation_runs SET status = ?, final_json = ?, completed_at = ? WHERE request_id = ? AND status = 'running'`)
        .run(failed ? 'failed' : 'complete', JSON.stringify(result), now, requestId);
      if (update.changes !== 1) throw new Error('state_conflict');
      this.db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE request_id = ?').run(result.status, now, requestId);
    });
  }

  history(requestId, buyerId) {
    this.request(requestId, buyerId);
    return this.db.prepare('SELECT state_json FROM negotiation_commits WHERE request_id = ? ORDER BY revision').all(requestId).map(r => JSON.parse(r.state_json));
  }

  // Call only during Backend startup, before accepting work. Interrupted jobs
  // fail explicitly; never repeat paid calls or silently resurrect old offers.
  recoverInterrupted(now = new Date().toISOString()) {
    const rows = this.db.prepare("SELECT request_id FROM negotiation_runs WHERE status = 'running'").all();
    for (const row of rows) this.finish(row.request_id,
      { request_id: row.request_id, status: 'failed', error: 'interrupted_by_restart' }, now, true);
    return rows.length;
  }
}
