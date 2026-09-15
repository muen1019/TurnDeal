import {OfferMedia,ProductColor,StatusPill} from './offerPrimitives';
import {findSeller,offerName} from './offerUtils';
import type {Offer,RequestSnapshot} from '../../contract.generated';

/** The accepted product, shown as the top of the same card as checkout — one continuous flow, not a
 * separate summary block stacked above a separate checkout block. */
export function CheckoutProductHeader({snapshot,offer}:{snapshot:RequestSnapshot;offer:Offer}){
  const seller=findSeller(snapshot,offer.seller_id);
  const primaryProductId=offer.items.find(item=>item.role==='primary')?.product_id??offer.items[0]?.product_id??'';
  return <div className="checkout-product">
    <div className="checkout-product-media">
      <OfferMedia offer={offer}/>
      <span className="checkout-product-badge"><StatusPill tone="success">已採用</StatusPill></span>
    </div>
    <div className="checkout-product-info">
      <h1>{offerName(offer,snapshot)}</h1>
      {seller&&<p className="checkout-product-seller">{seller.name}</p>}
      <div className="checkout-product-meta"><ProductColor snapshot={snapshot} productId={primaryProductId}/></div>
      <div className="checkout-product-price"><strong>NT${offer.total_price_twd.toLocaleString()}</strong><span>含稅運</span></div>
    </div>
  </div>;
}
