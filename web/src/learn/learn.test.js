import { describe, it, expect } from 'vitest';
import { skyScene, sceneCaption, driftDirection, toMph, precipType } from './sky.js';
import { whyLessons } from './why.js';
import { TOPICS, CLOUD_TYPES, topicById, likelyCloud } from './topics.js';
import { HAZARDS, hazardAlerts, nearbyStorms, milesBetween } from './storms.js';

const imperial = { temp: '°F', wind: 'mph', precip: 'in', pressure: 'hPa' };
const metric = { temp: '°C', wind: 'km/h', precip: 'mm', pressure: 'hPa' };
const fc = (current, units = imperial) => ({ current: { isDay: true, code: 1, ...current }, units });

describe('sky scene', () => {
  it('drifts clouds downwind at the real wind speed', () => {
    expect(driftDirection(270)).toBeCloseTo(1); // west wind pushes clouds right
    expect(driftDirection(90)).toBeCloseTo(-1); // east wind pushes clouds left
    expect(Math.abs(driftDirection(0))).toBe(0.25); // north wind: slow sideways drift
    const s = skyScene({ windSpeed: 10, windDir: 270, cloudCover: 50, code: 2 }, imperial);
    expect(s.drift).toBeCloseTo(30);
    expect(s.clouds).toBe(6);
    expect(s.mph).toBe(10);
  });

  it('converts km/h so metric users see the same speed', () => {
    expect(toMph(16.09, 'km/h')).toBeCloseTo(10);
    expect(skyScene({ windSpeed: 16.09, windDir: 270, code: 1 }, metric).mph).toBe(10);
  });

  it('shows rain, snow and lightning from the weather code', () => {
    expect(precipType(63)).toBe('rain');
    expect(precipType(75)).toBe('snow');
    expect(precipType(66)).toBe('sleet');
    expect(precipType(2)).toBe(null);
    const storm = skyScene({ code: 95, cloudCover: 100, windSpeed: 20, windGust: 40 }, imperial);
    expect(storm.lightning).toBe(true);
    expect(storm.precip).toBe('rain');
    expect(storm.gusty).toBe(true);
    expect(skyScene({ code: 65 }, imperial).intensity).toBe(1);
    expect(skyScene({ code: 61 }, imperial).drops).toBeLessThan(skyScene({ code: 65 }, imperial).drops);
  });

  it('shows stars on clear nights', () => {
    expect(skyScene({ code: 0, cloudCover: 5, isDay: false }, imperial).stars).toBe(true);
    expect(skyScene({ code: 3, cloudCover: 95, isDay: false }, imperial).stars).toBe(false);
  });

  it('writes a caption', () => {
    const cap = sceneCaption(skyScene({ code: 63, cloudCover: 90, windSpeed: 12, windDir: 200 }, imperial));
    expect(cap).toMatch(/^90% cloud cover, clouds drifting at 12 mph, rain\.$/);
    expect(sceneCaption(skyScene({ code: 0, cloudCover: 0 }, imperial), true)).toMatch(/No clouds/);
  });
});

