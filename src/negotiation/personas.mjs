import { copy } from './contracts.mjs';

export function evidenceSupports(seller, entry, product) {
  if (!seller || !product) return false;
  const b = entry.definition, evidence = entry.evidence;
  return entry.enabled && entry.available_units > 0 && evidence?.mode === 'simulation' && b.simulation === true &&
    evidence.seller_id === seller.seller_id && evidence.evidence_id === b.evidence_id && evidence.kind === b.kind &&
    Array.isArray(evidence.product_ids) && evidence.product_ids.includes(product.product_id) && JSON.stringify(evidence.definition) === JSON.stringify(b) &&
    (b.kind !== 'delivery_guarantee' || product.delivery_days <= b.duration_days);
}

export function availableBenefits(seller, round, product) {
  return (seller.strategy.persona?.benefit_schedule ?? []).filter(s => s.from_round <= round &&
    (s.benefit.kind !== 'late_compensation' || (seller.benefits ?? []).some(e => e.definition.kind === 'delivery_guarantee' && evidenceSupports(seller, e, product))))
    .flatMap(s => (seller.benefits ?? []).filter(e => e.definition.benefit_id === s.benefit.benefit_id &&
      JSON.stringify(e.definition) === JSON.stringify(s.benefit) && evidenceSupports(seller, e, product)).map(e => copy(e.definition)));
}

export function validateBenefits(seller, product, round, benefits, previous = []) {
  const available = availableBenefits(seller, round, product);
  const ids = benefits.map(b => b.benefit_id);
  if (new Set(ids).size !== ids.length || benefits.some(b => !available.some(a => JSON.stringify(a) === JSON.stringify(b)))) return false;
  const old = previous.filter(o => o.items[0].product_id === product.product_id).flatMap(o => o.benefits ?? []);
  return old.every(b => ids.includes(b.benefit_id)) &&
    (seller.strategy.persona?.benefit_schedule ?? []).filter(s=>s.from_round===1).every(s=>
      !available.some(b=>b.benefit_id===s.benefit.benefit_id) || ids.includes(s.benefit.benefit_id)) &&
    (!seller.strategy.persona || round < seller.strategy.persona.final_round || available.every(b => ids.includes(b.benefit_id)));
}

export function personaFinal(seller, round, credited) {
  const p = seller.strategy.persona;
  if (!p) return seller.strategy.final_round !== null && round >= seller.strategy.final_round;
  if (round >= p.final_round) return true;
  return p.persona === 'bundle_curator' && credited >= (seller.strategy.gift_exchange_discount_twd || Infinity);
}

export function personaState(seller, round, credited = 0) {
  const policy = seller.strategy.persona;
  if (!policy) return null;
  return { persona: policy.persona, objective: policy.objective,
    phase: round === 1 ? 'opening' : personaFinal(seller, round, credited) ? 'final' : 'conceding',
    stop_rule: { price_optimizer: 'Final at configured last inventory markdown round; never jump to floor.',
      speed_seller: 'Protect price; logistics promise then compensation; stop at the last registered concession round.',
      bundle_curator: 'Stop when request-wide gift-to-cash allowance is exhausted or the configured last round.',
      loyalty_builder: 'Protect current price; offer future coupon then return flexibility; stop at last benefit round.',
      margin_guardian: 'Protect margin; warranty then priority support then exchange; stop at last service round.' }[policy.persona] };
}
