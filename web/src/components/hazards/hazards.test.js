import { describe, it, expect } from 'vitest';
import { reportsNear, firesNear, gaugeRank, REPORT_KINDS, REPORT_KIND } from '../../../../shared/hazards.js';
import { normalizeLayers } from '../map/layers.js';
import { reportLine } from './Reports.jsx';

describe('hazards in the web app', () => {
  it('every report kind has an emoji, label and a kid line', () => {
    for (const k of REPORT_KINDS) expect(k.emoji && k.label && k.kid).toBeTruthy();
    expect(REPORT_KIND.hail.hail).toBe(true);
  });
  it('report lines name the hail size', () => {
    expect(reportLine({ kind: 'hail', label: 'Hail', magnitude: 1.75 })).toBe('Hail (Golf ball)');
    expect(reportLine({ kind: 'snow', label: 'Snow', magnitude: 4, unit: 'INCH' })).toBe('Snow (4 inch)');
    expect(reportLine({ kind: 'rain', label: 'Rain' })).toBe('Rain');
  });
  it('old saved map layers get the hazard layers, off until switched on', () => {
    const l = normalizeLayers({ buoys: true });
    expect(l.buoys).toBe(true);
    expect(l.reports).toBe(false);
    expect(l.fires).toBe(false);
    expect(l.gauges).toBe(false);
  });
  it('near lists and gauge ranks', () => {
    const now = Date.now();
    expect(reportsNear([{ lat: 37.5, lon: -77.4, t: now - 25 * 3600_000 }], { lat: 37.5, lon: -77.4 }, { now })).toEqual([]);
    expect(firesNear([{ lat: 40, lon: -77.4 }], { lat: 37.5, lon: -77.4 }, { miles: 100 })).toEqual([]);
    expect(gaugeRank({ category: 'action', forecast: { category: 'major' } })).toBe(5);
  });
});
