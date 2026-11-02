import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForecast, aqiCategory, forecastUrl } from '../src/providers/openmeteo.js';
import { normalizeAlerts, kidSummary } from '../src/providers/nws.js';
import { radarFrames } from '../src/providers/radar.js';
import { parseIbi511, parseGeoJson } from '../src/providers/cameras/index.js';
import { fakeForecast, fakeAlerts, fakeIbiCameras } from './helpers.js';

test('forecast normalizes to 48 hours and 10 days', () => {
  const f = normalizeForecast(fakeForecast(), 'imperial');
  assert.equal(f.hourly.length, 48);
  assert.equal(f.daily.length, 10);
  assert.equal(f.current.label, 'Clear sky');
  assert.equal(f.units.temp, '°F');
  assert.ok(f.hourly[0].epoch <= Date.now());
});

test('forecast url asks for imperial units and auto timezone', () => {
  const u = new URL(forecastUrl(37.5, -77.4, 'imperial'));
  assert.equal(u.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('forecast_days'), '10');
});

test('AQI categories', () => {
  assert.equal(aqiCategory(30).label, 'Good');
  assert.equal(aqiCategory(120).color, 'orange');
  assert.equal(aqiCategory(null), null);
});

test('alerts sort most severe first with kid summaries', () => {
  const a = normalizeAlerts(fakeAlerts);
  assert.equal(a[0].event, 'Tornado Warning');
  assert.match(a[0].kid, /lowest floor/);
  assert.match(kidSummary('Something odd'), /grown-up/);
});

test('radar returns an 11-frame loop ending at the live layer', () => {
  const r = radarFrames(Date.parse('2026-11-02T18:07:00Z'));
  assert.equal(r.frames.length, 11);
  assert.match(r.frames[0].url, /m50m/);
  assert.match(r.frames.at(-1).url, /nexrad-n0q-900913\/\{z\}/);
  assert.equal(r.frames.at(-1).time, '2026-11-02T18:05:00.000Z');
});

test('IBI 511 cameras drop disabled ones', () => {
  const c = parseIbi511(fakeIbiCameras, {});
  assert.equal(c.length, 2);
  assert.equal(c[0].name, 'I-95 at Exit 74');
});

test('IBI 511 v2 cameras use the first live view', () => {
  const c = parseIbi511([{ Id: 9, Location: 'Bridge', Latitude: 1, Longitude: 2, Views: [{ Url: 'x.jpg', Status: 'Enabled' }] }], {});
  assert.equal(c[0].image, 'x.jpg');
  assert.equal(c[0].name, 'Bridge');
});

test('GeoJSON cameras honor field mapping', () => {
  const raw = { features: [{ geometry: { type: 'Point', coordinates: [-77.4, 37.5] }, properties: { cam_id: 'a', desc: 'Main St', img: 'http://i/a.jpg' } }] };
  const c = parseGeoJson(raw, { fields: { id: 'cam_id', name: 'desc', image: 'img' } });
  assert.deepEqual([c[0].id, c[0].name, c[0].lat, c[0].lon], ['a', 'Main St', 37.5, -77.4]);
});
