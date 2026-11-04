import { describe, it, expect } from 'vitest';
import { periodEmoji, tempPhrase, visibleCount } from './textForecast.js';

describe('detailed forecast helpers', () => {
  it('picks an emoji from the short forecast, day or night', () => {
    expect(periodEmoji({ short: 'Showers Likely', isDaytime: false })).toBe('🌧️');
    expect(periodEmoji({ short: 'Chance Showers And Thunderstorms', isDaytime: true })).toBe('⛈️');
    expect(periodEmoji({ short: 'Sunny', isDaytime: true })).toBe('☀️');
    expect(periodEmoji({ short: 'Mostly Clear', isDaytime: false })).toBe('🌙');
    expect(periodEmoji({ short: 'Partly Cloudy', isDaytime: false })).toBe('☁️');
    expect(periodEmoji({ short: 'Clear', isDaytime: false })).toBe('🌙');
    expect(periodEmoji({ short: 'Patchy Fog then Mostly Sunny', isDaytime: true })).toBe('🌫️');
  });

  it('says high or low the way NWS does', () => {
    expect(tempPhrase({ temp: 73, isDaytime: true })).toBe('High near 73°');
    expect(tempPhrase({ temp: 62, isDaytime: false })).toBe('Low around 62°');
    expect(tempPhrase({ temp: null })).toBe('');
  });

  it('shows six periods on a medium card until asked for all', () => {
    expect(visibleCount('m', 14, false)).toBe(6);
    expect(visibleCount('m', 14, true)).toBe(14);
    expect(visibleCount('l', 14, false)).toBe(14);
    expect(visibleCount('m', 3, false)).toBe(3);
  });
});
