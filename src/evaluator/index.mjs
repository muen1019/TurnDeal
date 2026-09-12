import { randomUUID } from 'node:crypto';
import { check, copy, immutable } from '../negotiation/contracts.mjs';
import { NegotiationRepository } from '../negotiation/repository.mjs';
import { ModelGateway } from '../negotiation/model.mjs';
import { buildEvaluatorInput, compareOffers, deterministicRanking, evaluatorFormat, groupSolutions, instructionsFor, validateRanking } from './ranking.mjs';
import { revalidateOffers } from './validation.mjs';

export async function rankOffers({ input, gateway, now = Date.now }) {
  check('EvaluatorInput', input);
  // This is already a validated backend projection. Re-projecting without the
  // private catalog silently erased color_matches and changed weighted ranking.
  input = copy(input);
  input.offers.sort((a,b)=>compareOffers(input,a,b));
  input = immutable(input);
  const audit = [];
  let output, provider = 'openai', fallbackReason = null;
  try {
    output = await gateway.decide({ role: 'evaluator', input, format: evaluatorFormat, instructions: instructionsFor(input),
      signal: new AbortController().signal, audit, promptVersion: 'evaluator-2' });
    validateRanking(output, input, now());
  } catch (error) {
    provider = 'deterministic_fallback';
    fallbackReason = /^(model_|ranking_|Invalid EvaluatorOutput|call_budget|token_budget)/.test(error.message) ? error.message : 'model_or_output_invalid';
    output = deterministicRanking(input);
  }
  // The service revalidates live eligibility after inference, before publication.
  return { output, provider, fallback_reason: fallbackReason, usage: gateway.summary(), audit };
}

