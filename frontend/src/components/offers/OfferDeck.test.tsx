import '@testing-library/jest-dom/vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ComponentProps, CSSProperties, ReactNode} from 'react';
import type {Offer, RankedOffer, RequestSnapshot} from '../../contract.generated';
import fixture from '../../../../contracts/fixtures/result-v0.3.json';
import {OfferDeck} from './OfferDeck';

const motionState = vi.hoisted(() => ({reduceMotion: false}));

vi.mock('motion/react', async () => {
  const React = await import('react');
  type MotionDivProps = {
    animate?: {transform?: string; opacity?: number};
    initial?: unknown;
    transition?: unknown;
    style?: CSSProperties;
    children?: ReactNode;
  } & React.HTMLAttributes<HTMLDivElement>;

  return {
    useReducedMotion: () => motionState.reduceMotion,
    motion: {
      div: React.forwardRef<HTMLDivElement, MotionDivProps>(({animate, initial, transition, style, ...props}, ref) => (
        <div
          ref={ref}
          style={{...style, transform: animate?.transform, opacity: animate?.opacity}}
          data-initial={JSON.stringify(initial)}
          data-transition={JSON.stringify(transition)}
          {...props}
        />
      )),
    },
  };
});

function snapshot(): RequestSnapshot {
  return {...structuredClone(fixture.snapshot), decision: null} as unknown as RequestSnapshot;
}

function current(snapshotValue = snapshot()): {snapshot: RequestSnapshot; offer: Offer; ranking: RankedOffer} {
  const ranking = snapshotValue.ranked_offers[0];
  const offer = snapshotValue.offers.find((candidate) => candidate.offer_id === ranking.offer_id);
  if (!offer) {
    throw new Error('Fixture missing ranked offer');
  }

  return {snapshot: snapshotValue, offer, ranking};
}

