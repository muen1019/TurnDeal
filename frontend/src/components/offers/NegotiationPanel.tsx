import {ChevronRight} from 'lucide-react';
import type {RequestSnapshot} from '../../contract.generated';
import {formatTwd, outcomeLabel, sellerStatusLabel} from './offerUtils';
import {StatusPill} from './offerPrimitives';
import '../../styles/offers.css';

const stopLabels: Record<string,string> = {seller_final:'賣家已提出最終報價',max_rounds:'已完成五輪',refused:'賣家拒絕',timeout:'賣家逾時',error:'賣家發生錯誤',no_adjustment:'無進一步調整',global_deadline:'已達整體期限',call_budget:'已達呼叫上限',token_budget:'已達 token 上限'};

export interface NegotiationPanelProps {
  snapshot: RequestSnapshot;
  activeOfferId?: string | null;
  onSelectOffer?: (offerId: string) => void;
}

export function NegotiationPanel({snapshot, activeOfferId = null, onSelectOffer}: NegotiationPanelProps) {
  const sponsoredSellerId = snapshot.sponsored_placement?.seller_id ?? null;
  const roundCount = Math.max(0, ...snapshot.seller_agents.map((seller) => seller.rounds.length));

  return (
    <section className="offer-ui negotiation-panel" aria-labelledby="negotiation-title">
      <div className="negotiation-panel__header">
        <div>
          <p>
            {snapshot.seller_agents.length} 家賣家 · {roundCount} 輪議價
          </p>
          <h2 id="negotiation-title">議價紀錄</h2>
        </div>
        {snapshot.sponsored_placement ? <StatusPill tone="sponsored">Sponsored</StatusPill> : null}
      </div>

      {snapshot.sponsored_placement ? (
        <p className="negotiation-panel__sponsored">Sponsored 只代表展示位置，不影響推薦排序。</p>
      ) : null}

      <div className="negotiation-panel__sellers">
        {snapshot.seller_agents.map((seller) => (
          <article className="negotiation-seller" key={seller.seller_id}>
            <div className="negotiation-seller__topline">
              <div>
                <h3>{seller.name}</h3>
                <p>{seller.match_reason}</p>
                {seller.stop_reason && <p>{stopLabels[seller.stop_reason]}</p>}
              </div>
              <div className="negotiation-seller__badges">
                <StatusPill tone={seller.status === 'offered' ? 'success' : seller.status === 'error' ? 'danger' : 'neutral'}>
                  {sellerStatusLabel(seller.status)}
                </StatusPill>
                {seller.seller_id === sponsoredSellerId ? <StatusPill tone="sponsored">Sponsored</StatusPill> : null}
              </div>
            </div>

            <div className="negotiation-rounds">
              {seller.rounds.map((round) => (
                <div className="negotiation-round" key={`${seller.seller_id}:${round.round}`}>
                  <div>
                    <strong>第 {round.round} 輪</strong>
                    <span>{outcomeLabel(round.outcome)}</span>
                    {round.is_final && <StatusPill tone="success">最終報價</StatusPill>}
                  </div>
                  <div className="negotiation-round__offers">
                    {round.offer_ids.length ? (
                      round.offer_ids.map((offerId, index) => {
                        const offer = snapshot.offers.find((candidate) => candidate.offer_id === offerId);
                        const active = offerId === activeOfferId;
                        return (
                          <button
                            className="negotiation-offer-link"
                            type="button"
                            key={offerId}
                            aria-current={active ? 'true' : undefined}
                            onClick={() => onSelectOffer?.(offerId)}
                            disabled={!onSelectOffer}
                          >
                            <span>報價 {index + 1}</span>
                            {offer ? <strong>{formatTwd(offer.total_price_twd)}</strong> : <em>找不到報價</em>}
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        );
                      })
                    ) : (
                      <span className="negotiation-round__empty">本輪沒有報價</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