export async function evaluate({ db, requestId, buyerId, apiKey = '', model = 'gpt-4.1-2025-04-14',
  fetchImpl = fetch, now = Date.now, options = {} }) {
  const repository = new NegotiationRepository(db);
  repository.request(requestId, buyerId);
  const saved = db.prepare('SELECT * FROM evaluation_runs WHERE request_id = ?').get(requestId);
  if (saved) {
    if (saved.status === 'running') throw new Error('evaluation_in_progress');
    return immutable(JSON.parse(saved.result_json));
  }
  const negotiation = repository.existing(requestId, buyerId);
  if (!negotiation || !['evaluating', 'needs_confirmation', 'no_match'].includes(negotiation.status)) throw new Error('negotiation_not_complete');
  check('NegotiationOutput', negotiation);
  const source = JSON.parse(db.prepare('SELECT input_json FROM negotiation_runs WHERE request_id = ?').get(requestId).input_json);
  const request = db.prepare('SELECT * FROM requests WHERE request_id = ? AND user_id = ?').get(requestId, buyerId);
  const intent = check('NormalizedIntent', source.intent);
  if (request.published_snapshot_json || !['evaluating', 'needs_confirmation', 'no_match'].includes(request.status) ||
    JSON.stringify(JSON.parse(request.normalized_intent_json)) !== JSON.stringify(intent)) throw new Error('state_conflict');
  for (const offer of negotiation.offers) {
    const stored = db.prepare('SELECT offer_json FROM negotiation_offers WHERE request_id = ? AND offer_id = ?').get(requestId, offer.offer_id);
    if (!stored || JSON.stringify(JSON.parse(stored.offer_json)) !== JSON.stringify(offer)) throw new Error('offer_provenance_invalid');
  }
  const sellerIds = source.orchestration.seller_agents.map(s => s.seller_id);
  const validate = (candidates = negotiation.offers) => revalidateOffers({ offers: candidates, intent, catalog: repository.catalog(sellerIds),
    originalCatalog: source.catalog, orchestration: source.orchestration, now: now() });
  let offers = validate();
  const eligible = offers.filter(o => o.eligibility.status === 'eligible');
  const input = eligible.length ? buildEvaluatorInput({ requestId, intent, offers: eligible,
    sellerTrust: source.orchestration.seller_agents, now: now(),catalog:source.catalog }) : null;
  // A persisted claim rejects concurrent invocations before either can make a paid call.
  db.prepare("INSERT INTO evaluation_runs (request_id, status, input_json, result_json, started_at, completed_at) VALUES (?, 'running', ?, NULL, ?, NULL)")
    .run(requestId, input ? JSON.stringify(input) : null, new Date(now()).toISOString());
  try {
    const gateway = new ModelGateway({ apiKey, model, fetchImpl, maxCalls: 1, maxTokens: 60000, maxOutputTokens: 2500, timeoutMs: 20000, ...options });
    let ranked = input ? await rankOffers({ input, gateway, now }) :
      { output: { ranked_offers: [] }, provider: 'skipped', fallback_reason: null, usage: gateway.summary(), audit: [] };
    // One short transaction holds live validation and publication together; no network within it.
    return repository.transaction(() => {
      const current = db.prepare('SELECT * FROM requests WHERE request_id = ? AND user_id = ?').get(requestId, buyerId);
      if (current.status !== request.status || current.published_snapshot_json || current.normalized_intent_json !== request.normalized_intent_json ||
        current.intent_md !== request.intent_md || current.preference_md !== request.preference_md || current.revision !== request.revision) throw new Error('state_conflict');
      offers = validate(offers);
      const eligibleNow = offers.filter(o => o.eligibility.status === 'eligible');
      const ids = new Set(eligibleNow.map(o => o.offer_id));
      // Facts used in model explanations may refer to vanished competitors. Regenerate
      // explanations for the new set instead of publishing stale comparisons.
      if (input && (ids.size !== input.offers.length || input.offers.some(o => !ids.has(o.offer_id)))) {
        ranked = { ...ranked, provider: 'deterministic_fallback', fallback_reason: 'eligible_set_changed',
          output: eligibleNow.length ? deterministicRanking(buildEvaluatorInput({ requestId, intent, offers: eligibleNow,
            sellerTrust: source.orchestration.seller_agents, now: now(),catalog:source.catalog })) : { ranked_offers: [] } };
      }
      const finalInput = eligibleNow.length ? buildEvaluatorInput({ requestId, intent, offers: eligibleNow,
        sellerTrust: source.orchestration.seller_agents, now: now(),catalog:source.catalog }) : null;
      if (finalInput) validateRanking(ranked.output, finalInput, now());
      const confirmationIds = offers.filter(o => o.eligibility.status === 'needs_confirmation').map(o => o.offer_id);
      const status = eligibleNow.length ? 'awaiting_user' : confirmationIds.length ? 'needs_confirmation' : 'no_match';
      let root = request;
      const ancestors = new Set();
      while (root.parent_request_id) {
        if (ancestors.has(root.request_id)) throw new Error('request_ancestry_invalid');
        ancestors.add(root.request_id);
        root = db.prepare('SELECT * FROM requests WHERE request_id = ? AND user_id = ?').get(root.parent_request_id, buyerId);
        if (!root) throw new Error('request_ancestry_invalid');
      }
      const snapshot = check('RequestSnapshot', {
        request_id: requestId, root_request_id: root.request_id, parent_request_id: request.parent_request_id, status,
        documents: { revision: request.revision, intent_md: request.intent_md, preference_md: request.preference_md }, intent: copy(intent),
        seller_agents: negotiation.seller_agents.map(s => ({ ...copy(s), final_offer_ids: s.final_offer_ids.filter(id => offers.some(o => o.offer_id === id)) })),
        discovery_exclusions: copy(source.orchestration.discovery_exclusions), sponsored_placement: copy(source.orchestration.sponsored_placement),
        offers, ranked_offers: ranked.output.ranked_offers, confirmation_offer_ids: confirmationIds, selected_offer_id: null,
        next_request_id: null, decision: null, error: status === 'no_match' ? { code: 'no_eligible_offers', message: '目前沒有可推薦的有效方案。', fields: [] } : null,
      });
      const result = { request_id: requestId, status, provider: ranked.provider, model: apiKey ? model : null,
        fallback_reason: ranked.fallback_reason, usage: ranked.usage, evaluated_at: new Date(now()).toISOString(),
        snapshot, solutions: groupSolutions(snapshot.ranked_offers, offers) };
      if (finalInput) db.prepare('INSERT INTO evaluations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`eval_${randomUUID()}`, requestId,
        ranked.provider, apiKey ? model : null, result.evaluated_at, JSON.stringify(finalInput), JSON.stringify(snapshot.ranked_offers), 1, ranked.fallback_reason);
      db.prepare("UPDATE evaluation_runs SET status = 'complete', result_json = ?, completed_at = ?, audit_json = ? WHERE request_id = ?")
        .run(JSON.stringify(result), result.evaluated_at, JSON.stringify(ranked.audit), requestId);
      db.prepare('UPDATE requests SET status = ?, published_snapshot_json = ?, updated_at = ? WHERE request_id = ?')
        .run(status, JSON.stringify(snapshot), result.evaluated_at, requestId);
      return immutable(result);
    });
  } catch (error) {
    repository.transaction(() => {
      db.prepare("UPDATE evaluation_runs SET status = 'failed', result_json = ?, completed_at = ? WHERE request_id = ? AND status = 'running'")
        .run(JSON.stringify({ request_id: requestId, status: 'failed', error: 'evaluation_failed' }), new Date(now()).toISOString(), requestId);
      db.prepare("UPDATE requests SET status = 'failed', updated_at = ? WHERE request_id = ? AND status = ? AND published_snapshot_json IS NULL")
        .run(new Date(now()).toISOString(), requestId, request.status);
    });
    throw error;
  }
}

// Startup-only recovery, before accepting requests. Never silently repeat paid inference.
export function recoverInterruptedEvaluations(db, now = Date.now()) {
  const rows = db.prepare("SELECT request_id FROM evaluation_runs WHERE status = 'running'").all();
  const repository = new NegotiationRepository(db);
  repository.transaction(() => {
    for (const { request_id: id } of rows) {
      db.prepare("UPDATE evaluation_runs SET status = 'failed', result_json = ?, completed_at = ? WHERE request_id = ?")
        .run(JSON.stringify({ request_id: id, status: 'failed', error: 'interrupted_by_restart' }), new Date(now).toISOString(), id);
      db.prepare("UPDATE requests SET status = 'failed', updated_at = ? WHERE request_id = ? AND published_snapshot_json IS NULL")
        .run(new Date(now).toISOString(), id);
    }
  });
  return rows.length;
}
