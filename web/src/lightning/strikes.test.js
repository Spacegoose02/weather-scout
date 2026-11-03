import { describe, it, expect } from 'vitest';
import { fromRows, mergeStrikes, newestTime, countText } from './strikes.js';

const now = Date.UTC(2026, 10, 3, 1, 0);
const MIN = 60_000;

describe('lightning strikes in the browser', () => {
  it('reads compact rows', () => {
    expect(fromRows([[now, 1, 2, 'glm']])).toEqual([{ t: now, lat: 1, lon: 2, src: 'glm' }]);
  });
  it('merges new strikes, drops repeats and faded ones, newest first', () => {
    const have = fromRows([[now - 2 * MIN, 1, 1, 'glm'], [now - 40 * MIN, 1, 1, 'glm']]);
    const got = mergeStrikes(have, fromRows([[now - MIN, 2, 2, 'bo'], [now - 2 * MIN, 1, 1, 'glm']]), now);
    expect(got.map((s) => s.t)).toEqual([now - MIN, now - 2 * MIN]);
    expect(newestTime(got)).toBe(now - MIN);
  });
  it('describes what is in view', () => {
    expect(countText([], now)).toMatch(/No lightning/);
    expect(countText(fromRows([[now - MIN, 1, 1, 'glm'], [now - 20 * MIN, 1, 1, 'glm']]), now)).toBe('⚡ 2 strikes in view, 1 in the last 5 min');
  });
});
