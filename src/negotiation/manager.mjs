import { randomUUID } from 'node:crypto';
import { check, copy, immutable } from './contracts.mjs';
import { BuyerAgent, SellerAgent } from './agents.mjs';
import { ModelGateway, LimitReached } from './model.mjs';
import { validateDrafts, activeOffers, advanceOffers, buildContext, pruneUnavailable, competitiveTerms } from './validation.mjs';
import { proposalReference, buyerMessage, sellerMessage } from './tradeoffs.mjs';

export const DEFAULT_OPTIONS = Object.freeze({ round_timeout_ms: 30000, global_deadline_ms: 150000,
  model_timeout_ms: 12000, max_calls: 50, max_tokens: 400000, max_output_tokens: 1200, offer_ttl_ms: 600000 });

function optionsWithDefaults(options) {
  for (const key of Object.keys(options)) if (!(key in DEFAULT_OPTIONS)) throw new Error(`unknown_option: ${key}`);
  const config = { ...DEFAULT_OPTIONS, ...options };
  for (const [key, value] of Object.entries(config)) if (!Number.isSafeInteger(value) || value < (['max_calls', 'max_tokens'].includes(key) ? 0 : 1)) throw new Error(`invalid_option: ${key}`);
  if (config.round_timeout_ms > 2147483647 || config.global_deadline_ms > 2147483647 || config.model_timeout_ms > 2147483647) throw new Error('timeout_too_large');
  return config;
}

async function bounded(work, timeoutMs) {
  const controller = new AbortController();
  const expires = performance.now() + timeoutMs;
  let timer;
  try {
    const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ timeout: true }); }, timeoutMs); });
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)).then(result =>
      performance.now() >= expires ? { timeout: true } : result), timeout]);
  } finally { clearTimeout(timer); controller.abort(); }
}

/** Internal Backend boundary. Intent/catalog are loaded from SQLite; orchestration
 * is the already selected list. No discovery, ranking or purchase happens here. */
