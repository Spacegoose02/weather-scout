import { describe, it, expect } from 'vitest';
import { diffText, amountText, rankText, highlightYears, chartScale, yearAt, recordText, tempText } from './history.js';

const years = Array.from({ length: 86 }, (_, i) => ({ year: 2025 - i, high: 60 + (i % 7), low: 40 + (i % 5) }));
const h = { date: '2026-11-02', years, records: { warmestHigh: { year: 1950 }, coldestLow: { year: 2025 } } };

describe('history helpers', () => {
  it('describes differences and amounts', () => {
    expect(diffText(7.6)).toBe('8° above normal');
    expect(diffText(-2.2)).toBe('2° below normal');
    expect(diffText(0.3)).toBe('right at normal');
    expect(diffText(null)).toBe('');
    expect(amountText(0.001, 'in')).toBe('trace');
    expect(amountText(1.2, 'in')).toBe('1.20 in');
    expect(amountText(12.34, 'mm')).toBe('12.3 mm');
    expect(tempText(71.6, { temp: '°F' })).toBe('72°F');
    expect(recordText('record-high')).toMatch(/record high/);
  });

  it('ranks today against past years', () => {
    expect(rankText({ warmerThan: 71, of: 86 }, 'November 2')).toBe('Warmer than 71 of 86 past November 2s');
    expect(rankText({ warmerThan: 86, of: 86 }, 'November 2')).toMatch(/every November 2/);
    expect(rankText({ warmerThan: 0, of: 86 }, 'November 2')).toMatch(/Cooler than every/);
  });

  it('picks highlight years without repeats', () => {
    const list = highlightYears(h);
    expect(list.map((y) => y.year)).toEqual([2025, 2016, 2001, 1976, 1950]);
    expect(list[0].why).toBe('Last year');
    expect(list.at(-1).why).toBe('Record high');
  });

  it('scales the chart and finds the nearest year', () => {
    const s = chartScale(years, { high: 63, low: 42 });
    expect(s.lo).toBe(40);
    expect(s.hi).toBe(70);
    expect(s.x(s.first)).toBe(s.pad);
    expect(s.x(s.last)).toBe(s.width - s.pad);
    expect(s.y(s.hi)).toBe(s.pad);
    expect(chartScale([], null)).toBe(null);
    expect(yearAt(years, 1939).year).toBe(1940);
    expect(yearAt(years, 1999).year).toBe(1999);
  });
});
