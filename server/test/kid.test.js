import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForecast } from '../src/providers/openmeteo.js';
import { outfit, gearChecklist, playgroundRating, lessons, kidReport } from '../src/kid.js';
import { fakeForecast } from './helpers.js';

const fc = (o) => normalizeForecast(fakeForecast(o), 'imperial');

test('raincoat and boots when rain chance is over 60%', () => {
  const o = outfit(fc({ chance: 80, code: 61 }));
  assert.ok(o.items.includes('raincoat'));
  assert.ok(o.items.includes('boots'));
});

test('beanie and mittens when wind chill drops below 35F', () => {
  const o = outfit(fc({ temp: 38, feels: 28 }));
  assert.ok(o.items.includes('beanie'));
  assert.ok(o.items.includes('mittens'));
});

test('sunglasses and sunscreen on a sunny high-UV day', () => {
  const f = fc({ uv: 8, temp: 85 });
  assert.ok(outfit(f).items.includes('sunglasses'));
  assert.ok(gearChecklist(f).some((i) => i.id === 'sunscreen'));
});

test('playground is red during thunderstorms', () => {
  assert.equal(playgroundRating(fc({ code: 95 })).rating, 'red');
});

test('playground is red with a severe NWS alert', () => {
  const r = playgroundRating(fc({}), { alerts: [{ event: 'Tornado Warning', severity: 'Extreme' }] });
  assert.equal(r.rating, 'red');
  assert.match(r.reasons[0], /Tornado Warning/);
});

test('playground is yellow when it is muddy from recent rain', () => {
  assert.equal(playgroundRating(fc({ precip: 0.1 })).rating, 'yellow');
});

test('playground is green on a nice day', () => {
  assert.equal(playgroundRating(fc({})).rating, 'green');
});

test('fog lesson explains dew point', () => {
  const l = lessons(fc({ code: 45 }));
  assert.ok(l.find((x) => x.id === 'fog').body.includes('dew point'));
});

test('falling pressure lesson', () => {
  assert.ok(lessons(fc({ pressureDrop: 4 })).some((x) => x.id === 'pressure-low'));
});

test('metric forecasts use the same thresholds', () => {
  const f = normalizeForecast(fakeForecast({ temp: 3, feels: -2 }), 'metric');
  assert.ok(outfit(f).items.includes('mittens'));
});

test('kidReport has every section', () => {
  const r = kidReport(fc({}));
  for (const k of ['raccoon', 'checklist', 'playground', 'lessons', 'sky']) assert.ok(k in r, k);
  assert.ok(r.sky.sunset);
});

test('no light jacket on top of a raincoat', () => {
  const o = outfit(fc({ chance: 80, code: 61, temp: 50, feels: 48 }));
  assert.ok(o.items.includes('raincoat'));
  assert.ok(!o.items.includes('jacket'));
});
