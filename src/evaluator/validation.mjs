import { check } from '../negotiation/contracts.mjs';
import { pruneUnavailable } from '../negotiation/validation.mjs';

// Eligibility is recalculated against live inventory and the negotiated terms snapshot.
// Untrusted status flags alone are never enough to enter the ranking set.
export function revalidateOffers({ offers, intent, catalog, originalCatalog, orchestration, now }) {
  const accepted = new Map();
  for (const offer of offers) {
    try { check('Offer', offer); } catch { continue; }
    const seller = catalog.sellers.find(s => s.seller_id === offer.seller_id);
    const primary = offer.items.find(i => i.role === 'primary');
    const branch = orchestration.seller_agents.find(s => s.seller_id === offer.seller_id);
    const terms = catalog.terms.find(t => t.terms_id === offer.terms_id);
    if (!seller || !branch?.candidate_products.some(p => p.product_id === primary?.product_id) ||
      !['eligible', 'needs_confirmation'].includes(offer.eligibility.status) ||
      offer.total_price_twd > intent.max_total_twd || offer.delivery_days > intent.delivery_days_max ||
      offer.items.some(i => i.quantity !== 1) || !intent.required_features.every(f => offer.primary_features.includes(f)) ||
      terms?.payment_obligation !== 'one_time') continue;
    if (offer.variant === 'bundle' && (intent.negotiation_policy.bundle_mode === 'disabled' ||
      !intent.negotiation_policy.allowed_addon_categories.includes('mouse_pad'))) continue;
    accepted.set(`${offer.seller_id}/${offer.variant}`, offer);
  }
  pruneUnavailable(accepted, catalog, originalCatalog, intent, now);
  for (const [key, offer] of accepted) {
    if (offer.variant !== 'bundle') continue;
    const base = accepted.get(`${offer.seller_id}/standalone`);
    if (!base || base.eligibility.status !== 'eligible' || base.offer_id !== offer.baseline_offer_id ||
      base.items[0].product_id !== offer.items[0].product_id || base.terms_id !== offer.terms_id ||
      offer.delivery_days > base.delivery_days ||
      (offer.eligibility.status === 'eligible' && offer.total_price_twd - base.total_price_twd >
        (intent.negotiation_policy.bundle_mode === 'related_no_extra_cost' ? 0 : intent.negotiation_policy.max_addon_increment_twd))) accepted.delete(key);
  }
  return [...accepted.values()];
}
