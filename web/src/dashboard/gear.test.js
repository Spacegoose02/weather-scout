import { describe, it, expect } from 'vitest';
import { gearFor, windowHours, startOptions, hourLabel } from './gear.js';

const T0 = Date.parse('2026-11-02T14:00:00Z');
const H = 3_600_000;
const hour = (i, o = {}) => ({ epoch: T0 + i * H, temp: 70, feelsLike: 70, precipChance: 0, precip: 0, code: 1, windSpeed: 5, windGust: 8, uv: 2, isDay: true, ...o });
const day = (o = {}, n = 24) => Array.from({ length: n }, (_, i) => hour(i, typeof o === 'function' ? o(i) : o));
const ids = (r) => r.items.map((i) => i.id);
const F = { temp: '°F' };

describe('gear checklist', () => {
  it('only looks at the hours of the outing', () => {
    const hourly = day((i) => (i >= 5 ? { precipChance: 90, precip: 0.2, code: 63 } : {}));
    expect(windowHours(hourly, T0 + 30 * 60_000, 2).map((h) => h.epoch)).toEqual([T0, T0 + H, T0 + 2 * H]);
    expect(ids(gearFor(hourly, { start: T0, hours: 2, activity: 'walk', units: F }))).not.toContain('umbrella');
    const later = gearFor(hourly, { start: T0 + 4 * H, hours: 3, activity: 'walk', units: F });
    expect(ids(later)).toEqual(expect.arrayContaining(['raincoat', 'umbrella', 'boots']));
  });

  it('skips the umbrella on a bike and adds a helmet', () => {
    const r = gearFor(day({ precipChance: 80, precip: 0.1, code: 61 }), { start: T0, hours: 2, activity: 'bike', units: F });
    expect(ids(r)).toContain('raincoat');
    expect(ids(r)).toContain('helmet');
    expect(ids(r)).not.toContain('umbrella');
  });

  it('dresses for cold and snow, in metric too', () => {
    const r = gearFor(day({ temp: -3, feelsLike: -6, code: 73, snow: 0.5 }), { start: T0, hours: 2, activity: 'playground', units: { temp: '°C' } });
    expect(ids(r)).toEqual(expect.arrayContaining(['winter-coat', 'beanie', 'mittens', 'snow-boots']));
    expect(ids(r)).not.toContain('sunscreen');
  });

  it('packs for sun and heat at the beach, and warns about thunder', () => {
    const r = gearFor(day({ temp: 92, feelsLike: 98, uv: 8, code: 95 }), { start: T0, hours: 4, activity: 'beach', units: F });
    expect(ids(r)).toEqual(expect.arrayContaining(['sunscreen', 'sun-hat', 'sunglasses', 'water', 'swimsuit', 'towel', 'snack']));
    expect(r.warnings.join(' ')).toMatch(/Thunderstorms/);
    expect(r.warnings.join(' ')).toMatch(/hot/);
  });

  it('ignores UV at night and adds lights for a dark walk', () => {
    const r = gearFor(day({ isDay: false, uv: 9, temp: 60, feelsLike: 60 }), { start: T0, hours: 1, activity: 'walk', units: F });
    expect(ids(r)).not.toContain('sunscreen');
    expect(ids(r)).toEqual(expect.arrayContaining(['lights', 'reflective']));
  });

  it('returns an empty list on a mild day and null past the forecast', () => {
    expect(gearFor(day(), { start: T0, hours: 1, activity: 'playground', units: F }).items).toEqual([]);
    expect(gearFor(day(), { start: T0 + 40 * H, hours: 1, activity: 'walk', units: F })).toBe(null);
  });

  it('offers start times from now on', () => {
    const opts = startOptions(day(), T0 + 20 * 60_000);
    expect(opts[0]).toEqual({ epoch: T0 + 20 * 60_000, now: true });
    expect(opts[1].epoch).toBe(T0 + H);
    expect(opts).toHaveLength(24);
    expect(hourLabel(T0 + 30 * H, 'UTC', T0)).toMatch(/^Tue /);
    expect(hourLabel(T0 + 2 * H, 'UTC', T0)).not.toMatch(/Tue/);
  });
});
