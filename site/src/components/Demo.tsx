import { useEffect, useRef, useState } from 'react';
import { demoCopy } from '../content/demo';
import type { Lang } from '../content/links';

const presets = ['best-price', 'fast-delivery', 'no-addons', 'strict-budget'] as const;
type Preset = typeof presets[number];
type Strings = typeof demoCopy.en;
type Offer = { price: number; days: number; bundle: boolean; benefits: Array<keyof Strings['benefitNames']> };
type Ranked = Offer & { seller: number };
type Quote = { status: 'offered' | 'negotiating' | 'pending' | 'no_match' | 'refused' | 'timeout' | 'error'; done: boolean; updated: boolean; proposal: keyof Strings['proposals'] | null; quotes: Offer[] };
type Trace = { version: 1; budget: number; days: number; rounds: Quote[][]; offers: Ranked[] };
type State = { preset: Preset; phase: number; round: number; decision: number | null; sort: 'default' | 'price' | 'fast' };
const initial: State = { preset: 'best-price', phase: 0, round: 0, decision: null, sort: 'default' };
const storageKey = 'turndeal-replay-v1';
const money = (price: number) => 'NT$' + price.toLocaleString('en');
const distance = (days: number, lang: Lang) => lang === 'zh' ? days + ' 天' : days + (days === 1 ? ' day' : ' days');

