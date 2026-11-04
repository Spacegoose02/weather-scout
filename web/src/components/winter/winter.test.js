import { describe, it, expect } from 'vitest';
import { tripHeadline } from './TripCard.jsx';
import { normalizeA11y, CB_MATRIX } from '../../a11y.js';

describe('trip forecast headline', () => {
  const stop = (miles, hazard = null) => ({ miles, eta: Date.parse('2026-11-06T20:00:00Z'), hazard });
  it('dry and wet drives', () => {
    expect(tripHeadline({ stops: [stop(0), stop(50)], worst: null })).toBe('Dry roads the whole way.');
    expect(tripHeadline({ stops: [stop(0), stop(50, { id: 'rain', label: 'Rain', rank: 1 })], worst: null })).toMatch(/near mile 50, nothing worse/);
  });
  it('names the worst stretch', () => {
    const snow = { id: 'snow', label: 'Heavy snow', rank: 4 };
    const t = tripHeadline({ stops: [stop(0), stop(80, snow)], worst: stop(80, snow) });
    expect(t).toMatch(/^Heavy snow near mile 80, around /);
  });
});

describe('easier to see settings', () => {
  it('keeps only known values', () => {
    expect(normalizeA11y(null)).toEqual({ text: 'normal', cbRadar: false, lessMotion: false });
    expect(normalizeA11y({ text: 'huge', cbRadar: 'yes', lessMotion: true })).toEqual({ text: 'normal', cbRadar: false, lessMotion: true });
    expect(normalizeA11y({ text: 'xlarge' }).text).toBe('xlarge');
  });
  it('color-blind filter is a 4x5 matrix that keeps alpha', () => {
    const m = CB_MATRIX.split(' ').map(Number);
    expect(m).toHaveLength(20);
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
    // Rows sum to 1, so white stays white and grays stay gray.
    for (let r = 0; r < 3; r++) expect(m.slice(r * 5, r * 5 + 3).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});
