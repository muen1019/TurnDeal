import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {motion, useReducedMotion} from 'motion/react';
import {ArrowLeft, Check, RotateCcw, X} from 'lucide-react';
import type {Offer, RankedOffer, RequestSnapshot} from '../../contract.generated';
import {
  clampDeckDisplacement,
  findSeller,
  isInteractiveTarget,
  offerName,
  trustedOfferLabel,
} from './offerUtils';
import type {MotionSource} from './offerUtils';
import {OfferButton, OfferMedia, OfferSummaryMeta, PriceBlock, StatusMessage, StatusPill} from './offerPrimitives';
import '../../styles/offers.css';

const INTENT_PX = 8;
const EXIT_DISTANCE_MULTIPLIER = 1.2;
const EXIT_MS = 200;
const ENTER_MS = 200;
const SPRING = {type: 'spring', duration: 0.5, bounce: 0.2} as const;
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

type VisualPhase = 'resting' | 'dragging' | 'returning' | 'idle';

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  requestId: string;
  offerId: string;
  recognized: boolean;
  rawDx: number;
  rawDy: number;
}

interface LeavingCard {
  offer: Offer;
  ranking: RankedOffer | null;
  sellerName: string;
  startX: number;
  width: number;
  key: number;
}

export interface OfferDeckProps {
  snapshot: RequestSnapshot;
  offer: Offer | null;
  ranking: RankedOffer | null;
  totalOffers: number;
  sellerName?: string;
  pending?: boolean;
  expired?: boolean;
  canUndo?: boolean;
  disabledReason?: string;
  onAccept: (offerId: Offer['offer_id'], offer: Offer) => void;
  onSkip: (offerId: Offer['offer_id'], offer: Offer) => void;
  onUndo: () => void;
  onDetails: (offerId: Offer['offer_id'], offer: Offer) => void;
}

