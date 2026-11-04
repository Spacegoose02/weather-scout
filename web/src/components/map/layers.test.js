import { describe, it, expect } from 'vitest';
import { normalizeLayers, DEFAULT_LAYERS, alertKind, alertVisible, cameraFeedRows, toggleFeed, isDefault, layerCount, distanceText } from './layers.js';

describe('map layers', () => {
  it('fills in defaults and drops junk from saved preferences', () => {
    expect(normalizeLayers(undefined)).toEqual(DEFAULT_LAYERS);
    const n = normalizeLayers({ buoys: false, cams: 'yes', camsOff: ['va', 'va', 3, ''], bogus: true });
    expect(n.buoys).toBe(false);
    expect(n.cams).toBe(true);
    expect(n.camsOff).toEqual(['va']);
    expect(n.bogus).toBeUndefined();
    expect(isDefault({})).toBe(true);
    expect(isDefault({ tides: true })).toBe(false);
  });
  it('sorts alerts into warnings, watches and advisories', () => {
    expect(alertKind('Tornado Warning')).toBe('warnings');
    expect(alertKind('Extreme Wind Emergency')).toBe('warnings');
    expect(alertKind('Severe Thunderstorm Watch')).toBe('watches');
    expect(alertKind('Wind Advisory')).toBe('advisories');
    expect(alertKind('Special Weather Statement')).toBe('advisories');
    const l = normalizeLayers({ advisories: false });
    expect(alertVisible(l, 'Flood Warning')).toBe(true);
    expect(alertVisible(l, 'Frost Advisory')).toBe(false);
  });
  it('lists camera feeds by state and toggles them', () => {
    const rows = cameraFeedRows([{ id: 'va', name: '511 Virginia', region: 'VA', count: 900 }, { id: 'home', name: 'My cams' }, { id: 'de', name: 'DelDOT', region: 'DE', ok: false }], ['va']);
    expect(rows.map((r) => r.label)).toEqual(['DE', 'My cams', 'VA']);
    expect(rows.find((r) => r.id === 'va').on).toBe(false);
    expect(rows.find((r) => r.id === 'de').ok).toBe(false);
    expect(toggleFeed(['va'], 'va', true)).toEqual([]);
    expect(toggleFeed(['va'], 'sc', false)).toEqual(['va', 'sc']);
    expect(toggleFeed(['va'], 'va', false)).toEqual(['va']);
  });
  it('counts groups that are on (reports and wildfires are on by default)', () => {
    expect(layerCount(DEFAULT_LAYERS)).toBe(12);
    expect(layerCount(DEFAULT_LAYERS, { webcams: true })).toBe(13);
    expect(layerCount({ ...DEFAULT_LAYERS, webcams: false }, { webcams: true })).toBe(12);
  });
  it('keeps the Windy webcams switch and shows distances in the family units', () => {
    expect(normalizeLayers({ webcams: false }).webcams).toBe(false);
    expect(normalizeLayers({}).webcams).toBe(true);
    expect(distanceText(0.4)).toBe('under 1 mile');
    expect(distanceText(16.1)).toBe('10 miles');
    expect(distanceText(1.7)).toBe('1 mile');
    expect(distanceText(16.1, 'metric')).toBe('16 km');
  });
});
