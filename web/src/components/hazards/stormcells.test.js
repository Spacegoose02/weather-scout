import { describe, it, expect } from 'vitest';
import { headline } from './StormTracker.jsx';
import { ptypeInfo } from '../../../../shared/stormcells.js';

const cell = (over = {}) => ({ id: 'A', level: 'hail', miles: 25, dir: 'west', moving: 'east', mph: 30, threat: null, ...over });

describe('storm tracker', () => {
  it('says when nothing is around', () => {
    expect(headline([])).toMatch(/No storm cells/);
    expect(headline([], true)).toMatch(/No storms/);
  });
  it('leads with the storm coming this way', () => {
    expect(headline([cell()])).toMatch(/none on course/);
    expect(headline([cell({ threat: { eta: 48, overhead: false } })])).toBe('Storm with hail heading your way, arriving in about 50 min.');
    expect(headline([cell({ threat: { eta: 0, overhead: true } })], true)).toMatch(/right over you/);
  });
  it('rain/snow footer line', () => {
    expect(ptypeInfo({ rain: 0, snow: 3, mix: 1, ice: 0 })).toBe('Snow and mix in view');
    expect(ptypeInfo({ rain: 2, snow: 1, mix: 1, ice: 1 })).toBe('Rain, snow, mix and ice in view');
    expect(ptypeInfo({ rain: 0, snow: 0, mix: 0, ice: 0 })).toBe('No rain or snow in view');
  });
});
