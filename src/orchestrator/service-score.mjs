// Score only Backend-verified public conditions. Unknown dimensions score zero,
// not a fictitious average; coupons never count as current cash or after-sales.
export function serviceScore(benefits) {
  const days = kind => Math.max(0,...benefits.filter(b=>b.kind===kind && Number.isInteger(b.duration_days) && b.duration_days>0).map(b=>b.duration_days));
  const support = benefits.filter(b=>b.kind==='priority_support' && Number.isInteger(b.duration_days) && b.duration_days>0).map(b=>b.duration_days);
  return 50*Math.min(1,days('warranty_extension')/730) + 25*Math.min(1,days('return_extension')/30) +
    15*Math.min(1,days('exchange_guarantee')/30) + (support.length ? 10/Math.min(...support) : 0);
}

export function includedServices(services, now) {
  return (services ?? []).filter(s=>s.commitment==='included' && typeof s.evidence_id==='string' && s.evidence_id.length &&
    typeof s.conditions==='string' && s.conditions.length && (s.valid_until===null || Date.parse(s.valid_until)>Date.parse(now)));
}
