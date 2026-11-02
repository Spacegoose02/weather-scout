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