describe('why lessons', () => {
  it('explains fog with the real temperature and dew point', () => {
    const l = whyLessons(fc({ code: 45, temp: 52, dewPoint: 51, humidity: 97, pressure: 1015 }));
    expect(l[0].id).toBe('fog');
    expect(l[0].kid).toContain("only 1 degree apart");
    expect(l[0].reading).toBe('Temperature 52°F, dew point 51°F');
    expect(l[0].topic).toBe('clouds');
  });

  it('warns that fog may form when the spread is tiny', () => {
    const l = whyLessons(fc({ code: 1, temp: 40, dewPoint: 38, humidity: 93 }));
    expect(l.find((x) => x.id === 'fog').title).toBe('Why might fog form?');
  });

  it('always explains pressure, and ranks a fast drop higher', () => {
    const calm = whyLessons(fc({ pressure: 1025, pressureTrend3h: 0.2, cloudCover: 10 }));
    const p = calm.find((x) => x.id === 'pressure');
    expect(p.title).toMatch(/high pressure/i);
    expect(p.reading).toBe('1025 hPa, steady');
    const falling = whyLessons(fc({ pressure: 1004, pressureTrend3h: -3.1, cloudCover: 80 }));
    expect(falling[0].id).toBe('pressure');
    expect(falling[0].title).toMatch(/low pressure/i);
    expect(falling[0].kid).toMatch(/dropping fast/);
  });

  it('puts storms first and links them to the Storm Center', () => {
    const l = whyLessons(fc({ code: 95, pressure: 1006 }), { alerts: [{ event: 'Severe Thunderstorm Warning' }] });
    expect(l[0].id).toBe('thunder');
    expect(l.find((x) => x.id === 'alerts').topic).toBe('storms');
  });

  it('handles Celsius for muggy and wind chill checks', () => {
    const l = whyLessons(fc({ temp: 30, dewPoint: 21, feelsLike: 34 }, metric));
    expect(l.map((x) => x.id)).toContain('muggy');
    const cold = whyLessons(fc({ temp: -2, feelsLike: -8, windSpeed: 30 }, metric));
    expect(cold.map((x) => x.id)).toEqual(expect.arrayContaining(['windchill', 'wind']));
  });

  it('has a kid and a grown-up version of every lesson', () => {
    const l = whyLessons(fc({ code: 63, temp: 85, dewPoint: 70, feelsLike: 92, uv: 8, windSpeed: 20, pressure: 1003, cloudCover: 90 }));
    expect(l.length).toBeGreaterThan(4);
    for (const x of l) {
      expect(x.kid.length).toBeGreaterThan(40);
      expect(x.adult.length).toBeGreaterThan(40);
      if (x.topic && x.topic !== 'storms') expect(topicById(x.topic)).not.toBeNull();
    }
  });

  it('returns nothing without data', () => {
    expect(whyLessons(null)).toEqual([]);
  });
});

describe('topics and storm center', () => {
  it('every topic has kid and adult text, sections and a valid quiz', () => {
    for (const t of [...TOPICS, ...HAZARDS]) {
      expect(t.kid && t.adult).toBeTruthy();
      const quiz = Array.isArray(t.quiz) ? t.quiz : [t.quiz];
      for (const q of quiz) expect(q.options[q.answer]).toBeDefined();
      for (const l of t.links || []) expect(l.url).toMatch(/^https:\/\//);
    }
    for (const t of TOPICS) for (const s of t.sections) expect(s.kid && s.adult).toBeTruthy();
  });

  it('guesses which cloud to look for', () => {
    expect(likelyCloud(95, 100)).toBe('cumulonimbus');
    expect(likelyCloud(45, 100)).toBe('stratus');
    expect(likelyCloud(63, 100)).toBe('nimbostratus');
    expect(likelyCloud(2, 40)).toBe('cumulus');
    expect(likelyCloud(0, 0)).toBe(null);
    for (const code of [0, 1, 2, 3, 45, 51, 61, 71, 80, 95]) {
      const id = likelyCloud(code, 50);
      if (id) expect(CLOUD_TYPES.some((c) => c.id === id)).toBe(true);
    }
  });

  it('matches local alerts to the right hazard', () => {
    const alerts = [{ event: 'Tornado Watch' }, { event: 'Red Flag Warning' }, { event: 'Tropical Storm Warning' }, { event: 'Flood Advisory' }];
    const [tornado, fire, hurricane] = HAZARDS;
    expect(hazardAlerts(alerts, tornado).map((a) => a.event)).toEqual(['Tornado Watch']);
    expect(hazardAlerts(alerts, fire).map((a) => a.event)).toEqual(['Red Flag Warning']);
    expect(hazardAlerts(alerts, hurricane).map((a) => a.event)).toEqual(['Tropical Storm Warning']);
  });

  it('sorts tropical storms by distance', () => {
    expect(milesBetween({ lat: 25.76, lon: -80.19 }, { lat: 29.95, lon: -90.07 })).toBeGreaterThan(660);
    const out = nearbyStorms([{ id: 'far', lat: 15, lon: -40 }, { id: 'near', lat: 26, lon: -79 }, { id: 'bad', lat: null, lon: 1 }], { lat: 25.76, lon: -80.19 });
    expect(out.map((s) => s.id)).toEqual(['near', 'far']);
    expect(out[0].miles).toBeLessThan(100);
  });

  it('El Niño news filter catches both spellings', () => {
    const re = topicById('elnino').news;
    expect(re.test('El Nino returns')).toBe(true);
    expect(re.test('La Niña watch issued')).toBe(true);
    expect(re.test('ENSO update')).toBe(true);
    expect(re.test('Snow in Denver')).toBe(false);
  });
});
