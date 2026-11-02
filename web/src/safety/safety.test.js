import { describe, it, expect, beforeEach } from 'vitest';
import { shelterWatch, markSeen, readSeen } from './watch.js';
import { normalize, DEFAULT_LAYOUT } from '../dashboard/layout.js';

const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

describe('shelter pop-up watch', () => {
  beforeEach(() => localStorage.removeItem('weather-scout:shelter-seen'));
  const alerts = [{ id: 'w1', event: 'Wind Advisory' }, { id: 't1', event: 'Tornado Warning' }];

  it('opens once for a new warning, then stays closed for that warning', () => {
    expect(shelterWatch(alerts, readSeen())).toMatchObject({ fresh: true });
    expect(shelterWatch(alerts, readSeen()).active.map((x) => x.hazard.id)).toEqual(['tornado']);
    markSeen(['t1']);
    expect(shelterWatch(alerts, readSeen()).fresh).toBe(false);
    // A new warning opens it again.
    expect(shelterWatch([...alerts, { id: 'f1', event: 'Flash Flood Warning' }], readSeen()).fresh).toBe(true);
  });

  it('never opens for watches or advisories', () => {
    expect(shelterWatch([{ id: 'x', event: 'Tornado Watch' }, { id: 'y', event: 'Flood Advisory' }], {})).toEqual({ active: [], fresh: false });
  });

  it('forgets old warnings after a few days', () => {
    const now = Date.now();
    markSeen(['old'], now - 4 * 86_400_000);
    markSeen(['new'], now);
    expect(Object.keys(readSeen(now))).toEqual(['new']);
  });

  it('the safety card is in the default dashboard', () => {
    expect(normalize(DEFAULT_LAYOUT).cards.some((c) => c.id === 'safety')).toBe(true);
  });
});
