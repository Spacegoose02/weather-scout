import { describe, it, expect } from 'vitest';
import { planActivities, clock } from '../../../shared/activities.js';
import { savedLabel, ageWords, noteOffline, offlineState } from '../offline.js';

const NOW = Date.parse('2026-06-10T13:00:00Z'); // place on UTC, so local = UTC
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

function forecast(fn, { days = [{ sunrise: '2026-06-10T05:30', sunset: '2026-06-10T20:30' }, { sunrise: '2026-06-11T05:30', sunset: '2026-06-11T20:30' }] } = {}) {
  const hourly = Array.from({ length: 36 }, (_, i) => {
    const epoch = NOW + i * 3600_000;
    const hour = new Date(epoch).getUTCHours();
    return { time: iso(epoch), epoch, isDay: hour >= 6 && hour < 20, temp: 72, feelsLike: 72, precipChance: 5, windSpeed: 6, windGust: 10, uv: 5, cloudCover: 30, code: 1, snow: 0, ...fn(hour, i) };
  });
  return { hourly, daily: days, recent: { precipLast24h: 0 } };
}

describe('best times outside', () => {
  it('finds a great window on a nice day and skips the night', () => {
    const plan = planActivities(forecast(() => ({})), { now: NOW });
    const walk = plan.find((a) => a.id === 'walk');
    expect(walk.rating).toBe('great');
    expect(walk.label).toBe('Today 1 PM–5 PM');
    expect(plan.find((a) => a.id === 'swim').rating).toBe('no');
    expect(plan.some((a) => a.id === 'snow')).toBe(false);
  });

  it('kites need wind, and storms rule things out', () => {
    const windy = planActivities(forecast((h) => ({ windSpeed: h >= 15 && h < 18 ? 14 : 3, windGust: 20 })), { now: NOW });
    const kite = windy.find((a) => a.id === 'kite');
    expect(kite.rating).not.toBe('no');
    expect(kite.start).toBe('2026-06-10T15:00');
    const storms = planActivities(forecast(() => ({ precipChance: 90, code: 95 })), { now: NOW });
    expect(storms.find((a) => a.id === 'walk')).toMatchObject({ rating: 'no', reason: 'thunderstorms around' });
  });

  it('works in metric and shows a rainbow hunt near sunset with showers', () => {
    const plan = planActivities(forecast((h) => ({ temp: 22, feelsLike: 22, windSpeed: 10, windGust: 16, precipChance: h >= 18 ? 40 : 5, cloudCover: h >= 18 ? 50 : 30 })), { units: 'metric', now: NOW });
    expect(plan.find((a) => a.id === 'walk').rating).toBe('great');
    const rainbow = plan.find((a) => a.id === 'rainbow');
    expect(rainbow).toBeTruthy();
    expect(rainbow.start.slice(11, 13)).toBe('18');
  });

  it('labels hours', () => {
    expect(clock('2026-06-10T00:00')).toBe('12 AM');
    expect(clock('2026-06-10T15:00')).toBe('3 PM');
  });
});

describe('offline helpers', () => {
  it('describes how old a saved copy is', () => {
    const now = Date.parse('2026-06-10T15:00:00Z');
    expect(ageWords('2026-06-10T14:25:00Z', now)).toBe('35 minutes ago');
    expect(ageWords('2026-06-10T12:00:00Z', now)).toBe('3 hours ago');
    expect(savedLabel('')).toBe('');
  });

  it('tracks saved answers for the weather', () => {
    noteOffline('/api/weather?lat=1', '2026-06-10T14:25:00Z');
    expect(offlineState()).toEqual({ offline: true, savedAt: '2026-06-10T14:25:00Z' });
    noteOffline('/api/weather?lat=1', null);
    expect(offlineState().offline).toBe(false);
  });
});
