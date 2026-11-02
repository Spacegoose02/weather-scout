import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, GROUPS, resolveTheme, weatherTheme, themeById } from './themes.js';

const w = (current, alerts = [], temp = '°F') => ({ forecast: { current, units: { temp } }, alerts });

describe('themes', () => {
  it('every theme has CSS and a known group', () => {
    const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
    const groups = GROUPS.map(([g]) => g);
    for (const t of THEMES) {
      expect(css).toContain(`:root[data-theme='${t.id}'] {`);
      expect(groups).toContain(t.group);
    }
  });

  it('ids are unique', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it('falls back to light for unknown ids', () => {
    expect(themeById('nope').id).toBe('light');
    expect(resolveTheme('nope').id).toBe('light');
  });

  it('auto follows the device', () => {
    expect(resolveTheme('auto', { systemDark: true }).id).toBe('dark');
    expect(resolveTheme(undefined, { systemDark: false }).id).toBe('light');
  });

  it('a picked theme stays put whatever the weather', () => {
    expect(resolveTheme('aurora', { weather: w({ code: 95 }) }).id).toBe('aurora');
  });

  it('Rocky picks from the weather', () => {
    expect(weatherTheme(w({ code: 95, isDay: true })).id).toBe('thunderstorm');
    expect(weatherTheme(w({ code: 73, isDay: true })).id).toBe('rocky-snow');
    expect(weatherTheme(w({ code: 63, isDay: true })).id).toBe('rainy');
    expect(weatherTheme(w({ code: 45, isDay: true })).id).toBe('cloudy');
    expect(weatherTheme(w({ code: 0, isDay: true, temp: 80 })).id).toBe('sunny');
    expect(weatherTheme(w({ code: 0, isDay: true, temp: 101 })).id).toBe('heatwave');
    expect(weatherTheme(w({ code: 0, isDay: true, temp: 30 }, [], '°C')).id).toBe('sunny');
    expect(weatherTheme(w({ code: 0, isDay: false })).id).toBe('aurora');
    expect(weatherTheme(w({ code: 3, isDay: false })).id).toBe('dark');
    expect(weatherTheme(w({ code: 2, isDay: true })).id).toBe('light');
  });

  it('alerts beat conditions', () => {
    expect(weatherTheme(w({ code: 0, isDay: true }, [{ event: 'Hurricane Warning' }])).id).toBe('hurricane');
    expect(weatherTheme(w({ code: 95 }, [{ event: 'Tornado Warning' }])).id).toBe('tornado');
    expect(weatherTheme(w({ code: 3 }, [{ event: 'Blizzard Warning' }])).id).toBe('blizzard');
    expect(weatherTheme(w({ code: 0, isDay: true, temp: 90 }, [{ event: 'Heat Advisory' }])).id).toBe('heatwave');
  });

  it('every weather pick explains itself and exists', () => {
    const r = weatherTheme(w({ code: 95 }));
    expect(r.why).toMatch(/thunder/i);
    expect(THEMES.some((t) => t.id === r.id)).toBe(true);
  });

  it('"Let Rocky pick" waits on the device setting until weather loads', () => {
    expect(resolveTheme('weather', { systemDark: true }).id).toBe('dark');
  });
});
