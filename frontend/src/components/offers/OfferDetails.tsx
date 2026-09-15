import {ArrowLeft, Check} from 'lucide-react';
import type {Offer, RankedOffer, RequestSnapshot} from '../../contract.generated';
import {findSeller, formatDateTime, offerName, trustedOfferLabel} from './offerUtils';
import {ItemRow, OfferButton, OfferMedia, PriceBlock, StatusMessage, StatusPill} from './offerPrimitives';
import '../../styles/offers.css';

export interface OfferDetailsProps {
  snapshot: RequestSnapshot;
  offer: Offer;
  ranking: RankedOffer | null;
  pending?: boolean;
  expired?: boolean;
  onBack: () => void;
  onAccept?: (offerId: Offer['offer_id'], offer: Offer) => void;
}

export function OfferDetails({snapshot, offer, ranking, pending = false, expired = false, onBack, onAccept}: OfferDetailsProps) {
  const seller = findSeller(snapshot, offer.seller_id);
  const label = trustedOfferLabel(snapshot, offer);
  const adoptionDisabled = pending || expired || offer.eligibility.status !== 'eligible' || snapshot.status !== 'awaiting_user';

  return (
    <section className="offer-ui offer-details" aria-labelledby="offer-details-title">
      <button className="offer-link-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        返回方案
      </button>

      <div className="offer-details__hero">
        <OfferMedia offer={offer} compact />
        <div className="offer-details__summary">
          <p>{seller?.name ?? '賣家'}</p>
          <h2 id="offer-details-title">{offerName(offer,snapshot)}</h2>
          <div className="offer-card__labels">
            {ranking ? <StatusPill>第 {ranking.rank} 名</StatusPill> : null}
            {label ? <StatusPill tone={label === '免費配件' ? 'success' : 'neutral'}>{label}</StatusPill> : null}
            {snapshot.sponsored_placement?.seller_id === offer.seller_id ? <StatusPill tone="sponsored">Sponsored</StatusPill> : null}
            {expired ? <StatusPill tone="danger">已過期</StatusPill> : null}
          </div>
          <PriceBlock amount={offer.total_price_twd} />
          <p>預計 {offer.delivery_days} 天送達 · 有效至 {formatDateTime(offer.expires_at)}</p>
        </div>
      </div>

      {pending ? <StatusMessage tone="pending">提交中，正在等待確認</StatusMessage> : null}
      {expired ? <StatusMessage tone="danger">此方案已過期，不能採用</StatusMessage> : null}

      <div className="offer-details__grid">
        <section className="offer-section" aria-labelledby="offer-items-title">
          <h3 id="offer-items-title">商品明細</h3>
          <div className="offer-list">
            {offer.items.map((item) => (
              <ItemRow key={`${item.product_id}:${item.role}`} item={item} snapshot={snapshot} />
            ))}
          </div>
        </section>

        <section className="offer-section" aria-labelledby="offer-reason-title">
          <h3 id="offer-reason-title">推薦理由</h3>
          <p>{ranking?.reason ?? '此方案沒有提供推薦理由。'}</p>
          {ranking?.tradeoffs.length ? (
            <>
              <h4>取捨</h4>
              <ul className="offer-bullet-list">
                {ranking.tradeoffs.map((tradeoff) => (
                  <li key={tradeoff}>{tradeoff}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="offer-section" aria-labelledby="offer-terms-title">
          <h3 id="offer-terms-title">採用條件</h3>
          <p>
            此總價包含稅與運送。請在 {formatDateTime(offer.expires_at)} 前採用；
            採用後仍會在兌換前重新確認庫存、到期時間與配送條件。
          </p>
        </section>
      </div>

      {onAccept ? (
        <div className="offer-sticky-actions">
          <OfferButton type="button" variant="primary" icon={<Check size={18} />} disabled={adoptionDisabled} onClick={() => onAccept(offer.offer_id, offer)}>
            立即採用
          </OfferButton>
        </div>
      ) : null}
    </section>
  );
}
