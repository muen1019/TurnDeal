import {BadgeCheck, ReceiptText} from 'lucide-react';
import type {Offer, RedemptionReceipt, RequestSnapshot} from '../../contract.generated';
import {findSeller, formatDateTime, formatTwd, offerName} from './offerUtils';
import {ItemRow, OfferButton, PriceBlock, StatusMessage, StatusPill} from './offerPrimitives';
import '../../styles/offers.css';

export interface AcceptedReceiptProps {
  snapshot: RequestSnapshot;
  offer: Offer;
  receipt?: RedemptionReceipt | null;
  pending?: boolean;
  expired?: boolean;
  onRedeem?: (offerId: Offer['offer_id'], offer: Offer) => void;
}

export function AcceptedReceipt({snapshot, offer, receipt = null, pending = false, expired = false, onRedeem}: AcceptedReceiptProps) {
  const seller = findSeller(snapshot, offer.seller_id);
  const canRedeem = Boolean(onRedeem) && !pending && !receipt && !expired;

  return (
    <section className="offer-ui accepted-receipt" aria-labelledby="accepted-title">
      <div className="accepted-receipt__header">
        <StatusPill tone={receipt ? 'success' : 'pending'}>{receipt ? '已建立模擬兌換' : '已採用'}</StatusPill>
        <h2 id="accepted-title">{offerName(offer)}</h2>
        <p>{seller?.name ?? '賣家'}</p>
      </div>

      <div className="accepted-receipt__summary">
        <PriceBlock amount={offer.total_price_twd} />
        <p>這是虛擬市場兌換，不是實際付款。</p>
      </div>

      <div className="offer-list">
        {offer.items.map((item) => (
          <ItemRow key={`${item.product_id}:${item.role}`} item={item} />
        ))}
      </div>

      {expired && !receipt ? <StatusMessage tone="danger">此方案已過期，不能建立新的虛擬兌換。</StatusMessage> : null}
      {pending ? <StatusMessage tone="pending">正在建立虛擬兌換</StatusMessage> : null}

      {!receipt ? (
        <div className="offer-sticky-actions">
          <OfferButton type="button" variant="primary" icon={<BadgeCheck size={18} />} disabled={!canRedeem} onClick={() => onRedeem?.(offer.offer_id, offer)}>
            虛擬兌換
          </OfferButton>
        </div>
      ) : (
        <article className="receipt-panel" aria-labelledby="receipt-title">
          <div className="receipt-panel__title">
            <ReceiptText size={20} aria-hidden="true" />
            <h3 id="receipt-title">兌換收據</h3>
          </div>
          <p>已建立模擬兌換。此收據僅供 Demo 流程確認。</p>
          <details className="offer-technical-details">
            <summary>收據識別</summary>
            <dl className="offer-definition-list">
              <div>
                <dt>Redemption ID</dt>
                <dd>{receipt.redemption_id}</dd>
              </div>
              <div>
                <dt>Request ID</dt>
                <dd>{receipt.request_id}</dd>
              </div>
              <div>
                <dt>Offer ID</dt>
                <dd>{receipt.offer_id}</dd>
              </div>
              <div>
                <dt>Seller ID</dt>
                <dd>{receipt.seller_id}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{receipt.mode}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatTwd(receipt.total_price_twd)}</dd>
              </div>
              <div>
                <dt>Redeemed At</dt>
                <dd>{formatDateTime(receipt.redeemed_at)}</dd>
              </div>
            </dl>
          </details>
        </article>
      )}
    </section>
  );
}