export default function Demo({ lang, base }: { lang: Lang; base: string }) {
  const t = demoCopy[lang];
  const [state, setState] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [trace, setTrace] = useState<Trace>();
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { preset, phase, round, decision, sort } = state;
  const lastRound = trace?.rounds.length ?? 0;

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as State | null;
      if (saved && presets.includes(saved.preset) && [0, 1, 2, 3].includes(saved.phase) &&
        Number.isInteger(saved.round) && saved.round >= 0 && saved.round <= 5 &&
        (saved.decision === null || Number.isInteger(saved.decision)) &&
        ['default', 'price', 'fast'].includes(saved.sort)) setState(saved);
    } catch { /* Storage is optional. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Storage is optional. */ }
  }, [state, ready]);

  const needsTrace = phase > 0;
  useEffect(() => {
    if (!needsTrace) return;
    const controller = new AbortController();
    setFailed(false);
    fetch(base + 'demo-traces/' + preset + '.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Replay unavailable');
        return response.json() as Promise<Trace>;
      })
      .then(value => {
        if (value.version !== 1) throw new Error('Unsupported replay version');
        setTrace(value);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [needsTrace, preset, base]);

  useEffect(() => {
    if (!playing || !trace || phase !== 1) return;
    const timer = window.setTimeout(() => {
      if (round < lastRound) {
        setState(value => ({ ...value, round: round + 1 }));
        return;
      }
      setPlaying(false);
      setState(value => ({ ...value, phase: 2, decision: null }));
      if (heading.current?.closest('.demo')?.contains(document.activeElement)) {
        heading.current.focus();
      }
    }, round === 0 ? 750 : 1100);
    return () => window.clearTimeout(timer);
  }, [playing, trace, phase, round, lastRound]);

  function go(next: number) {
    setPlaying(false);
    setState(value => ({ ...value, phase: next, decision: null }));
    heading.current?.focus({ preventScroll: true });
  }

  function restart() {
    setState(value => ({ ...value, phase: 1, round: 0, decision: null }));
    setPlaying(true);
    heading.current?.focus({ preventScroll: true });
  }

  function revise(reset = false) {
    setPlaying(false);
    setTrace(undefined);
    setFailed(false);
    setState(reset ? initial : { ...initial, preset });
    heading.current?.focus({ preventScroll: true });
  }

  function choose(index: number | null) {
    setState(value => ({ ...value, phase: 3, decision: index }));
    heading.current?.focus({ preventScroll: true });
  }

  const selected = decision === null ? undefined : trace?.offers[decision];
  const offers = trace?.offers.map((offer, index) => ({ ...offer, index })) ?? [];
  if (sort === 'price') offers.sort((a, b) => a.price - b.price || a.days - b.days);
  if (sort === 'fast') offers.sort((a, b) => a.days - b.days || a.price - b.price);

  return <div className="demo">
    <p className="eyebrow">{t.label}</p>
    <h2 ref={heading} tabIndex={-1}>{t.title}</h2>
    <ol className="phases">{t.phases.map((name, i) => <li key={name} aria-current={phase === i ? 'step' : undefined}><span>{i+1}</span>{name}</li>)}</ol>
    {phase === 0 && <div className="demo-panel">
      <div className="demo-product"><img src={base + 'images/mouse.svg'} alt="" width="76" height="76" /><h3>{t.product}</h3></div>
      <fieldset><legend>{t.chooseScenario}</legend>
        <div className="scenario-grid">{presets.map((id, i) => <label key={id} className="scenario">
          <input type="radio" name="scenario" checked={preset === id} disabled={!ready} onChange={() => setState({ ...initial, preset: id })} />
          <span><strong>{t.scenarios[i]}</strong><small>{t.descriptions[i]}</small></span>
        </label>)}</div>
      </fieldset>
      <dl className="terms"><div><dt>{t.budget}</dt><dd>{money(preset === 'strict-budget' ? 500 : 1000)}</dd></div><div><dt>{t.delivery}</dt><dd>{distance(7, lang)}</dd></div><div><dt>{t.addons}</dt><dd>{preset === 'no-addons' || preset === 'strict-budget' ? t.none : t.free}</dd></div></dl>
      <button type="button" className="button" disabled={!ready} onClick={restart}>{t.start} ↗</button>
    </div>}
    {phase > 0 && !trace && <div className="demo-panel"><p role="status">{failed ? t.loadError : t.discovering}</p>{failed && <button type="button" className="button" onClick={() => revise()}>{t.revise}</button>}</div>}
    {phase === 1 && trace && <div className="demo-panel">
      <div className="demo-top"><h3 role="status">{round ? t.roundLabel(round, lastRound) : t.discovering}</h3><span>{t.scenarios[presets.indexOf(preset)]} · {money(trace.budget)} · {distance(trace.days, lang)}</span></div>
      <div className="seller-grid">{t.sellers.map((seller, i) => {
        const branch = trace.rounds[round - 1]?.[i];
        const status = branch?.status;
        const summary = status === 'no_match' || status === 'refused' || status === 'timeout' || status === 'error' ? t[status] : branch?.done ? t.completed : t.active;
        return <article className="seller" key={seller}><h4>{seller}</h4><small>{summary}</small>
          {branch?.quotes.length ? branch.quotes.map((offer, index) => <div key={index} className="quote-row"><strong>{money(offer.price)}</strong><small>{distance(offer.days, lang)} · {offer.bundle ? t.bundle : t.standalone}</small></div>) : <p>{t.noQuote}</p>}
          {branch?.updated && branch.quotes.length > 0 && <small className="status-text">{t.updated}</small>}
          {branch?.proposal && <p>{t.proposals[branch.proposal]}</p>}
        </article>;
      })}</div>
      <div className="actions controls">
        <button type="button" className="button secondary" disabled={round === 0} onClick={() => { setPlaying(false); setState({ ...state, round: round - 1 }); }}>{t.prev}</button>
        <button type="button" className="button secondary" onClick={() => setPlaying(!playing)}>{playing ? t.pause : t.play}</button>
        <button type="button" className="button secondary" disabled={round >= lastRound} onClick={() => { setPlaying(false); setState({ ...state, round: round + 1 }); }}>{t.next}</button>
        <button type="button" className="button secondary" onClick={restart}>{t.restart}</button>
        <button type="button" className="button" onClick={() => go(2)}>{t.skipReplay} ↗</button>
      </div>
    </div>}
    {phase === 2 && trace && <div className="demo-panel">
      <div className="demo-top"><h3>{offers.length ? t.offerCount(offers.length) : t.noMatch}</h3>{offers.length > 0 && <label>{t.sort} <select value={sort} onChange={e => setState({ ...state, sort: e.target.value as State['sort'] })}><option value="default">{t.defaultSort}</option><option value="price">{t.priceSort}</option><option value="fast">{t.fastSort}</option></select></label>}</div>
      {offers.length === 0 && <p>{t.noMatchText}</p>}
      <div className="deal-grid">{offers.map(offer => <article className="deal" key={offer.index}>
        <div className="deal-product"><img src={base + 'images/mouse.svg'} alt="" width="52" height="52" /><div><small>{t.sellers[offer.seller]}</small><h4>{t.product}</h4></div></div>
        <strong className="deal-price">{money(offer.price)}</strong><p>{distance(offer.days, lang)} · {offer.bundle ? t.bundle : t.standalone}</p>
        {offer.benefits.length > 0 && <p>{t.benefits} · {offer.benefits.map(kind => t.benefitNames[kind]).join(' · ')}</p>}
        {offer.index === 0 && <p className="status-text">{t.ranked} · {preset === 'fast-delivery' ? t.fastSort : t.priceSort}</p>}
        <button type="button" className="button" onClick={() => choose(offer.index)}>{t.accept}</button>
      </article>)}</div>
      <div className="actions controls">
        <button type="button" className="button secondary" onClick={() => revise()}>{t.revise}</button>
        <button type="button" className="button secondary" onClick={restart}>{t.replay}</button>
        {offers.length > 0 && <button type="button" className="button secondary" onClick={() => choose(null)}>{t.skip}</button>}
      </div>
    </div>}
    {phase === 3 && trace && <div className="demo-panel decision">
      <h3>{selected ? t.selected : t.skipped}</h3>
      {selected && <p><strong>{t.sellers[selected.seller]} · {money(selected.price)}</strong> · {distance(selected.days, lang)}</p>}
      <p>{selected ? t.notice : t.skippedText}</p>
      <div className="actions"><button type="button" className="button" onClick={() => revise(true)}>{t.reset}</button><button type="button" className="button secondary" onClick={() => go(2)}>{t.back}</button></div>
    </div>}
  </div>;
}
