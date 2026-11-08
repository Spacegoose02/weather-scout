import { describe, it, expect } from 'vitest';
import { marineHeadline } from './MarineCard.jsx';
import { overallText, ago } from '../DataFeeds.jsx';
import { liveNote } from '../../live.js';

describe('v0.10', () => {
  it('sums up the water in one line', () => {
    expect(marineHeadline({ available: true, sea: { label: 'Choppy' }, waves: { now: { waveHeight: 4 } }, units: { height: 'ft' }, rip: true, hazards: [] })).toBe('Choppy, 4 ft waves · Rip currents');
    expect(marineHeadline({ available: false })).toBe('');
  });

  it('words the data feed status', () => {
    expect(overallText({ feeds: [] })).toMatch(/Nothing has been checked/);
    expect(overallText({ overall: 'some-down', feeds: [{ state: 'down' }, { state: 'ok' }] })).toBe('1 weather service is not answering right now. Cards that use it may be out of date.');
    expect(overallText({ overall: 'ok', feeds: [{ state: 'ok' }] })).toMatch(/All the weather services/);
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(ago('2026-11-08T11:55:00Z', now)).toBe('5 min ago');
    expect(ago(null, now)).toBe('never');
  });

  it('turns live messages into a short notice', () => {
    expect(liveNote('alerts', { added: [{ event: 'Tornado Warning' }], ended: [] })).toBe('⚠️ New: Tornado Warning');
    expect(liveNote('alerts', { added: [], ended: [{ event: 'Flood Watch' }] })).toBe('✅ Ended: Flood Watch');
    expect(liveNote('storm', { eta: 22 })).toBe('⛈️ A storm is heading this way (about 20 min)');
  });
});
