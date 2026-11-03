import { describe, expect, it } from 'vitest';
import { stormyAlerts, shouldWatch, freshStreams, popupMode, viewersLabel, liveFor } from './chasers.js';

const alerts = [{ event: 'Wind Advisory' }, { event: 'Tornado Warning' }, { event: 'Severe Thunderstorm Watch' }, { event: 'Flood Advisory' }];

describe('storm chaser pop-ups', () => {
  it('only counts severe warnings and watches', () => {
    expect(stormyAlerts(alerts).map((a) => a.event)).toEqual(['Tornado Warning', 'Severe Thunderstorm Watch']);
    expect(stormyAlerts([{ event: 'Tornado' }])).toEqual([]);
  });

  it('watches with storms near you, always, or never', () => {
    expect(shouldWatch('storms', alerts)).toBe(true);
    expect(shouldWatch('storms', [{ event: 'Heat Advisory' }])).toBe(false);
    expect(shouldWatch('always', [])).toBe(true);
    expect(shouldWatch('off', alerts)).toBe(false);
    expect(popupMode(undefined)).toBe('storms');
    expect(popupMode('off')).toBe('off');
  });

  it('skips streams already dismissed', () => {
    expect(freshStreams([{ videoId: 'a' }, { videoId: 'b' }], ['a']).map((s) => s.videoId)).toEqual(['b']);
  });

  it('labels viewers and time live', () => {
    expect(viewersLabel(1234)).toBe('1.2K watching');
    expect(viewersLabel(undefined)).toBe('');
    expect(liveFor('2026-05-01T18:00:00Z', Date.parse('2026-05-01T19:25:00Z'))).toBe('live for 1 hr 25 min');
  });
});
