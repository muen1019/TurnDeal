import { economicMinimum, concessionCount } from './economics.mjs';
import { availableBenefits } from './personas.mjs';
// These helpers consume request-scoped, committed Backend state, never agent memory.
export function proposalReference(rfq, previous, now) {
  if (!rfq.proposal?.reference_offer_id) return null;
  const reference = previous.find(o => o.offer_id === rfq.proposal.reference_offer_id);
  if (!reference || reference.seller_id !== rfq.seller_id || reference.eligibility?.status !== 'eligible' ||
    Date.parse(reference.expires_at) <= now || !rfq.previous_offer_ids.includes(reference.offer_id) ||
    (rfq.proposal.kind === 'exchange_gift' && reference.variant !== 'bundle')) throw new Error('invalid_proposal_reference');
  return reference;
}

export function quotePolicy({ seller, rfq, previous, history = [], now, product, canBundle }) {
  const reference = proposalReference(rfq, previous, now);
  const old = previous.find(o => o.variant === 'standalone' && o.items[0].product_id === product.product_id);
  const oldBundle = previous.find(o => o.variant === 'bundle' && o.items[0].product_id === product.product_id);
  const credited = Math.max(0, ...[history.reduce((sum, t) => sum + (t.result?.proposal_response?.exchange_discount_twd ?? 0), 0),
    old && oldBundle ? oldBundle.total_price_twd - old.total_price_twd : 0]);
  const bundleDiscount = canBundle ? (seller.strategy.bundle_discount_twd ?? 0) : 0;
  if (seller.strategy.persona?.decision_mode === 'bounded') {
    const p = product.negotiation_policy;
    if (!p) throw new Error('missing_sku_policy');
    const exhausted = concessionCount(history,product.list_price_twd) >= p.max_concession_count;
    const maximum = old?.total_price_twd ?? product.list_price_twd;
    const protectedPrice = seller.strategy.persona.price_mode === 'protected';
    const ordinaryMinimum = protectedPrice || exhausted ? maximum : Math.max(
      product.floor_price_twd, product.list_price_twd - p.max_total_discount_twd,
      maximum - (old ? p.max_discount_per_step_twd : p.opening_discount_cap_twd));
    const exchange = rfq.proposal?.kind === 'exchange_gift';
    const remaining = !protectedPrice && !exhausted && canBundle && reference?.items[0].product_id === product.product_id
      ? Math.max(0, Math.min(p.gift_exchange_discount_cap_twd, seller.strategy.gift_exchange_discount_twd ?? 0) - credited) : 0;
    const benefits = availableBenefits(seller,rfq.round,product);
    const minimum = Math.max(ordinaryMinimum - (exchange ? remaining : 0), economicMinimum(product,benefits));
    return { product_id:product.product_id, minimum, maximum, credited, exchange, exchangeBaseline:ordinaryMinimum,
      bundleDiscount, oldBundleMaximum:oldBundle?.total_price_twd ?? Infinity,
      referenceMatches:(!reference || reference.items[0].product_id === product.product_id) && minimum <= maximum,
      concession_count:concessionCount(history,product.list_price_twd), policy_version:p.policy_version };
  }
  const floor = product.floor_price_twd + bundleDiscount;
  const regularMaximum = Math.max(floor, Math.min(product.list_price_twd - seller.strategy.round_discounts_twd[rfq.round - 1], old?.total_price_twd ?? Infinity));
  const exchange = rfq.proposal?.kind === 'exchange_gift';
  const referenceMatches = reference?.items[0].product_id === product.product_id;
  const remaining = canBundle && referenceMatches && seller.strategy.type !== 'firm_price'
    ? Math.max(0, (seller.strategy.gift_exchange_discount_twd ?? 0) - credited) : 0;
  const minimum = seller.strategy.persona?.price_mode === 'protected' || seller.strategy.type === 'firm_price' ? regularMaximum :
    exchange ? Math.max(floor, regularMaximum - remaining) : seller.strategy.persona ? regularMaximum : floor;
  return { product_id: product.product_id, minimum, maximum: regularMaximum, credited, exchange,
    bundleDiscount, oldBundleMaximum: oldBundle?.total_price_twd ?? Infinity,
    referenceMatches: !reference || referenceMatches };
}

