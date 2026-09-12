import type {Offer,RequestSnapshot} from '../../contract.generated';
import {ItemRow,PriceBlock,StatusPill} from './offerPrimitives';
import {findSeller,offerName} from './offerUtils';

export function DecisionSummary({snapshot,offer}:{snapshot:RequestSnapshot;offer:Offer}) {
  return <section className="offer-ui accepted-receipt">
    <StatusPill tone="success">已採用</StatusPill>
    <h2>{offerName(offer)}</h2><p>{findSeller(snapshot,offer.seller_id)?.name}</p>
    <PriceBlock amount={offer.total_price_twd}/><p>決策已保存；尚未購買或付款。</p>
    {offer.items.map(item=><ItemRow key={item.product_id} item={item}/>)}
  </section>;
}
