import { createHash } from 'node:crypto';
import { check, copy, immutable } from './contracts.mjs';
import { quotePolicy, bundlePrice, exchangeDiscount, proposalResponse } from './tradeoffs.mjs';
import { validateBenefits, evidenceSupports, personaFinal } from './personas.mjs';
import { economicallyValid, countWithDrafts } from './economics.mjs';

export function matches(product, preference) {
  const value = product.attributes[preference.attribute];
  if (value === undefined || value === null) return false;
  if (preference.operator === 'range') return (preference.min === null || value >= preference.min) && (preference.max === null || value <= preference.max);
  return preference.operator === 'in' ? preference.values.includes(value) : !preference.values.includes(value);
}

export function validProduct(product, intent) {
  return product.category === 'mouse' && product.stock > 0 && product.delivery_days <= intent.delivery_days_max &&
    intent.required_features.every(f => product.features.includes(f)) &&
    intent.product_preferences.filter(p => p.strength === 'required').every(p => matches(product, p));
}

export function validateDrafts({ result, rfq, intent, seller, terms, now, idFactory, previous = [], history = [] }) {
  check('SellerNegotiationResult', result);
  if (result.request_id !== rfq.request_id || result.seller_id !== rfq.seller_id || result.round !== rfq.round) throw new Error('response_identity_mismatch');
  if (rfq.proposal || seller.strategy.persona) {
    const base = result.drafts.find(d => d.variant === 'standalone');
    const bundle = result.drafts.find(d => d.variant === 'bundle');
    let discount = 0;
    if (result.outcome === 'offered') {
      const product = seller.products.find(p => p.product_id === base?.items[0]?.product_id && p.category === 'mouse');
      if (!product) throw new Error('proposal_product_missing');
      const pad = seller.products.find(p => p.category === 'mouse_pad' && p.stock > 0);
      const canBundle = seller.strategy.bundle_mode === 'free_optional_mouse_pad' && rfq.allowed_addon_categories.includes('mouse_pad') &&
        Boolean(pad) && pad.delivery_days <= product.delivery_days && pad.terms_id === product.terms_id &&
        (!seller.strategy.persona || rfq.round >= seller.strategy.persona.gift_from_round);
      const bound = quotePolicy({ seller, rfq, previous, history, now, product, canBundle });
      if (!bound.referenceMatches || base.total_price_twd < bound.minimum || base.total_price_twd > bound.maximum ||
        (bundle && (!canBundle || bundle.total_price_twd !== bundlePrice(bound, base.total_price_twd)))) throw new Error('proposal_policy_violation');
      discount = exchangeDiscount(bound, base.total_price_twd);
      const bounded = seller.strategy.persona?.decision_mode==='bounded';
      const count = bounded ? countWithDrafts(history,result.drafts,product) : 0;
      if (bounded && count>product.negotiation_policy.max_concession_count) throw new Error('concession_limit_exceeded');
      if (seller.strategy.persona && result.is_final !== (personaFinal(seller, rfq.round, bound.credited + discount) ||
        (bounded && count>=product.negotiation_policy.max_concession_count))) throw new Error('invalid_persona_final');
    }
    const expected = rfq.proposal ? proposalResponse(rfq, result.drafts, discount) : null;
    if (result.proposal_response && (!expected || result.proposal_response.status !== expected.status || result.proposal_response.exchange_discount_twd !== expected.exchange_discount_twd))
      throw new Error('invalid_proposal_response');
    // Optional legacy adapters receive a Backend-derived response after validation.
    if (expected) result.proposal_response = expected;
  } else if (result.proposal_response) throw new Error('unexpected_proposal_response');
  const refs = new Set();
  const variants = new Set();
  for (const draft of result.drafts) {
    if (refs.has(draft.draft_ref) || variants.has(draft.variant)) throw new Error('duplicate_draft');
    refs.add(draft.draft_ref); variants.add(draft.variant);
  }
  const mapped = new Map();
  return [...result.drafts].sort((a, b) => Number(a.variant === 'bundle') - Number(b.variant === 'bundle')).map(draft => {
    const reasons = new Set();
    let confirmation = false;
    const reject = reason => reasons.add(reason);
    const primary = draft.items.find(i => i.role === 'primary');
    const product = seller.products.find(p => p.product_id === primary?.product_id);
    const baseline = mapped.get(draft.baseline_draft_ref);
    if (!seller.enabled || !product || !rfq.candidate_product_ids.includes(primary?.product_id)) reject('invalid_offer');
    if (draft.items.some(i => i.quantity !== 1) || draft.items.filter(i => i.role === 'primary').length !== 1) reject('quantity_changed');
    if (product) {
      if (seller.strategy.persona && (!seller.strategy.persona.sku_ids.includes(product.product_id) ||
        Date.parse(draft.expires_at) > now + seller.strategy.persona.quote_ttl_seconds * 1000)) reject('invalid_offer');
      if (!validateBenefits(seller, product, rfq.round, draft.benefits ?? [], previous)) reject('invalid_offer');
      if (!economicallyValid(seller,product,draft.total_price_twd,draft.benefits ?? [],draft.items.find(i=>i.role==='addon')?.product_id ?? null)) reject('invalid_offer');
      if (!intent.required_features.every(f => product.features.includes(f))) reject('missing_feature');
      if (!intent.product_preferences.filter(p => p.strength === 'required').every(p => matches(product, p))) reject('invalid_offer');
      if (draft.primary_features.some(f => !product.features.includes(f)) || !intent.required_features.every(f => draft.primary_features.includes(f))) reject('missing_feature');
      if (draft.total_price_twd < product.floor_price_twd) reject('invalid_offer');
      if (draft.delivery_days < product.delivery_days) reject('invalid_offer');
      if (draft.terms_id !== product.terms_id) reject('terms_changed');
    }
    for (const item of draft.items) {
      const itemProduct = seller.products.find(p => p.product_id === item.product_id);
      if (!itemProduct || itemProduct.category !== item.category || itemProduct.stock < item.quantity) reject('invalid_offer');
      if (itemProduct && draft.delivery_days < itemProduct.delivery_days) reject('invalid_offer');
    }
    if (draft.total_price_twd > intent.max_total_twd) reject('over_budget');
    if (draft.delivery_days > intent.delivery_days_max) reject('delivery_too_late');
    if (Date.parse(draft.expires_at) <= now) reject('expired');
    if (!terms.some(t => t.terms_id === draft.terms_id && t.payment_obligation === 'one_time')) reject('terms_changed');
    if (draft.variant === 'standalone') {
      if (draft.items.length !== 1 || primary?.category !== 'mouse' || draft.baseline_draft_ref !== null || draft.optional_addons) reject('invalid_offer');
    } else {
      const policy = intent.negotiation_policy;
      const addon = draft.items.find(i => i.role === 'addon');
      if (draft.items.length !== 2 || addon?.category !== 'mouse_pad' || !policy.allowed_addon_categories.includes(addon?.category)) reject('unrelated_addon');
      if (!draft.optional_addons) reject('addon_not_optional');
      if (policy.bundle_mode === 'disabled') reject('bundle_disabled');
      if (!baseline || baseline.eligibility.status !== 'eligible' || baseline.items[0].product_id !== primary?.product_id) {
        confirmation = true;
      } else {
        if (baseline.terms_id !== draft.terms_id || draft.delivery_days > baseline.delivery_days) reject('terms_changed');
        confirmation = draft.total_price_twd - baseline.total_price_twd > policy.max_addon_increment_twd;
      }
    }
    const status = reasons.size ? 'rejected' : confirmation ? 'needs_confirmation' : 'eligible';
    if (confirmation && !reasons.size) reject(baseline ? 'addon_consent_required' : 'baseline_unavailable');
    // Malformed bundle references cannot satisfy the formal Offer contract: reject
    // the response, retaining the previous valid versions in the manager.
    const { draft_ref, baseline_draft_ref, ...commercial } = draft;
    const offer = check('Offer', {
      offer_id: idFactory(), seller_id: seller.seller_id, round: result.round, ...commercial,
      baseline_offer_id: baseline?.offer_id ?? null, eligibility: { status, reason_codes: [...reasons] },
    });
    mapped.set(draft_ref, offer);
    return immutable(offer);
  });
}

