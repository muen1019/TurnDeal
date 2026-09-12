import type {Offer, RankedOffer, RequestSnapshot} from '../../contract.generated';

export type SellerAgent = RequestSnapshot['seller_agents'][number];
export type SellerRound = SellerAgent['rounds'][number];
export type OfferItem = Offer['items'][number];
export type SponsoredPlacement = NonNullable<RequestSnapshot['sponsored_placement']>;
export type MotionSource = 'pointer' | 'keyboard';

export function formatTwd(value: number): string {
  return 'NT$' + new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function categoryLabel(category: OfferItem['category']): string {
  if (category === 'mouse') {
    return '無線滑鼠';
  }

  if (category === 'mouse_pad') {
    return '滑鼠墊';
  }

  return String(category);
}

export function roleLabel(role: OfferItem['role']): string {
  return role === 'primary' ? '主商品' : '配件';
}

export function outcomeLabel(outcome: SellerRound['outcome']): string {
  const labels: Record<SellerRound['outcome'], string> = {
    offered: '已報價',
    refused: '拒絕',
    timeout: '逾時',
    error: '錯誤',
  };

  return labels[outcome] ?? String(outcome);
}

export function sellerStatusLabel(status: SellerAgent['status']): string {
  const labels: Record<SellerAgent['status'], string> = {
    pending: '等待中',
    negotiating: '議價中',
    offered: '已報價',
    refused: '已拒絕',
    timeout: '逾時',
    error: '錯誤',
  };

  return labels[status] ?? String(status);
}

export function findSeller(snapshot: RequestSnapshot, sellerId: string): SellerAgent | undefined {
  return snapshot.seller_agents.find((seller) => seller.seller_id === sellerId);
}

export function findRank(snapshot: RequestSnapshot, offerId: string): RankedOffer | null {
  return snapshot.ranked_offers.find((ranked) => ranked.offer_id === offerId) ?? null;
}

export function offerName(offer: Offer): string {
  return offer.items.map((item) => categoryLabel(item.category)).join(' + ');
}

export function mediaForOffer(offer: Offer): string {
  return offer.variant === 'bundle' ? '/images/bundle-demo.svg' : '/images/mouse-demo.svg';
}

export function trustedOfferLabel(snapshot: RequestSnapshot, offer: Offer): string | null {
  if (offer.eligibility.status !== 'eligible') {
    return offer.eligibility.status === 'needs_confirmation' ? '需確認' : '不可採用';
  }

  if (offer.variant === 'bundle' && offer.baseline_offer_id) {
    const baseline = snapshot.offers.find((candidate) => candidate.offer_id === offer.baseline_offer_id);
    if (baseline && baseline.total_price_twd === offer.total_price_twd) {
      return '免費配件';
    }
  }

  return null;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'button,a,input,textarea,select,summary,[role="button"],[contenteditable="true"],[data-no-swipe]',
    ),
  );
}

export function clampDeckDisplacement(dx: number, width: number): number {
  const limit = Math.max(width, 1);
  const abs = Math.abs(dx);
  if (abs <= limit) {
    return dx;
  }

  return Math.sign(dx) * (limit + (abs - limit) * 0.25);
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function limitCodePoints(value: string, max: number): string {
  const points = Array.from(value);
  return points.length > max ? points.slice(0, max).join('') : value;
}