function renderDeck(overrides: Partial<ComponentProps<typeof OfferDeck>> = {}) {
  const data = current(overrides.snapshot);
  const props: ComponentProps<typeof OfferDeck> = {
    snapshot: data.snapshot,
    offer: data.offer,
    ranking: data.ranking,
    totalOffers: data.snapshot.ranked_offers.length,
    canUndo: false,
    onAccept: vi.fn(),
    onSkip: vi.fn(),
    onUndo: vi.fn(),
    ...overrides,
  };
  const result = render(<OfferDeck {...props} />);
  const shell = screen.getByTestId('offer-card-shell');
  shell.getBoundingClientRect = vi.fn(() => ({
    width: 640,
    height: 294,
    top: 0,
    left: 0,
    right: 640,
    bottom: 294,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  return {...result, props, shell};
}

function pointer(target: Element, type: string, init: {pointerId: number; clientX: number; clientY: number}) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperties(event, {
    pointerId: {value: init.pointerId},
    clientX: {value: init.clientX},
    clientY: {value: init.clientY},
  });
  fireEvent(target, event);
}

function drag(shell: HTMLElement, dx: number, dy = 0, pointerId = 1) {
  pointer(shell, 'pointerdown', {pointerId, clientX: 0, clientY: 0});
  pointer(shell, 'pointermove', {pointerId, clientX: dx, clientY: dy});
  pointer(shell, 'pointerup', {pointerId, clientX: dx, clientY: dy});
}

beforeEach(() => {
  motionState.reduceMotion = false;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => cleanup());

describe('OfferDeck gestures', () => {
  it('keeps dragging when touch capture transfers from a child to the shell', () => {
    const {shell, props} = renderDeck();
    const child = shell.querySelector('figure')!;
    pointer(child, 'pointerdown', {pointerId: 7, clientX: 250, clientY: 50});
    pointer(child, 'pointermove', {pointerId: 7, clientX: 230, clientY: 50});
    pointer(child, 'lostpointercapture', {pointerId: 7, clientX: 230, clientY: 50});
    pointer(shell, 'pointermove', {pointerId: 7, clientX: 50, clientY: 50});
    pointer(shell, 'pointerup', {pointerId: 7, clientX: 50, clientY: 50});
    expect(props.onSkip).toHaveBeenCalledOnce();
  });

  it('cancels if the shell itself actually loses pointer capture', () => {
    const {shell, props} = renderDeck();
    pointer(shell, 'pointerdown', {pointerId: 7, clientX: 250, clientY: 50});
    pointer(shell, 'pointermove', {pointerId: 7, clientX: 50, clientY: 50});
    pointer(shell, 'lostpointercapture', {pointerId: 7, clientX: 50, clientY: 50});
    pointer(shell, 'pointerup', {pointerId: 7, clientX: 50, clientY: 50});
    expect(props.onSkip).not.toHaveBeenCalled();
  });
  it('accepts at exactly 25 percent of pointerdown width', () => {
    const onAccept = vi.fn();
    const {shell, props} = renderDeck({onAccept});

    drag(shell, 160);

    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept).toHaveBeenCalledWith(props.offer?.offer_id, props.offer);
  });

  it('does not commit when the pointer reverses below the threshold before release', () => {
    const onAccept = vi.fn();
    const {shell} = renderDeck({onAccept});

    pointer(shell, 'pointerdown', {pointerId: 1, clientX: 0, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: 220, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: 100, clientY: 0});
    pointer(shell, 'pointerup', {pointerId: 1, clientX: 100, clientY: 0});

    expect(onAccept).not.toHaveBeenCalled();
  });

  it('preserves vertical gestures and ignores velocity-style short flicks', () => {
    const onAccept = vi.fn();
    const onSkip = vi.fn();
    const {shell} = renderDeck({onAccept, onSkip});

    drag(shell, 80, 140);
    drag(shell, 120, 0);

    expect(onAccept).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('ignores a second pointer and cancels the original pointer without a decision', () => {
    const onSkip = vi.fn();
    const {shell} = renderDeck({onSkip});

    pointer(shell, 'pointerdown', {pointerId: 1, clientX: 0, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: -80, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 2, clientX: -240, clientY: 0});
    pointer(shell, 'pointerup', {pointerId: 2, clientX: -240, clientY: 0});
    pointer(shell, 'pointercancel', {pointerId: 1, clientX: -80, clientY: 0});

    expect(onSkip).not.toHaveBeenCalled();
    expect(shell).toHaveStyle({transform: 'translateX(0px)'});
  });

  it('does not flip the card after a recognized drag', () => {
    const {shell} = renderDeck();
    const detailsButton = screen.getByRole('button', {name: /商品明細/});

    pointer(shell, 'pointerdown', {pointerId: 1, clientX: 0, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: 40, clientY: 0});
    pointer(shell, 'pointerup', {pointerId: 1, clientX: 40, clientY: 0});
    fireEvent.click(shell);

    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('still acquires drag intent from the card body', () => {
    const onAccept = vi.fn();
    const {shell} = renderDeck({onAccept});
    const heading = screen.getByRole('heading', {level: 3});

    pointer(heading, 'pointerdown', {pointerId: 1, clientX: 0, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: 160, clientY: 0});
    pointer(shell, 'pointerup', {pointerId: 1, clientX: 160, clientY: 0});

    expect(onAccept).toHaveBeenCalledOnce();
  });
});

describe('OfferDeck interaction state', () => {
  it('disables undo until a caller says undo is available', () => {
    const {rerender, props} = renderDeck({canUndo: false});

    expect(screen.getByRole('button', {name: /撤回略過/})).toBeDisabled();

    rerender(<OfferDeck {...props} canUndo />);

    expect(screen.getByRole('button', {name: /撤回略過/})).not.toBeDisabled();
  });

  it('lets expired offers be flipped for details and skipped but not accepted', () => {
    const onAccept = vi.fn();
    const onSkip = vi.fn();
    const {shell} = renderDeck({expired: true, onAccept, onSkip});

    expect(screen.getByRole('button', {name: /立即採用/})).toBeDisabled();
    const detailsButton = screen.getByRole('button', {name: /商品明細/});
    fireEvent.click(detailsButton);
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    drag(shell, -160);
    drag(shell, 160);

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('keeps reduced-motion cards centered while preserving the right-swipe decision', () => {
    motionState.reduceMotion = true;
    const onAccept = vi.fn();
    const {shell} = renderDeck({onAccept});

    pointer(shell, 'pointerdown', {pointerId: 1, clientX: 0, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: 160, clientY: 0});

    expect(shell).toHaveStyle({transform: 'translateX(0px)'});

    pointer(shell, 'pointerup', {pointerId: 1, clientX: 160, clientY: 0});

    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('uses zero-duration keyboard transitions and calls skip/undo synchronously', () => {
    const onSkip = vi.fn();
    const onUndo = vi.fn();
    renderDeck({canUndo: true, onSkip, onUndo});

    const skip = screen.getByRole('button', {name: /^略過$/});
    fireEvent.keyDown(skip, {key: 'Enter'});
    fireEvent.click(skip);
    fireEvent.click(screen.getByRole('button', {name: /撤回略過/}));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.getByTestId('offer-card-shell')).toHaveAttribute('data-transition', '{"duration":0}');
  });

  it('cancels a stale right-swipe when the offer expires before release', () => {
    const onAccept = vi.fn();
    const {shell, rerender, props} = renderDeck({expired: false, onAccept});

    pointer(shell, 'pointerdown', {pointerId: 1, clientX: 0, clientY: 0});
    pointer(shell, 'pointermove', {pointerId: 1, clientX: 180, clientY: 0});
    rerender(<OfferDeck {...props} expired />);
    pointer(screen.getByTestId('offer-card-shell'), 'pointerup', {pointerId: 1, clientX: 180, clientY: 0});

    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('OfferDeck card flip', () => {
  it('flips the card open and closed when the details button is toggled twice', () => {
    renderDeck();
    const detailsButton = screen.getByRole('button', {name: /商品明細/});
    // Both faces stay in the DOM at all times (the 3D flip needs them there); the back's
    // aria-hidden state is what actually tracks whether it's the one facing the viewer.
    const backFace = screen.getByText('推薦理由').closest('.offer-card-face-back')!;

    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(backFace).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(detailsButton);
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    expect(backFace).not.toHaveAttribute('aria-hidden');

    fireEvent.click(detailsButton);
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(backFace).toHaveAttribute('aria-hidden', 'true');
  });

  it('also flips back when the card itself is tapped again, not just the details button', () => {
    const {shell} = renderDeck();
    const detailsButton = screen.getByRole('button', {name: /商品明細/});

    fireEvent.click(detailsButton);
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(shell);
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('resets to the front face when the offer changes', () => {
    const {rerender, props} = renderDeck();
    const detailsButton = () => screen.getByRole('button', {name: /商品明細/});
    fireEvent.click(detailsButton());
    expect(detailsButton()).toHaveAttribute('aria-expanded', 'true');

    const nextOffer = props.snapshot.offers.find((candidate) => candidate.offer_id !== props.offer?.offer_id)!;
    const nextRanking = props.snapshot.ranked_offers.find((r) => r.offer_id === nextOffer.offer_id) ?? null;
    rerender(<OfferDeck {...props} offer={nextOffer} ranking={nextRanking} />);

    expect(detailsButton()).toHaveAttribute('aria-expanded', 'false');
  });
});