export function activeOffers(latest, now) {
  const offers = [...latest.values()].filter(o => Date.parse(o.expires_at) > now);
  return offers.filter(o => o.variant === 'standalone' || offers.some(b => b.offer_id === o.baseline_offer_id && b.eligibility.status === 'eligible'));
}

// Expiry and lost fulfillment invalidate a version permanently. Replenishing
// inventory later requires a new Seller proposal; it cannot revive the old ID.
export function pruneUnavailable(latest, liveCatalog, snapshotCatalog, intent, now) {
  for (const [key, offer] of latest) {
    const seller = liveCatalog.sellers.find(s => s.seller_id === offer.seller_id);
    const primaryItem = offer.items.find(i => i.role === 'primary');
    const product = seller?.products.find(p => p.product_id === primaryItem.product_id);
    const liveTerms = liveCatalog.terms.find(t => t.terms_id === offer.terms_id);
    const snapshotTerms = snapshotCatalog.terms.find(t => t.terms_id === offer.terms_id);
    const unavailable = !seller?.enabled || !product || !validProduct(product, intent) ||
      product.terms_id !== offer.terms_id || product.floor_price_twd > offer.total_price_twd ||
      offer.primary_features.some(f => !product.features.includes(f)) ||
      JSON.stringify(liveTerms) !== JSON.stringify(snapshotTerms) ||
      offer.items.some(i => !seller.products.some(p => p.product_id === i.product_id && p.category === i.category && p.stock >= i.quantity && p.delivery_days <= offer.delivery_days));
    const lostBenefit = (offer.benefits ?? []).some(b => !(seller?.benefits ?? []).some(entry =>
      JSON.stringify(entry.definition) === JSON.stringify(b) && evidenceSupports(seller, entry, product)));
    if (unavailable || lostBenefit || Date.parse(offer.expires_at) <= now) latest.delete(key);
  }
  for (const [key, offer] of latest) if (offer.variant === 'bundle' && latest.get(`${offer.seller_id}/standalone`)?.offer_id !== offer.baseline_offer_id) latest.delete(key);
}