export async function negotiate({ requestId, buyerId, orchestration, repository,
  apiKey = '', model = 'gpt-4.1-mini-2025-04-14', fetchImpl, options = {},
  now = Date.now, monotonic = () => performance.now(), idFactory = () => `offer_${randomUUID()}`,
  buyerFactory = (id, gateway) => new BuyerAgent(id, gateway),
  sellerFactory = (seller, gateway) => new SellerAgent(seller, gateway), onEvent = () => {} }) {
  const saved = repository.existing(requestId, buyerId);
  if (saved) return immutable(saved);
  check('Id', requestId);
  check('OrchestrationResult', orchestration);
  const config = optionsWithDefaults(options);
  const branches = copy(orchestration.seller_agents);
  if (new Set(branches.map(b => b.seller_id)).size !== branches.length || branches.some((b, i) => b.listing_rank !== i + 1 || b.status !== 'pending' || b.rounds.length || b.final_offer_ids.length || b.stop_reason !== null)) throw new Error('invalid_selected_branches');
  const { intent } = repository.request(requestId, buyerId);
  check('NormalizedIntent', intent);
  const catalog = immutable(repository.catalog(branches.map(b => b.seller_id)));
  for (const branch of branches) {
    const seller = catalog.sellers.find(s => s.seller_id === branch.seller_id);
    if (new Set(branch.candidate_products.map(p => p.product_id)).size !== branch.candidate_products.length ||
      branch.candidate_products.some(p => !seller.products.some(s => s.product_id === p.product_id && s.category === 'mouse'))) throw new Error('invalid_candidate_ownership');
  }
  const gateway = new ModelGateway({ apiKey, model, fetchImpl, maxCalls: config.max_calls, maxTokens: config.max_tokens,
    timeoutMs: config.model_timeout_ms, maxOutputTokens: config.max_output_tokens });
  const agents = new Map(branches.map(branch => [branch.seller_id, {
    buyer: buyerFactory(branch.seller_id, gateway), seller: sellerFactory(catalog.sellers.find(s => s.seller_id === branch.seller_id), gateway),
  }]));
  let context = buildContext({ requestId, revision: 0, round: 0, offers: [], catalog, intent, now: now() });
  const latest = new Map();
  const history = [];
  const traces = [];
  const currentOffers = () => {
    pruneUnavailable(latest, repository.catalog(branches.map(b => b.seller_id)), catalog, intent, now());
    return activeOffers(latest, now());
  };
  const deadline = monotonic() + config.global_deadline_ms;
  let globalStop = null;
  const snapshot = () => ({ context, seller_agents: copy(branches), offers: copy(history), traces: copy(traces), usage: gateway.summary() });
  const emit = event => { try { onEvent(immutable(copy(event))); } catch { /* A UI observer cannot break negotiation. */ } };
  repository.start(requestId, buyerId, { intent, catalog, orchestration: copy(orchestration) }, { ...config, model }, snapshot(), new Date(now()).toISOString());
  try {
    for (let round = 1; round <= 5; round++) {
      const active = branches.filter(b => b.stop_reason === null);
      if (!active.length) break;
      const remaining = deadline - monotonic();
      if (remaining <= 0) { globalStop = 'global_deadline'; break; }
      const timeoutMs = Math.max(1, Math.min(config.round_timeout_ms, remaining));
      const previousContext = context;
      emit({ type: 'round_started', round, context_revision: previousContext.context_revision, seller_ids: active.map(b => b.seller_id) });
      const results = await Promise.all(active.map(async branch => {
        const seller = catalog.sellers.find(s => s.seller_id === branch.seller_id);
        const pair = agents.get(branch.seller_id);
        const previous = currentOffers().filter(o => o.seller_id === branch.seller_id);
        const conversation = traces.filter(t => t.seller_id === branch.seller_id && t.result).map(t => ({
          round: t.round, proposal: t.rfq?.proposal ?? null,
          buyer_message: buyerMessage(t.rfq?.proposal), seller_message: sellerMessage(t.result),
          result: { outcome: t.result.outcome, is_final: t.result.is_final,
            quotes: history.filter(o => o.seller_id === branch.seller_id && o.round === t.round && o.eligibility.status === 'eligible')
              .map(o => ({ variant: o.variant, total_price_twd: o.total_price_twd, product_id:o.items[0].product_id,
                benefit_ids:(o.benefits ?? []).map(b=>b.benefit_id) })),
            proposal_response: t.result.proposal_response ?? null },
        }));
        const audit = [];
        let rfq = null;
        let buyerProvider = null;
        branch.status = 'negotiating';
        const outcome = await bounded(async signal => {
          try {
            const buyerSeller = immutable({ seller_id: seller.seller_id,
              public_benefit_kinds: [...new Set((seller.benefits ?? []).filter(e => e.enabled && e.available_units > 0).map(e => e.definition.kind))],
              products: seller.products.map(p => ({
              product_id: p.product_id, category: p.category, brand: p.brand, model: p.model,
              features: copy(p.features), attributes: copy(p.attributes),
            })) });
            const buyer = await pair.buyer.negotiate({ requestId, round, intent: immutable(copy(intent)), branch: immutable(copy(branch)), seller: buyerSeller,
              previous: immutable(copy(previous)), history: immutable(copy(conversation)), context: previousContext, now: now(), signal, audit });
            signal.throwIfAborted();
            buyerProvider = buyer.provider;
            if (buyer.stop) return { stop: 'no_adjustment' };
            const outgoing = copy(buyer.rfq);
            // Recheck after Buyer inference: an offer can expire or lose inventory
            // while the model is reasoning. Keep provenance in the same revision.
            const availableIds = new Set(currentOffers().map(o => o.offer_id));
            const admissibleContext = { ...previousContext, offers: previousContext.offers.filter(o => availableIds.has(o.offer_id)) };
            outgoing.competitive_terms = round === 1 ? [] : competitiveTerms(admissibleContext, seller, branch.candidate_products.map(p => p.product_id), now());
            if (!outgoing.competitive_terms.some(t => t.variant === 'standalone' && t.total_price_twd === outgoing.target_total_twd)) outgoing.target_total_twd = null;
            const freshPrevious = currentOffers().filter(o => o.seller_id === branch.seller_id);
            proposalReference(outgoing, freshPrevious, now());
            rfq = immutable(outgoing);
            check('SellerRFQ', rfq);
            // Buyer adapters never gain authority to change the target Seller.
            if (rfq.request_id !== requestId || rfq.seller_id !== branch.seller_id || rfq.round !== round) throw new Error('invalid_buyer_rfq');
            const result = await pair.seller.negotiate({ rfq, previous: immutable(copy(freshPrevious)), history: immutable(copy(conversation)), now: now(), offerTtlMs: config.offer_ttl_ms, signal, audit });
            signal.throwIfAborted();
            return result;
          } catch (error) {
            if (signal.aborted) return { timeout: true };
            return error instanceof LimitReached ? { stop: error.reason } : { error: true };
          }
        }, timeoutMs);
        // Snapshot now: late promises cannot mutate the committed audit.
        return { branch, seller, outcome, rfq: copy(rfq), audit: copy(audit), buyerProvider, previous, conversation };
      }));
      if (monotonic() >= deadline) globalStop = 'global_deadline';
      for (const { branch, seller, outcome, rfq, audit, buyerProvider, previous, conversation } of results) {
        if (outcome.stop) {
          branch.stop_reason = outcome.stop;
          branch.status = 'offered';
          if (['call_budget', 'token_budget'].includes(outcome.stop)) globalStop ??= outcome.stop;
          traces.push({ seller_id: branch.seller_id, round, context_revision: previousContext.context_revision, rfq, audit,
            buyer_provider: buyerProvider, stop_reason: outcome.stop });
          continue;
        }
        let result = outcome.result;
        let offers = [];
        if (!outcome.timeout && !outcome.error) {
          try {
            offers = validateDrafts({ result, rfq, intent, seller, terms: catalog.terms, now: now(), idFactory, previous, history: conversation });
            if ((result.withdrawn_offer_ids ?? []).some(id => !history.some(o => o.offer_id === id && o.seller_id === seller.seller_id))) throw new Error('invalid_withdrawal');
            const ids = new Set([...history.map(o => o.offer_id), ...offers.map(o => o.offer_id)]);
            if (ids.size !== history.length + offers.length) throw new Error('duplicate_offer_id');
          } catch { outcome.error = true; offers = []; }
        }
        if (outcome.timeout || outcome.error) result = {
          request_id: requestId, seller_id: branch.seller_id, round, outcome: outcome.timeout ? 'timeout' : 'error',
          is_final: false, drafts: [], message: outcome.timeout ? 'Round deadline reached.' : 'Invalid or failed seller response.',
        };
        branch.rounds.push({ round, outcome: result.outcome, offer_ids: offers.map(o => o.offer_id), is_final: result.is_final });
        branch.status = result.outcome;
        if (result.outcome !== 'offered') branch.stop_reason = result.outcome;
        else if (result.is_final) branch.stop_reason = 'seller_final';
        else if (round === 5) branch.stop_reason = 'max_rounds';
        history.push(...offers);
        for (const [key, offer] of latest) if ((result.withdrawn_offer_ids ?? []).includes(offer.offer_id)) latest.delete(key);
        advanceOffers(latest, offers);
        traces.push({ seller_id: branch.seller_id, round, context_revision: previousContext.context_revision,
          rfq, result: copy(result), buyer_provider: buyerProvider, seller_provider: outcome.provider ?? null, audit });
        emit({ type: 'seller_round_completed', seller_id: branch.seller_id, round, outcome: result.outcome,
          is_final: result.is_final, offers: copy(offers), buyer_provider: buyerProvider, seller_provider: outcome.provider ?? null });
      }
      const roundOffers = currentOffers();
      context = buildContext({ requestId, revision: round, round, offers: roundOffers, catalog, intent, now: now() });
      for (const branch of branches) branch.final_offer_ids = roundOffers.filter(o => o.seller_id === branch.seller_id).map(o => o.offer_id);
      repository.commit(requestId, snapshot(), new Date(now()).toISOString());
      emit({ type: 'round_committed', round, context_revision: context.context_revision, eligible_count: context.offers.length });
      if (globalStop) break;
    }
    const offers = currentOffers();
    for (const branch of branches) {
      if (branch.stop_reason === null) { branch.stop_reason = globalStop ?? 'max_rounds'; branch.status = 'offered'; }
      branch.final_offer_ids = offers.filter(o => o.seller_id === branch.seller_id).map(o => o.offer_id);
      check('SellerAgent', branch);
    }
    const eligible = offers.filter(o => o.eligibility.status === 'eligible').map(o => o.offer_id);
    const confirmation = offers.filter(o => o.eligibility.status === 'needs_confirmation').map(o => o.offer_id);
    const result = immutable(check('NegotiationOutput', { request_id: requestId, status: eligible.length ? 'evaluating' : confirmation.length ? 'needs_confirmation' : 'no_match',
      seller_agents: branches, offers, eligible_offer_ids: eligible, confirmation_offer_ids: confirmation,
      completed_rounds: context.completed_round, usage: gateway.summary(), stop_reason: globalStop }));
    repository.finish(requestId, result, new Date(now()).toISOString());
    emit({ type: 'negotiation_completed', status: result.status, eligible_count: eligible.length });
    return result;
  } catch (error) {
    repository.finish(requestId, { request_id: requestId, status: 'failed', error: 'negotiation_failed' }, new Date(now()).toISOString(), true);
    throw error;
  }
}
