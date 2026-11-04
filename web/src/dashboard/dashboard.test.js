import { describe, it, expect } from 'vitest';
import { CARDS, CARD_GROUPS, DEFAULT_LAYOUT, normalize, addCard, removeCard, moveCard, nudgeCard, resizeCard, hidden } from './layout.js';
import { streak, compareForecast } from './journal.js';
import { skyVerdict } from './stars.js';

const ids = (l) => l.cards.map((c) => c.id);

describe('dashboard layout', () => {
  it('has a default that only uses known cards at allowed sizes', () => {
    expect(normalize(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it('keeps the default short and files every card under an Add cards group', () => {
    expect(DEFAULT_LAYOUT.cards.length).toBeLessThanOrEqual(10);
    const groups = CARD_GROUPS.map(([g]) => g);
    for (const c of CARDS) expect(groups).toContain(c.group);
  });

  it('normalize drops unknown and duplicate cards and fits sizes', () => {
    const l = normalize({ cards: [{ id: 'current', size: 's' }, { id: 'nope' }, { id: 'current', size: 'l' }, { id: 'denduty', size: 'l' }] });
    expect(l.cards).toEqual([{ id: 'current', size: 'm' }, { id: 'denduty', size: 'm' }]);
    expect(normalize(null)).toEqual({ cards: [] });
  });

  it('adds, removes, moves and resizes', () => {
    let l = { cards: [{ id: 'current', size: 'm' }, { id: 'radar', size: 'm' }] };
    l = addCard(l, 'stars');
    expect(ids(l)).toEqual(['current', 'radar', 'stars']);
    expect(addCard(l, 'stars')).toBe(l);
    l = addCard(l, 'journal', 0);
    expect(ids(l)).toEqual(['journal', 'current', 'radar', 'stars']);
    l = moveCard(l, 'journal', 3);
    expect(ids(l)).toEqual(['current', 'radar', 'stars', 'journal']);
    l = nudgeCard(l, 'current', 1);
    expect(ids(l)).toEqual(['radar', 'current', 'stars', 'journal']);
    expect(nudgeCard(l, 'radar', -1)).toBe(l);
    l = resizeCard(l, 'radar', 'l');
    expect(l.cards[0].size).toBe('l');
    expect(resizeCard(l, 'journal', 's')).toBe(l); // journal is never small
    l = removeCard(l, 'stars');
    expect(ids(l)).toEqual(['radar', 'current', 'journal']);
    expect(hidden(l).map((c) => c.id)).toContain('stars');
  });
});

describe('journal', () => {
  it('counts a streak ending today or yesterday', () => {
    const e = (day) => ({ day });
    expect(streak([e('2026-11-02'), e('2026-11-01'), e('2026-10-31'), e('2026-10-29')], '2026-11-02')).toBe(3);
    expect(streak([e('2026-11-01'), e('2026-10-31')], '2026-11-02')).toBe(2);
    expect(streak([e('2026-10-30')], '2026-11-02')).toBe(0);
    expect(streak([e('2026-03-01'), e('2026-02-28')], '2026-03-01')).toBe(2);
  });

  it('compares the measured high with the forecast', () => {
    expect(compareForecast({ high: 70, forecast: { high: 70.4 } }, '°F')).toMatch(/matched/);
    expect(compareForecast({ high: 74, forecast: { high: 70 } }, '°F')).toMatch(/4°F warmer/);
    expect(compareForecast({ high: null, forecast: { high: 70 } })).toBe(null);
  });
});

describe('stargazing verdict', () => {
  const dark = { from: '2026-11-02T23:00:00Z', until: '2026-11-03T10:00:00Z' };
  const hours = (cloud, chance = 0) => Array.from({ length: 12 }, (_, i) => ({ epoch: Date.parse(dark.from) + i * 3_600_000, cloudCover: cloud, precipChance: chance }));
  it('rates the evening sky', () => {
    expect(skyVerdict(hours(10), dark).rating).toBe('clear');
    expect(skyVerdict(hours(50), dark).rating).toBe('partly');
    expect(skyVerdict(hours(90), dark).rating).toBe('cloudy');
    expect(skyVerdict(hours(10, 70), dark).rating).toBe('cloudy');
    expect(skyVerdict([], dark)).toBe(null);
    expect(skyVerdict(hours(10), null)).toBe(null);
  });
});

describe('packed grid', () => {
  it('spans a card over its height plus the gap, in 1px rows', async () => {
    const { spanFor } = await import('./usePackedGrid.js');
    expect(spanFor(224, 14)).toBe(238);
    expect(spanFor(100.2, 14)).toBe(115);
    expect(spanFor(0, 14)).toBe(14);
  });

  it('gives each size its share of the columns', async () => {
    const { columnsFor } = await import('./usePackedGrid.js');
    expect([columnsFor('s', 6), columnsFor('m', 6), columnsFor('l', 6)]).toEqual([2, 3, 6]);
    expect([columnsFor('s', 2), columnsFor('m', 2), columnsFor('l', 2)]).toEqual([1, 1, 2]);
    expect([columnsFor('s', 1), columnsFor('m', 1), columnsFor('l', 1)]).toEqual([1, 1, 1]);
  });

  it('lines cards up on their own column lines and fills the shortest column', async () => {
    const { placeCards } = await import('./usePackedGrid.js');
    // Two medium cards side by side, then small cards under them (the board screenshot).
    const out = placeCards([
      { span: 3, height: 300 }, // gear checklist, tall
      { span: 3, height: 100 }, // short card on the right
      { span: 2, height: 400 }, // details
      { span: 2, height: 300 }, // wind
      { span: 2, height: 250 }, // stargazing
    ], 6, 14);
    expect(out.map((p) => p.col)).toEqual([0, 3, 4, 0, 2]);
    // Small cards only ever start on columns 1, 3 or 5.
    for (const p of out.slice(2)) expect(p.col % 2).toBe(0);
    expect(out[2].row).toBe(114); // right under the short card
    expect(out[3].row).toBe(314); // under the tall card, not floating halfway
    expect(out[4].row).toBe(314);
  });

  it('skips hidden cards and stacks everything on phones', async () => {
    const { placeCards } = await import('./usePackedGrid.js');
    const out = placeCards([{ span: 1, height: 50 }, { span: 1, height: 0 }, { span: 1, height: 20 }], 1, 10);
    expect(out).toEqual([{ col: 0, span: 1, row: 0, rows: 60 }, null, { col: 0, span: 1, row: 60, rows: 30 }]);
  });
});
