import { describe, it, expect, afterEach } from 'vitest';
import { t, pickLang, setLang, condLabel, ES, locale } from '../../i18n.js';
import { dayLabel } from '../../format.js';
import { CARDS, CARD_GROUPS } from '../../dashboard/layout.js';
import { ADULT_TABS, KID_TABS } from '../../nav.js';
import { questionFor, QUESTIONS, SKY_PICKS, WIND_PICKS } from './questions.js';
import { skyGuess } from './Classroom.jsx';
import { climateHeadline } from '../climate/ClimateCard.jsx';

afterEach(() => setLang('en'));

describe('Spanish', () => {
  it('follows the preference, else the browser', () => {
    expect(pickLang('es', 'en-US')).toBe('es');
    expect(pickLang('en', 'es-MX')).toBe('en');
    expect(pickLang(undefined, 'es-MX')).toBe('es');
    expect(pickLang(undefined, 'fr-FR')).toBe('en');
  });

  it('translates, fills in values and falls back to English', () => {
    expect(t('Settings')).toBe('Settings');
    setLang('es');
    expect(t('Settings')).toBe('Configuración');
    expect(t('Feels like {temp}', { temp: '72°F' })).toBe('Sensación de 72°F');
    expect(t('Something new')).toBe('Something new');
    expect(condLabel(63, 'Rain')).toBe('Lluvia');
    expect(condLabel(1234, 'Odd')).toBe('Odd');
    expect(locale()).toBe('es');
    expect(dayLabel('2026-11-08', 0)).toBe('Hoy');
    expect(dayLabel('2026-11-09', 1)).toBe('lun');
  });

  it('covers every tab, card name, card blurb and card group', () => {
    const missing = [...ADULT_TABS, ...KID_TABS].flatMap((x) => [x.label, x.short])
      .concat(CARDS.flatMap((c) => [c.title, c.blurb]), CARD_GROUPS.map((g) => g[1]))
      .concat(SKY_PICKS.map((p) => p.label), WIND_PICKS.map((p) => p.label))
      .filter((s) => !ES[s]);
    expect(missing).toEqual([]);
  });
});

describe('classroom board', () => {
  it('has a question a day, in both languages', () => {
    expect(questionFor(new Date(2026, 10, 8))).not.toBe(questionFor(new Date(2026, 10, 9)));
    expect(QUESTIONS.every((q) => q.q && q.a && q.qEs && q.aEs)).toBe(true);
  });

  it('starts the log entry from what the sky is doing', () => {
    expect(skyGuess({ code: 63, windSpeed: 12, temp: 51.4 })).toEqual({ sky: 'rain', wind: 'breezy', precip: true, temp: 51 });
    expect(skyGuess({ code: 0, windSpeed: 3 })).toMatchObject({ sky: 'sunny', wind: 'calm', precip: false, temp: null });
    expect(skyGuess({ code: 73, windSpeed: 35 }, 'metric')).toMatchObject({ sky: 'snow', wind: 'windy' });
    expect(skyGuess({ code: 81, windSpeed: 20 }, 'metric')).toMatchObject({ sky: 'rain', wind: 'breezy' });
    expect(skyGuess({ code: 95 }).sky).toBe('storm');
  });
});

describe('drought & El Niño card', () => {
  it('sums up in one line', () => {
    expect(climateHeadline({ drought: { label: 'Moderate drought' }, enso: { status: 'La Niña Advisory' } })).toBe('Moderate drought · La Niña Advisory');
    expect(climateHeadline({ drought: null, enso: { phase: { short: 'Neutral' } } })).toBe('Neutral');
  });
});