export function OfferDeck({
  snapshot,
  offer,
  ranking,
  totalOffers,
  sellerName,
  pending = false,
  expired = false,
  canUndo = false,
  disabledReason,
  onAccept,
  onSkip,
  onUndo,
  onDetails,
}: OfferDeckProps) {
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<PointerState | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef<number | null>(null);
  const leavingTimeoutRef = useRef<number | null>(null);
  const keyboardTimeoutRef = useRef<number | null>(null);
  const acceptedLockRef = useRef<string | null>(null);
  const keyboardActionRef = useRef(false);
  const [phase, setPhase] = useState<VisualPhase>('idle');
  const [visualX, setVisualX] = useState(0);
  const [visualDx, setVisualDx] = useState(0);
  const [visualDy, setVisualDy] = useState(0);
  const [leaving, setLeaving] = useState<LeavingCard | null>(null);
  const [entryKey, setEntryKey] = useState(0);
  const [keyboardTransition, setKeyboardTransition] = useState(false);
  const [entering, setEntering] = useState(false);
  const lastOfferKeyRef = useRef<string | null>(offer ? `${snapshot.request_id}:${offer.offer_id}` : null);

  const resolvedSellerName = sellerName ?? (offer ? findSeller(snapshot, offer.seller_id)?.name : undefined) ?? '賣家';
  const acceptDisabled = pending || expired || !offer || offer.eligibility.status !== 'eligible' || snapshot.status !== 'awaiting_user';
  const lockKey = offer ? `${snapshot.request_id}:${offer.offer_id}` : null;
  const locallyLocked = lockKey !== null && acceptedLockRef.current === lockKey;
  const threshold = pointerRef.current ? pointerRef.current.width * 0.25 : (cardRef.current?.getBoundingClientRect().width ?? 640) * 0.25;

  useEffect(() => {
    const nextKey = offer ? `${snapshot.request_id}:${offer.offer_id}` : null;
    if (lastOfferKeyRef.current !== nextKey) {
      pointerRef.current = null;
      setVisualX(0);
      setVisualDx(0);
      setVisualDy(0);
      setPhase('resting');
      setEntering(!keyboardTransition);
      setEntryKey((key) => key + 1);
      lastOfferKeyRef.current = nextKey;
      if (acceptedLockRef.current && acceptedLockRef.current !== nextKey) {
        acceptedLockRef.current = null;
      }
    }
  }, [keyboardTransition, offer, snapshot.request_id]);

  useEffect(() => {
    if (!entering) {
      return;
    }

    const id = window.setTimeout(() => setEntering(false), ENTER_MS);
    return () => window.clearTimeout(id);
  }, [entering]);

  useEffect(() => {
    pointerRef.current = null;
    setVisualX(0);
    setVisualDx(0);
    setVisualDy(0);
    if (reduceMotion || pending || expired) {
      setPhase('resting');
    }
  }, [reduceMotion, pending, expired, snapshot.request_id, offer?.offer_id]);

  useEffect(() => {
    if (!pending && snapshot.status !== 'awaiting_user') {
      acceptedLockRef.current = null;
    }
  }, [pending, snapshot.status]);

  const resetGesture = useCallback((immediate = false) => {
    pointerRef.current = null;
    setVisualDx(0);
    setVisualDy(0);
    setVisualX(0);
    setPhase(immediate || reduceMotion ? 'resting' : 'returning');
  }, [reduceMotion]);

  const suppressNextClick = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressClickTimeoutRef.current);
    }
    suppressClickTimeoutRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimeoutRef.current = null;
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (suppressClickTimeoutRef.current !== null) {
        window.clearTimeout(suppressClickTimeoutRef.current);
      }
      if (leavingTimeoutRef.current !== null) window.clearTimeout(leavingTimeoutRef.current);
      if (keyboardTimeoutRef.current !== null) window.clearTimeout(keyboardTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const cancelImmediate = () => resetGesture(true);
    const cancelEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pointerRef.current) {
        event.preventDefault();
        resetGesture(true);
      }
    };

    window.addEventListener('blur', cancelImmediate);
    window.addEventListener('resize', cancelImmediate);
    window.addEventListener('keydown', cancelEscape);
    document.addEventListener('visibilitychange', cancelImmediate);

    return () => {
      window.removeEventListener('blur', cancelImmediate);
      window.removeEventListener('resize', cancelImmediate);
      window.removeEventListener('keydown', cancelEscape);
      document.removeEventListener('visibilitychange', cancelImmediate);
    };
  }, [resetGesture]);

  const transform = reduceMotion || visualX === 0 ? 'translateX(0px)' : `translateX(${visualX}px) rotate(${Math.max(-9, Math.min(9, visualX / 24))}deg)`;
  const activeMeetsThreshold = Math.abs(visualDx) >= threshold && Math.abs(visualDx) > Math.abs(visualDy);
  const activeDirection = activeMeetsThreshold ? (visualDx > 0 && !acceptDisabled ? 'accept' : visualDx < 0 ? 'skip' : null) : null;

  const transition = useMemo(() => {
    if (phase === 'dragging' || reduceMotion || keyboardTransition) {
      return {duration: 0};
    }

    if (phase === 'returning') {
      return SPRING;
    }

    if (entering) {
      return {duration: ENTER_MS / 1000, ease: EASE_OUT};
    }

    return {duration: 0};
  }, [entering, keyboardTransition, phase, reduceMotion]);

  const completeSkip = useCallback((source: MotionSource, startX = 0, width = cardRef.current?.getBoundingClientRect().width ?? 640) => {
    if (!offer || pending || locallyLocked) {
      return;
    }

    if (source === 'pointer' && !reduceMotion) {
      setLeaving({
        offer,
        ranking,
        sellerName: resolvedSellerName,
        startX,
        width,
        key: Date.now(),
      });
      if (leavingTimeoutRef.current !== null) window.clearTimeout(leavingTimeoutRef.current);
      leavingTimeoutRef.current = window.setTimeout(() => setLeaving((current) => (current?.offer.offer_id === offer.offer_id ? null : current)), EXIT_MS);
    } else {
      setLeaving(null);
      setKeyboardTransition(source === 'keyboard');
      if (keyboardTimeoutRef.current !== null) window.clearTimeout(keyboardTimeoutRef.current);
      keyboardTimeoutRef.current = window.setTimeout(() => setKeyboardTransition(false), 0);
    }

    setPhase('resting');
    setVisualX(0);
    setVisualDx(0);
    setVisualDy(0);
    keyboardActionRef.current = false;
    onSkip(offer.offer_id, offer);
  }, [locallyLocked, offer, onSkip, pending, ranking, reduceMotion, resolvedSellerName]);

  const completeAccept = useCallback(() => {
    if (!offer || acceptDisabled || locallyLocked) {
      return;
    }

    acceptedLockRef.current = `${snapshot.request_id}:${offer.offer_id}`;
    setPhase('returning');
    setVisualX(0);
    setVisualDx(0);
    setVisualDy(0);
    onAccept(offer.offer_id, offer);
  }, [acceptDisabled, locallyLocked, offer, onAccept, snapshot.request_id]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!offer || pending || locallyLocked || pointerRef.current || isInteractiveTarget(event.target)) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      requestId: snapshot.request_id,
      offerId: offer.offer_id,
      recognized: false,
      rawDx: 0,
      rawDy: 0,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || event.pointerId !== pointer.pointerId || !offer || pointer.offerId !== offer.offer_id || pointer.requestId !== snapshot.request_id) {
      return;
    }

    const rawDx = event.clientX - pointer.startX;
    const rawDy = event.clientY - pointer.startY;
    pointer.rawDx = rawDx;
    pointer.rawDy = rawDy;

    if (!pointer.recognized) {
      const absX = Math.abs(rawDx);
      const absY = Math.abs(rawDy);
      if (absX < INTENT_PX || absX <= absY) {
        return;
      }

      pointer.recognized = true;
      suppressNextClick();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPhase('dragging');
    }

    event.preventDefault();
    setVisualDx(rawDx);
    setVisualDy(rawDy);
    setVisualX(reduceMotion ? 0 : clampDeckDisplacement(rawDx, pointer.width));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || event.pointerId !== pointer.pointerId) {
      return;
    }

    const recognized = pointer.recognized;
    const finalDx = pointer.rawDx;
    const finalDy = pointer.rawDy;
    const width = pointer.width;
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!recognized) {
      resetGesture(true);
      return;
    }

    const commits = Math.abs(finalDx) >= width * 0.25 && Math.abs(finalDx) > Math.abs(finalDy);
    if (!commits) {
      resetGesture(false);
      return;
    }

    if (finalDx > 0) {
      if (acceptDisabled) {
        resetGesture(false);
        return;
      }
      completeAccept();
      return;
    }

    completeSkip('pointer', clampDeckDisplacement(finalDx, width), width);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetGesture(false);
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      if (suppressClickTimeoutRef.current !== null) {
        window.clearTimeout(suppressClickTimeoutRef.current);
        suppressClickTimeoutRef.current = null;
      }
      return;
    }

    if (offer && !isInteractiveTarget(event.target)) {
      onDetails(offer.offer_id, offer);
    }
  };

  const handleKeyboardIntent = () => {
    keyboardActionRef.current = true;
    setKeyboardTransition(true);
    window.setTimeout(() => setKeyboardTransition(false), 0);
  };

  if (!offer) {
    return (
      <section className="offer-ui offer-deck" aria-labelledby="offer-deck-empty-title">
        <div className="offer-deck__empty">
          <h2 id="offer-deck-empty-title">沒有可採用方案</h2>
          <p>所有可查看的報價都已略過。你可以補充需求讓賣家重新議價。</p>
        </div>
      </section>
    );
  }

  const label = trustedOfferLabel(snapshot, offer);
  const unavailableMessage = disabledReason ?? (expired ? '此方案已過期' : offer.eligibility.status !== 'eligible' ? '此方案不可採用' : null);

  return (
    <section className="offer-ui offer-deck" aria-labelledby="offer-deck-title">
      <div className="offer-deck__header">
        <p>方案 {ranking?.rank ?? '-'} / {totalOffers}</p>
        <h2 id="offer-deck-title">{offerName(offer)}</h2>
      </div>

      <div className="offer-deck__stage" data-dragging={phase === 'dragging' ? 'true' : 'false'}>
        <div className={`offer-deck__intent offer-deck__intent--accept ${activeDirection === 'accept' ? 'is-active' : ''}`}>立即採用</div>
        <div className={`offer-deck__intent offer-deck__intent--skip ${activeDirection === 'skip' ? 'is-active' : ''}`}>略過</div>

        {leaving ? (
          <motion.div
            key={leaving.key}
            className="offer-card-shell offer-card-shell--leaving"
            aria-hidden="true"
            initial={{transform: `translateX(${leaving.startX}px)`, opacity: 1}}
            animate={{transform: `translateX(${-leaving.width * EXIT_DISTANCE_MULTIPLIER}px)`, opacity: 0}}
            transition={reduceMotion ? {duration: 0} : {duration: EXIT_MS / 1000, ease: EASE_OUT}}
          >
            <OfferCard snapshot={snapshot} offer={leaving.offer} ranking={leaving.ranking} sellerName={leaving.sellerName} inert />
          </motion.div>
        ) : null}

        <motion.div
          key={`${offer.offer_id}:${entryKey}`}
          ref={cardRef}
          data-testid="offer-card-shell"
          className={`offer-card-shell ${keyboardTransition ? 'offer-card-shell--keyboard' : ''}`.trim()}
          style={{touchAction: 'pan-y'}}
          initial={reduceMotion || keyboardTransition ? {transform: 'translateY(0px) scale(1)', opacity: 1} : {transform: 'translateY(8px) scale(0.97)', opacity: 0}}
          animate={{transform, opacity: 1}}
          transition={transition}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={(event) => {
            // Touch initially captures the child under the finger. Transferring
            // capture to this shell bubbles the child's lost event: not a cancel.
            if (event.target === event.currentTarget) handlePointerCancel(event);
          }}
          onClickCapture={handleCardClick}
          tabIndex={-1}
        >
          <OfferCard
            snapshot={snapshot}
            offer={offer}
            ranking={ranking}
            sellerName={resolvedSellerName}
            label={label}
            pending={pending || locallyLocked}
            expired={expired}
            onDetails={() => onDetails(offer.offer_id, offer)}
          />
        </motion.div>
      </div>

      {unavailableMessage ? <StatusMessage tone="danger">{unavailableMessage}</StatusMessage> : null}
      {pending || locallyLocked ? <StatusMessage tone="pending">提交中，正在等待確認</StatusMessage> : null}

      <div className="offer-deck__actions" data-no-swipe>
        <OfferButton
          type="button"
          variant="secondary"
          icon={<X size={18} />}
          disabled={pending || locallyLocked}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleKeyboardIntent();
            }
          }}
          onClick={() => completeSkip(keyboardActionRef.current ? 'keyboard' : 'pointer')}
        >
          略過
        </OfferButton>
        <OfferButton
          type="button"
          variant="primary"
          icon={<Check size={18} />}
          disabled={acceptDisabled || locallyLocked}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleKeyboardIntent();
            }
          }}
          onClick={() => {
            keyboardActionRef.current = false;
            completeAccept();
          }}
        >
          立即採用
        </OfferButton>
        <OfferButton
          type="button"
          variant="quiet"
          icon={<RotateCcw size={18} />}
          disabled={pending || locallyLocked || !canUndo}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleKeyboardIntent();
            }
          }}
          onClick={() => {
            setLeaving(null);
            resetGesture(true);
            onUndo();
          }}
        >
          撤回略過
        </OfferButton>
      </div>

      <p className="offer-deck__hint">左滑略過，右滑立即採用</p>
    </section>
  );
}

