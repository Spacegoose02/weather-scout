import { describe, it, expect } from 'vitest';
import { splitPlace, pickPlace, withHomeCoords } from '../../../shared/homeplace.js';

const hits = [
  { name: 'Salem, Massachusetts', lat: 42.52, lon: -70.9 },
  { name: 'Salem, Oregon', lat: 44.94, lon: -123.04 },
  { name: 'Salem, Virginia', lat: 37.29, lon: -80.05 },
];

describe('home place lookup', () => {
  it('reads a state abbreviation', () => {
    expect(splitPlace('Salem, VA')).toEqual({ town: 'Salem', region: 'Virginia' });
    expect(splitPlace('Halifax, Nova Scotia')).toEqual({ town: 'Halifax', region: 'Nova Scotia' });
  });

  it('picks the hit in the right state, not just the first', () => {
    expect(pickPlace('Salem, VA', hits).lat).toBe(37.29);
    expect(pickPlace('Salem', hits).lat).toBe(42.52);
    expect(pickPlace('Salem, TX', hits)).toBeNull();
  });

  it('fills in coordinates only when the name changed alone', async () => {
    const lookup = async (q) => (q === 'Salem' ? hits : []);
    const r = await withHomeCoords({ DEFAULT_LOCATION_NAME: 'Salem, VA' }, lookup);
    expect(r.values).toEqual({ DEFAULT_LOCATION_NAME: 'Salem, VA', DEFAULT_LAT: '37.29', DEFAULT_LON: '-80.05' });
    expect(r.found.name).toBe('Salem, Virginia');
    const typed = { DEFAULT_LOCATION_NAME: 'Salem, VA', DEFAULT_LAT: '1' };
    expect((await withHomeCoords(typed, lookup)).values).toBe(typed);
    expect((await withHomeCoords({ DEFAULT_LOCATION_NAME: 'Nowhere' }, lookup)).found).toBeNull();
    // Already placed: a bare nickname doesn't move home, a "Town, ST" does.
    expect((await withHomeCoords({ DEFAULT_LOCATION_NAME: 'Salem' }, lookup, { strict: true })).found).toBeNull();
    expect((await withHomeCoords({ DEFAULT_LOCATION_NAME: 'Salem, VA' }, lookup, { strict: true })).found.lat).toBe(37.29);
    expect((await withHomeCoords({ DEFAULT_LOCATION_NAME: 'Salem, VA' }, () => Promise.reject(new Error('x')))).found).toBeNull();
  });
});
