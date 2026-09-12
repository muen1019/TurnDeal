// Shared by the Seller and Backend: capability is specific to the primary SKU.
export function eligiblePad(seller, product, rfq) {
  const persona=seller.strategy.persona;
  if(seller.strategy.bundle_mode!=='free_optional_mouse_pad' || !rfq.allowed_addon_categories.includes('mouse_pad') ||
    (persona && rfq.round<persona.gift_from_round))return null;
  return seller.products.find(p=>p.category==='mouse_pad' && p.stock>0 && p.delivery_days<=product.delivery_days &&
    p.terms_id===product.terms_id && (persona?.decision_mode!=='bounded' ||
      product.negotiation_policy?.addon_costs.some(a=>a.product_id===p.product_id && a.cost_twd<=product.negotiation_policy.gift_cost_budget_twd)))??null;
}