export function exchangeDiscount(bound, price) {
  return bound.exchange ? Math.max(0, (bound.exchangeBaseline ?? bound.maximum) - price) : 0;
}

export function bundlePrice(bound, price) {
  return Math.min(bound.oldBundleMaximum, price + bound.credited + exchangeDiscount(bound, price) - bound.bundleDiscount);
}

export function proposalResponse(rfq, drafts, discount) {
  const p = rfq.proposal;
  const selected = drafts.find(d => d.variant === p.variant);
  const base = drafts.find(d => d.variant === 'standalone');
  const bundle = drafts.find(d => d.variant === 'bundle');
  let satisfied = Boolean(selected);
  if (p.kind === 'exchange_gift') satisfied &&= discount > 0;
  if (p.kind === 'add_gift') satisfied &&= Boolean(base && bundle && bundle.total_price_twd <= base.total_price_twd);
  if (p.kind === 'compare') satisfied &&= Boolean(base && bundle);
  if (p.kind === 'request_benefit') satisfied &&= Boolean(selected?.benefits?.some(b => b.kind === p.benefit_kind));
  const metTarget = p.target_total_twd === null || (selected && selected.total_price_twd <= p.target_total_twd);
  return { status: satisfied ? metTarget ? 'accepted' : 'countered' : 'declined', exchange_discount_twd: discount };
}

export function buyerMessage(proposal) {
  if (!proposal) return '請提供符合需求的報價。';
  const price = proposal.target_total_twd === null ? '' : `，希望總價不超過 NT$${proposal.target_total_twd}`;
  const benefit = { delivery_guarantee: '到貨承諾', late_compensation: '晚到補償', future_coupon: '下次購物券',
    return_extension: '較長退貨期', warranty_extension: '延長保固', priority_support: '優先客服', exchange_guarantee: '瑕疵換貨保障' };
  const text = { request_benefit: `可以提供${benefit[proposal.benefit_kind]}嗎`, compare: '請比較滑鼠單買與含滑鼠墊的價格', add_gift: '能否同價加送一張滑鼠墊',
    exchange_gift: '如果取消滑鼠墊，可以換成額外折扣嗎', lower_price: `請再優惠一點（${proposal.variant === 'bundle' ? '含滑鼠墊' : '滑鼠單買'}）` };
  return `${text[proposal.kind]}${price}。`;
}

export function sellerMessage(result) {
  if (result.outcome !== 'offered') return { refused: '無法提供符合需求的商品。', timeout: '本輪逾時，沒有新報價。', error: '本輪回覆未通過驗證，沒有新報價。' }[result.outcome];
  const reply = { accepted: '可以滿足這次條件。', countered: '目標價無法達成，提供以下還價。', declined: '無法同意這項條件，仍可提供以下方案。' }[result.proposal_response?.status] ?? '';
  const offers = result.drafts.map(d => `${d.variant === 'bundle' ? '含滑鼠墊' : '單買'} NT$${d.total_price_twd}（${d.delivery_days} 天到貨）`).join('；');
  const benefits = result.drafts.find(d => d.variant === 'standalone')?.benefits ?? [];
  return `${reply}${offers}。${benefits.length ? `另含：${benefits.map(b => b.description).join('、')}（須符合各權益條件；未來優惠不抵本次價格）。` : ''}${result.proposal_response?.exchange_discount_twd ? `本輪取消贈品額外折讓 NT$${result.proposal_response.exchange_discount_twd}。` : ''}${result.is_final ? '這是最終報價。' : ''}`;
}
