import type {Offer,RequestSnapshot} from '../../contract.generated';
import {ItemRow,PriceBlock,StatusPill} from './offerPrimitives';
import {findSeller,offerName} from './offerUtils';

export function DecisionSummary({snapshot,offer}:{snapshot:RequestSnapshot;offer:Offer}) {
  return <section className="offer-ui accepted-receipt">
    <StatusPill tone="success">已採用</StatusPill>
    <h2>{offerName(offer,snapshot)}</h2><p>{findSeller(snapshot,offer.seller_id)?.name}</p>
    <PriceBlock amount={offer.total_price_twd}/><p>已保存選定報價；結帳與訂單狀態如下。</p>
    {offer.items.map(item=><ItemRow key={item.product_id} item={item} snapshot={snapshot}/>)}
  </section>;
}
