import { describe, expect, it } from 'vitest';
import { embedParams } from './EmbedMap.jsx';

describe('embedParams', () => {
  it('is off without ?embed=map', () => {
    expect(embedParams('')).toBeNull();
    expect(embedParams('?embed=other')).toBeNull();
  });
  it('uses the home location and zoom 8 by default', () => {
    expect(embedParams('?embed=map')).toEqual({ center: null, zoom: 8, light: false });
  });
  it('reads a place, zoom and light map', () => {
    expect(embedParams('?embed=map&lat=37.38&lon=-80.11&zoom=7&light=1')).toEqual({ center: { lat: 37.38, lon: -80.11 }, zoom: 7, light: true });
  });
  it('ignores a bad place and keeps the zoom in range', () => {
    expect(embedParams('?embed=map&lat=abc&lon=-80&zoom=40').center).toBeNull();
    expect(embedParams('?embed=map&lat=95&lon=-80').center).toBeNull();
    expect(embedParams('?embed=map&zoom=1').zoom).toBe(3);
  });
});
