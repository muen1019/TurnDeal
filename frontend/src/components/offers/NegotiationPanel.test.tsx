import '@testing-library/jest-dom/vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import type {RequestSnapshot} from '../../contract.generated';
import fixture from '../../../../contracts/fixtures/result-v0.3.json';
import {NegotiationPanel} from './NegotiationPanel';

function snapshot(): RequestSnapshot {
  return {...structuredClone(fixture.snapshot), decision: null} as unknown as RequestSnapshot;
}

afterEach(() => cleanup());

describe('NegotiationPanel', () => {
  it('summarizes actual rounds instead of hardcoding two rounds', () => {
    const value = snapshot();
    value.seller_agents = value.seller_agents.map((seller, index) => ({
      ...seller,
      rounds: index === 0 && seller.rounds[0] ? [seller.rounds[0]] : [],
    }));

    render(<NegotiationPanel snapshot={value} />);

    expect(screen.getByText('5 家賣家 · 1 輪議價')).toBeInTheDocument();
  });

  it('keeps sponsorship separate and leaves the campaign id out of the visible summary', () => {
    const value = snapshot();

    render(<NegotiationPanel snapshot={value} />);

    expect(screen.getByText('Sponsored 只代表展示位置，不影響推薦排序。')).toBeInTheDocument();
    expect(screen.queryByText('Sponsored details')).not.toBeInTheDocument();
    expect(screen.queryByText(value.sponsored_placement?.campaign_id ?? '')).not.toBeInTheDocument();
  });
});