export function advanceOffers(latest, offers) {
  for (const offer of offers) {
    if (offer.eligibility.status === 'rejected') continue;
    const key = `${offer.seller_id}/${offer.variant}`;
    // Unauthorised additions must not evict an authorised bundle.
    const existing = latest.get(key);
    if (offer.eligibility.status === 'needs_confirmation' && existing?.eligibility.status === 'eligible' &&
      latest.get(`${offer.seller_id}/standalone`)?.offer_id === existing.baseline_offer_id) continue;
    latest.set(key, offer);
  }
  for (const [key, offer] of latest) {
    if (offer.variant === 'bundle' && latest.get(`${offer.seller_id}/standalone`)?.offer_id !== offer.baseline_offer_id) latest.delete(key);
  }
}

function publicProduct(product) {
  return { brand: product.brand, model: product.model, features: [...product.features].sort(), attributes: copy(product.attributes) };
}

export function buildContext({ requestId, revision, round, offers, catalog, intent, now }) {
  const references = offers.filter(o => o.eligibility.status === 'eligible' && Date.parse(o.expires_at) > now).map(offer => {
    const seller = catalog.sellers.find(s => s.seller_id === offer.seller_id);
    const primary = seller.products.find(p => p.product_id === offer.items.find(i => i.role === 'primary').product_id);
    const terms = catalog.terms.find(t => t.terms_id === offer.terms_id);
    const { terms_id, ...commercialTerms } = terms;
    const addons = offer.items.filter(i => i.role === 'addon').map(i => i.category).sort();
    const comparison = { category: intent.category, quantity: 1, currency: 'TWD', tax_shipping_included: true,
      required_features: [...intent.required_features].sort(), variant: offer.variant, addons, terms: commercialTerms };
    return { seller_id: offer.seller_id, offer_id: offer.offer_id,
      comparison_key: createHash('sha256').update(JSON.stringify(comparison)).digest('hex'),
      primary_product: publicProduct(primary), total_price_twd: offer.total_price_twd,
      delivery_days: offer.delivery_days, terms: commercialTerms, expires_at: offer.expires_at,
      variant: offer.variant, addon_categories: addons };
  });
  return immutable(check('SharedNegotiationContext', { request_id: requestId, context_revision: revision,
    completed_round: round, as_of: new Date(now).toISOString(), offers: references }));
}

export function competitiveTerms(context, seller, candidateIds, now) {
  const products = seller.products.filter(p => candidateIds.includes(p.product_id));
  const valid = context.offers.filter(o => o.seller_id !== seller.seller_id && Date.parse(o.expires_at) > now);
  // Bound repeated model context: cheapest standalone, fastest standalone, and
  // cheapest bundle. Each remains one complete, attributable real offer.
  const standalone = valid.filter(o => o.variant === 'standalone');
  const selected = [
    [...standalone].sort((a,b) => a.total_price_twd-b.total_price_twd || a.offer_id.localeCompare(b.offer_id))[0],
    [...standalone].sort((a,b) => a.delivery_days-b.delivery_days || a.total_price_twd-b.total_price_twd || a.offer_id.localeCompare(b.offer_id))[0],
    valid.filter(o => o.variant === 'bundle').sort((a,b) => a.total_price_twd-b.total_price_twd || a.offer_id.localeCompare(b.offer_id))[0],
  ].filter(Boolean);
  return [...new Map(selected.map(o => [o.offer_id,o])).values()]
    .map(({ seller_id, offer_id, ...term }) => ({
      ...copy(term), differences: products.some(p => p.brand === term.primary_product.brand && p.model === term.primary_product.model &&
        JSON.stringify(p.attributes) === JSON.stringify(term.primary_product.attributes)) ? [] : ['Different model or specifications; meets the same request hard constraints.'],
    }));
}
