import { evidenceSupports } from '../negotiation/personas.mjs';

// Projection from authoritative capability rows. Never return policy JSON/costs.
export function publicServices(db, sellerId, productId) {
  const p = db.prepare('SELECT product_id,delivery_days FROM seller_inventory WHERE seller_id=? AND product_id=?').get(sellerId,productId);
  if (!p) return [];
  const row=db.prepare('SELECT policy_json FROM seller_persona_policies WHERE seller_id=?').get(sellerId);
  const policy=row ? JSON.parse(row.policy_json) : null;
  return db.prepare('SELECT * FROM seller_benefit_catalog WHERE seller_id=?').all(sellerId).flatMap(row=> {
    const b=JSON.parse(row.definition_json);
    const entry={definition:b,evidence:JSON.parse(row.evidence_json),enabled:row.enabled===1,available_units:row.available_units};
    const scheduled=policy?.benefit_schedule.find(s=>s.benefit.benefit_id===b.benefit_id && JSON.stringify(s.benefit)===JSON.stringify(b));
    if (!scheduled || !evidenceSupports({seller_id:sellerId},entry,p)) return [];
    return [{benefit_id:b.benefit_id,kind:b.kind,duration_days:b.duration_days,conditions:b.conditions,
      evidence_id:b.evidence_id,simulation:b.simulation,
      commitment:scheduled.from_round===1 && !b.requires_membership && b.minimum_spend_twd===0 ? 'included':'negotiable',
      valid_until:null}];
  });
}