interface OfferCardProps {
  snapshot: RequestSnapshot;
  offer: Offer;
  ranking: RankedOffer | null;
  sellerName: string;
  label?: string | null;
  pending?: boolean;
  expired?: boolean;
  inert?: boolean;
  onDetails?: () => void;
}

function OfferCard({snapshot, offer, ranking, sellerName, label, pending = false, expired = false, inert = false, onDetails}: OfferCardProps) {
  return (
    <article className="offer-card" aria-labelledby={`offer-card-${offer.offer_id}`} aria-hidden={inert ? 'true' : undefined}>
      <OfferMedia offer={offer} />
      <div className="offer-card__content">
        <div>
          <p className="offer-card__seller">{sellerName}</p>
          <h3 id={`offer-card-${offer.offer_id}`}>{offerName(offer)}</h3>
        </div>
        <div className="offer-card__labels">
          {ranking ? <StatusPill>第 {ranking.rank} 名</StatusPill> : null}
          {label ? <StatusPill tone={label === '免費配件' ? 'success' : 'neutral'}>{label}</StatusPill> : null}
          {expired ? <StatusPill tone="danger">已過期</StatusPill> : null}
          {pending ? <StatusPill tone="pending">提交中</StatusPill> : null}
        </div>
        <PriceBlock amount={offer.total_price_twd} />
        <OfferSummaryMeta snapshot={snapshot} offer={offer} />
        <p className="offer-card__features">{offer.primary_features.map(feature => ({wireless:'無線連接',silent_click:'靜音按鍵',bluetooth:'藍牙連接',rechargeable:'可充電'} as Record<string,string>)[feature] ?? feature.replaceAll('_',' ')).join(' · ')}</p>
        <button className="offer-card__details" type="button" data-no-swipe onClick={onDetails}>
          查看 {offer.items.length} 件商品明細 <ArrowLeft size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
