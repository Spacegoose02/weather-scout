import { describe, it, expect } from 'vitest';
import { sensorHeadline } from '../air/AirSensorsCard.jsx';
import { oddsColumns } from './OddsCard.jsx';
import { nowcastText } from '../../../../shared/radarcast.js';
import { yardText } from '../../../../shared/tuning.js';
import { normalizeLayers, layerCount, DEFAULT_LAYERS } from '../map/layers.js';

describe('v0.9 cards', () => {
  it('compares the sensor reading with the model', () => {
    expect(sensorHeadline({ consensus: { aqi: 80, count: 3, miles: 4.2 } }, 40)).toBe('AQI 80 from 3 sensors within 4 mi, 40 worse than the model says');
    expect(sensorHeadline({ consensus: { aqi: 45, count: 1, miles: 0.3 } }, 42)).toBe('AQI 45 from 1 sensor within 1 mi');
    expect(sensorHeadline({ consensus: null }, 42)).toBe('Model estimate: AQI 42');
  });

  it('shows only the odds columns that matter this week', () => {
    const day = (c) => ({ chance: { rain: 10, soaking: 0, snow: null, freeze: 0, gust: 0, ...c } });
    expect(oddsColumns([day({}), day({})])).toEqual(['rain']);
    expect(oddsColumns([day({ freeze: 40 }), day({ snow: 5 })])).toEqual(['rain', 'snow', 'freeze']);
  });

  it('words the radar hour for rain and snow', () => {
    const steps = (rates) => rates.map((rate, i) => ({ min: i * 5, rate }));
    expect(nowcastText(steps([0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]))).toBe('Light rain starting in about 15 minutes, lasting about 15 minutes.');
    expect(nowcastText(steps([5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), { snow: true })).toBe('Moderate snow ending in about 15 minutes.');
    expect(nowcastText(steps(Array(13).fill(0)))).toBe('No rain on radar for the next hour.');
  });

  it('says it is still learning before a station has reported', () => {
    expect(yardText({ samples: 0 })).toMatch(/Learning your yard/);
  });

  it('keeps smoke and air sensors off by default, and old saved layers get them off too', () => {
    expect(DEFAULT_LAYERS.smoke).toBe(false);
    expect(DEFAULT_LAYERS.sensors).toBe(false);
    const old = normalizeLayers({ radar: true, cams: false });
    expect(old.smoke).toBe(false);
    expect(layerCount({ ...DEFAULT_LAYERS, smoke: true })).toBe(8);
  });
});
