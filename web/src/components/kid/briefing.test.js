import { describe, expect, it } from 'vitest';
import { briefingUrl } from './Briefing.jsx';

describe('briefingUrl', () => {
  it('sends the place, units, first part of the place name and AI choice', () => {
    const u = new URL(briefingUrl({ location: { lat: 37.54, lon: -77.44, name: 'Richmond, VA' }, units: 'metric', name: 'Sam', ai: true }), 'http://x');
    expect(u.pathname).toBe('/api/briefing');
    expect(Object.fromEntries(u.searchParams)).toEqual({ lat: '37.54', lon: '-77.44', units: 'metric', place: 'Richmond', name: 'Sam', ai: 'true' });
  });
  it('leaves out what is not known', () => {
    const u = new URL(briefingUrl({ location: { lat: 1, lon: 2 } }), 'http://x');
    expect([...u.searchParams.keys()]).toEqual(['lat', 'lon']);
  });
});
