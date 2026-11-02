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
  const MILD = { minFeelsLike: 65 };
  const COOL = { minFeelsLike: 45 };
  const COLD = { minFeelsLike: 25 };
  const HOT = { minFeelsLike: 78 };
  test('exact match gets three stars', () => {
    expect(checkOutfit(['raincoat', 'boots', 'pants'], ['raincoat', 'boots'], COOL).stars).toBe(3);
  });
  test('missing raincoat on a rainy day', () => {
    const r = checkOutfit(['boots', 'shorts'], ['raincoat', 'boots'], MILD);
    expect(r.missing).toEqual(['raincoat']);
    expect(r.perfect).toBe(false);
    expect(r.tips[0].text).toMatch(/raincoat/i);
  });
  test('mittens on a hot day are an extra', () => {
    const r = checkOutfit(['t-shirt', 'shorts', 'mittens'], ['t-shirt'], HOT);
    expect(r.extras).toEqual(['mittens']);
    expect(r.stars).toBe(2);
  });
  test('a raincoat covers the jacket, snow boots cover rain boots', () => {
    expect(checkOutfit(['raincoat', 'snow-boots', 'pants'], ['jacket', 'boots'], COOL).missing).toEqual([]);
  });

  test('bare fur on a mild day is not perfect', () => {
    const r = checkOutfit([], [], MILD);
    expect(r.perfect).toBe(false);
    expect(r.missing).toEqual(['t-shirt', 'shorts']);
    expect(r.tips[0].text).toMatch(/fur/);
    expect(r.tips[1].text).toMatch(/legs/);
  });
  test('a T-shirt and shorts on a mild day is perfect', () => {
    const r = checkOutfit(['t-shirt', 'shorts'], [], MILD);
    expect(r.perfect).toBe(true);
    expect(r.tips).toEqual([]);
  });
  test('a light jacket and pants also work on a mild day', () => {
    expect(checkOutfit(['jacket', 'pants'], [], MILD).perfect).toBe(true);
  });
  test('a T-shirt always beats bare fur', () => {
    const days = [[[], MILD], [['jacket'], COOL], [['winter-coat', 'beanie', 'mittens'], COLD], [['raincoat', 'boots'], MILD], [['t-shirt', 'sunglasses', 'sun-hat'], HOT]];
    for (const [needed, ctx] of days) {
      expect(checkOutfit(['t-shirt'], needed, ctx).stars).toBeGreaterThanOrEqual(checkOutfit([], needed, ctx).stars);
      expect(checkOutfit(['t-shirt'], needed, ctx).extras).not.toContain('t-shirt');
    }
  });
  test('a T-shirt under a needed coat is fine', () => {
    expect(checkOutfit(['t-shirt', 'jacket', 'pants'], ['jacket'], COOL).perfect).toBe(true);
  });
  test('a winter coat on a mild day is too much', () => {
    expect(checkOutfit(['winter-coat', 'shorts'], [], MILD).extras).toEqual(['winter-coat']);
  });
  test('a raincoat on a dry day is still an extra', () => {
    expect(checkOutfit(['t-shirt', 'shorts', 'raincoat'], [], MILD).extras).toEqual(['raincoat']);
  });

  test('no bottoms is never perfect', () => {
    for (const [needed, ctx] of [[[], MILD], [['jacket'], COOL], [['t-shirt'], HOT]]) {
      const r = checkOutfit(needed.length ? needed : ['t-shirt'], needed, ctx);
      expect(r.perfect).toBe(false);
      expect(r.tips.some((t) => /legs/.test(t.text))).toBe(true);
    }
  });
  test('cool days need pants, and shorts are too chilly', () => {
    const r = checkOutfit(['jacket', 'shorts'], ['jacket'], COOL);
    expect(r.missing).toEqual(['pants']);
    expect(r.extras).toEqual(['shorts']);
    expect(r.tips.find((t) => t.id === 'shorts').text).toMatch(/chilly/);
  });
  test('hot days: pants are too hot, swim trunks are fine', () => {
    expect(checkOutfit(['t-shirt', 'pants'], ['t-shirt'], HOT).extras).toEqual(['pants']);
    expect(checkOutfit(['t-shirt', 'swim-trunks'], ['t-shirt'], HOT).perfect).toBe(true);
  });
  test('swim trunks on a cool day get a funny tip', () => {
    const r = checkOutfit(['jacket', 'swim-trunks'], ['jacket'], COOL);
    expect(r.perfect).toBe(false);
    expect(r.tips.find((t) => t.id === 'swim-trunks').text).toMatch(/pool/);
  });
  test('two pairs of bottoms is one too many', () => {
    const r = checkOutfit(['t-shirt', 'shorts', 'pants'], [], MILD);
    expect(r.extras).toEqual(['pants']);
    expect(r.tips[0].text).toMatch(/one pair/);
  });
  test('without a temperature, a needed jacket means pants', () => {
    expect(checkOutfit(['jacket', 'pants'], ['jacket']).perfect).toBe(true);
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
