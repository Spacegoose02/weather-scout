import { describe, it, expect } from 'vitest';
import { compass, hourLabel, clockLabel, dayLabel, duration, pressureWord, nextRainText } from './format.js';

describe('format', () => {
  it('compass points', () => {
    expect(compass(0)).toBe('N');
    expect(compass(225)).toBe('SW');
    expect(compass(359)).toBe('N');
  });
  it('times', () => {
    expect(hourLabel('2026-11-02T00:00')).toBe('12a');
    expect(hourLabel('2026-11-02T15:00')).toBe('3p');
    expect(clockLabel('2026-11-02T17:04')).toBe('5:04 PM');
    expect(dayLabel('2026-11-02', 1)).toBe('Mon');
    expect(dayLabel('2026-11-02', 0)).toBe('Today');
  });
  it('durations and pressure', () => {
    expect(duration(125)).toBe('2h 5m');
    expect(pressureWord(-3)).toBe('falling fast');
    expect(pressureWord(0)).toBe('steady');
  });
  it('next rain', () => {
    expect(nextRainText([{ precip: 0 }, { precip: 0 }, { precip: 0.1 }])).toMatch(/30 minutes/);
    expect(nextRainText([{ precip: 0 }])).toMatch(/No rain/);
    expect(nextRainText([{ precip: 0.2 }, { precip: 0 }])).toMatch(/stopping in about 15/);
  });
});

import { rainWord, windWord, sunscreenWindow } from './components/NowCards.jsx';
describe('now cards', () => {
  it('words for rain rate, wind and the sunscreen window', () => {
    expect(rainWord(0, 'imperial')).toBe('Dry');
    expect(rainWord(0.05, 'imperial')).toBe('Light');
    expect(rainWord(0.2, 'imperial')).toBe('Moderate');
    expect(rainWord(10, 'metric')).toBe('Heavy');
    expect(windWord(2)).toBe('Calm');
    expect(windWord(18)).toBe('Windy');
    const hrs = ['09', '10', '11', '15', '16'].map((h, i) => ({ time: `2026-06-01T${h}:00`, uv: [2, 3, 6, 4, 2][i] }));
    expect(sunscreenWindow(hrs, '2026-06-01')).toEqual({ from: '2026-06-01T10:00', to: '2026-06-01T15:00', peak: 6 });
    expect(sunscreenWindow(hrs, '2026-06-02')).toBe(null);
  });
});
