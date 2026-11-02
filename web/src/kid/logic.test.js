import { describe, expect, test } from 'vitest';
import { bingoStatus, checkOutfit, scoreGuess, scorePending, forecasterTotals, seasonOf, seasonsCovered, EXPERIMENTS, BADGES } from './logic.js';
import { mergeKid } from './useKidData.js';

const squares = Array.from({ length: 9 }, (_, i) => (i === 4 ? { id: 'free', free: true } : { id: `s${i}` }));

describe('bingo', () => {
  test('free middle plus a diagonal is bingo', () => {
    const s = bingoStatus(squares, ['s0', 's8']);
    expect(s.bingo).toBe(true);
    expect(s.blackout).toBe(false);
  });
  test('two corners is not bingo', () => {
    expect(bingoStatus(squares, ['s0', 's2']).bingo).toBe(false);
  });
  test('every square is blackout', () => {
    expect(bingoStatus(squares, squares.map((s) => s.id)).blackout).toBe(true);
  });
});

describe('what to wear', () => {
  test('exact match gets three stars', () => {
    expect(checkOutfit(['raincoat', 'boots'], ['raincoat', 'boots']).stars).toBe(3);
  });
  test('missing raincoat on a rainy day', () => {
    const r = checkOutfit(['boots'], ['raincoat', 'boots']);
    expect(r.missing).toEqual(['raincoat']);
    expect(r.perfect).toBe(false);
    expect(r.tips[0].text).toMatch(/raincoat/i);
  });
  test('mittens on a hot day are an extra', () => {
    const r = checkOutfit(['t-shirt', 'mittens'], ['t-shirt']);
    expect(r.extras).toEqual(['mittens']);
    expect(r.stars).toBe(2);
  });
  test('a raincoat covers the jacket, snow boots cover rain boots', () => {
    expect(checkOutfit(['raincoat', 'snow-boots'], ['jacket', 'boots']).missing).toEqual([]);
  });
  test('bare fur on a mild day is not perfect', () => {
    const r = checkOutfit([], []);
    expect(r.perfect).toBe(false);
    expect(r.missing).toEqual(['t-shirt']);
    expect(r.tips[0].text).toMatch(/fur/);
  });
  test('a T-shirt on a mild day is perfect', () => {
    const r = checkOutfit(['t-shirt'], []);
    expect(r.perfect).toBe(true);
    expect(r.tips).toEqual([]);
  });
  test('a light jacket also works on a mild day', () => {
    expect(checkOutfit(['jacket'], []).perfect).toBe(true);
  });
  test('a T-shirt always beats bare fur', () => {
    for (const needed of [[], ['jacket'], ['winter-coat', 'beanie', 'mittens'], ['raincoat', 'boots'], ['t-shirt', 'sunglasses', 'sun-hat']]) {
      expect(checkOutfit(['t-shirt'], needed).stars).toBeGreaterThanOrEqual(checkOutfit([], needed).stars);
      expect(checkOutfit(['t-shirt'], needed).extras).not.toContain('t-shirt');
    }
  });
  test('a T-shirt under a needed coat is fine', () => {
    expect(checkOutfit(['t-shirt', 'jacket'], ['jacket']).perfect).toBe(true);
  });
  test('a winter coat on a mild day is too much', () => {
    expect(checkOutfit(['winter-coat'], []).extras).toEqual(['winter-coat']);
  });
  test('a raincoat on a dry day is still an extra', () => {
    const r = checkOutfit(['t-shirt', 'raincoat'], []);
    expect(r.extras).toEqual(['raincoat']);
  });
});

describe('kid forecaster', () => {
  const g = { date: '2026-11-01', high: 64, rain: true, units: 'imperial', lat: 37.5, lon: -77.4 };
  test('a great guess earns 5 points', () => {
    const r = scoreGuess(g, { high: 65.4, precipTotal: 0.2 });
    expect(r.points).toBe(5);
    expect(r.rainRight).toBe(true);
  });
  test('far off and wrong about rain earns 0', () => {
    expect(scoreGuess(g, { high: 80, precipTotal: 0 }).points).toBe(0);
  });
  test('metric uses tighter degrees', () => {
    expect(scoreGuess({ ...g, units: 'metric', high: 18 }, { high: 19, precipTotal: 1 }).highPoints).toBe(3);
    expect(scoreGuess({ ...g, units: 'metric', high: 18 }, { high: 21, precipTotal: 1 }).highPoints).toBe(2);
  });
  test('only past days get scored', () => {
    const today = { ...g, date: '2026-11-02' };
    const { guesses, changed } = scorePending([g, today], { '37.5,-77.4,imperial': [{ date: '2026-11-01', high: 64, precipTotal: 0.3 }] }, '2026-11-02');
    expect(changed).toBe(true);
    expect(guesses[0].result.points).toBe(5);
    expect(guesses[1].result).toBeUndefined();
    expect(forecasterTotals(guesses)).toEqual({ points: 5, played: 1, bullseyes: 1 });
  });
});

describe('seasons', () => {
  test('northern and southern hemispheres', () => {
    expect(seasonOf('2026-07-04').id).toBe('summer');
    expect(seasonOf('2026-07-04', -33).id).toBe('winter');
    expect(seasonOf('2026-10-15').id).toBe('fall');
    expect(seasonOf('2026-01-15', -33).id).toBe('summer');
  });
  test('counts seasons covered', () => {
    expect(seasonsCovered([{ takenOn: '2026-01-02' }, { takenOn: '2026-04-02' }, { takenOn: '2026-02-02' }]).size).toBe(2);
  });
});

test('every experiment has a matching badge', () => {
  const ids = new Set(BADGES.map((b) => b.id));
  for (const e of EXPERIMENTS) expect(ids.has(e.badge)).toBe(true);
});

test('merging keeps badges and scored guesses from both sides', () => {
  const m = mergeKid(
    { badges: { bingo: '2026-11-01' }, guesses: [{ date: '2026-11-01', high: 60 }] },
    { badges: { explorer: '2026-11-02' }, guesses: [{ date: '2026-11-01', high: 60, result: { points: 3 } }] },
  );
  expect(Object.keys(m.badges).sort()).toEqual(['bingo', 'explorer']);
  expect(m.guesses).toHaveLength(1);
  expect(m.guesses[0].result.points).toBe(3);
});
