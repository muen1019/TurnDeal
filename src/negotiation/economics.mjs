// Private, versioned simulation economics. All costs use the same tax-inclusive
// cash basis; this is contribution protection, not an accounting gross margin.
export function economicMinimum(product, benefits = [], addonId = null) {
  const p = product.negotiation_policy;
  if (!p) return Infinity;
  const addon = addonId === null ? { cost_twd: 0 } : p.addon_costs.find(a => a.product_id === addonId);
  if (!addon || addon.cost_twd > p.gift_cost_budget_twd) return Infinity;
  let extras = addon.cost_twd;
  for (const benefit of benefits) {
    const cost = p.benefit_costs.find(b => b.benefit_id === benefit.benefit_id);
    if (!cost || cost.cost_twd < benefit.amount_twd) return Infinity;
    extras += cost.cost_twd;
  }
  if (benefits.filter(b => b.kind === 'future_coupon').reduce((n,b) => n+b.amount_twd,0) > p.voucher_budget_twd) return Infinity;
  const cost = p.unit_cost_twd + p.shipping_cost_twd + extras;
  return Math.max(product.floor_price_twd, product.list_price_twd - p.max_total_discount_twd,
    product.list_price_twd + extras - p.total_concession_budget_twd,
    Math.ceil(cost * 10000 / (10000 - p.min_margin_bps)));
}

export function concessionCount(history, baseline = Infinity) {
  let previous = null, count = 0;
  for (const turn of history) {
    const quote = turn.result?.quotes?.find(q => q.variant === 'standalone');
    if (!quote) continue;
    const benefits = new Set(turn.result.quotes.flatMap(q => q.benefit_ids ?? []));
    const bundle = turn.result.quotes.some(q => q.variant === 'bundle');
    if (!previous ? quote.total_price_twd < baseline || bundle || benefits.size > 0 :
      quote.total_price_twd < previous.price || (bundle && !previous.bundle) ||
      [...benefits].some(id => !previous.benefits.has(id))) count++;
    previous = { price: quote.total_price_twd, benefits, bundle };
  }
  return count;
}

export function countWithDrafts(history, drafts, product) {
  return concessionCount([...history,{result:{quotes:drafts.map(d=>({variant:d.variant,total_price_twd:d.total_price_twd,
    benefit_ids:(d.benefits ?? []).map(b=>b.benefit_id)}))}}],product.list_price_twd);
}

export function economicallyValid(seller, product, price, benefits, addonId = null) {
  return seller.strategy.persona?.decision_mode !== 'bounded' || price >= economicMinimum(product, benefits, addonId);
}
