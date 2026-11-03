import { describe, expect, it } from 'vitest';
import { addCard, binderStats, chaseBadges, inConus, mergeChase, pointsWord, rankFor, setResult, setTarget, targetFor, totals } from './live.js';
import { mergeKid } from '../useKidData.js';

const card = (id, rarity = 'common', type = 'hail') => ({ id, day: '2026-05-02', type, emoji: '🧊', name: 'x', place: 'y', state: 'OK', lat: 35, lon: -97, time: '2026-05-02T20:00:00Z', stat: 's', power: 50, rarity, fact: 'f', extra: 'dropped' });

describe('pick your target', () => {
  it('keeps one target per day and stores results', () => {
    let c = setTarget({}, { day: '2026-05-02', lat: 35.123, lon: -97.456 });
    c = setTarget(c, { day: '2026-05-02', lat: 36, lon: -98 });
    expect(c.targets).toHaveLength(1);
    expect(targetFor(c, '2026-05-02').lat).toBe(36);
    c = setResult(c, '2026-05-02', { reports: 5, miles: 20, points: 10, final: true });
    c = setTarget(c, { day: '2026-05-03', lat: 35, lon: -97 });
    expect(totals(c)).toEqual({ played: 2, scored: 1, points: 10, best: 20 });
    expect(pointsWord(targetFor(c, '2026-05-02').result)).toMatch(/BULLSEYE/);
    expect(chaseBadges(c)).toEqual(expect.arrayContaining(['chase-target', 'chase-bullseye']));
  });

  it('ranks grow with points', () => {
    expect(rankFor(0).name).toBe('Rookie Spotter');
    expect(rankFor(35).name).toBe('Junior Chaser');
    expect(rankFor(35).next.name).toBe('Storm Navigator');
    expect(rankFor(500).next).toBe(null);
  });

  it('only the lower 48 can be picked', () => {
    expect(inConus(35, -97)).toBe(true);
    expect(inConus(61, -150)).toBe(false);
  });
});

describe('storm cards', () => {
  it('collects each card once and counts rarities', () => {
    let c = addCard({}, card('a', 'legendary', 'tornado'));
    c = addCard(c, card('a', 'legendary', 'tornado'));
    c = addCard(c, card('b'));
    expect(Object.keys(c.cards)).toEqual(['a', 'b']);
    expect(c.cards.a.extra).toBeUndefined();
    expect(binderStats(c)).toMatchObject({ total: 2, types: 2, by: { legendary: 1, common: 1 } });
    expect(chaseBadges(c)).toEqual(expect.arrayContaining(['chase-card', 'chase-legendary']));
  });
});

describe('merging chase data between devices', () => {
  it('unions cards and days, keeps the scored target', () => {
    const a = { targets: [{ day: '2026-05-02', lat: 1, lon: 1 }], cards: { a: card('a') }, briefDays: ['2026-05-01'] };
    const b = { targets: [{ day: '2026-05-02', lat: 1, lon: 1, result: { reports: 1, miles: 5, points: 10, final: true } }], cards: { b: card('b') }, briefDays: ['2026-05-02'], watched: ['2026-05-02'] };
    const m = mergeChase(a, b);
    expect(m.targets[0].result.points).toBe(10);
    expect(Object.keys(m.cards).sort()).toEqual(['a', 'b']);
    expect(m.briefDays).toEqual(['2026-05-01', '2026-05-02']);
    expect(mergeChase(b, a).targets[0].result.points).toBe(10);
  });

  it('mergeKid keeps chase progress from both sides', () => {
    const out = mergeKid({ chase: { cards: { a: card('a') } } }, { chase: { cards: { b: card('b') } } });
    expect(Object.keys(out.chase.cards).sort()).toEqual(['a', 'b']);
  });
});
