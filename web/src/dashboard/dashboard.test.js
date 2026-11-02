import { describe, it, expect } from 'vitest';
import { CARDS, DEFAULT_LAYOUT, normalize, addCard, removeCard, moveCard, nudgeCard, resizeCard, hidden } from './layout.js';
import { streak, compareForecast } from './journal.js';
import { skyVerdict } from './stars.js';

const ids = (l) => l.cards.map((c) => c.id);

describe('dashboard layout', () => {
  it('has a default that only uses known cards at allowed sizes', () => {
    expect(normalize(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
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
});
