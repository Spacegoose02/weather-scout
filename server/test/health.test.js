import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForecast } from '../src/providers/openmeteo.js';
import { pressureWatch, wbgtShade, heatCategory, heatStress } from '../src/health.js';
import { moonPhase } from '../src/sky.js';
import { fakeForecast } from './helpers.js';

const fc = (opts, units = 'imperial') => normalizeForecast(fakeForecast(opts), units);

test('steady pressure is calm', () => {
  const p = pressureWatch(fc({}));
  assert.equal(p.level, 'calm');
});

test('a fast pressure drop ahead is a warning', () => {
  const f = fc({});
  const now = Date.now();
  f.hourly = f.hourly.map((h) => ({ ...h, pressure: h.epoch > now ? 1015 - Math.min(8, (h.epoch - now) / 3600_000 * 2) : 1015 }));
  const p = pressureWatch(f, now);
  assert.equal(p.level, 'warning');
  assert.ok(p.change <= -6);
  assert.match(p.message, /drop/);
});

test('WBGT shade estimate matches the BoM formula', () => {
  // 35 °C, 50% RH: e = 28.1 hPa, WBGT = 0.567*35 + 0.393*28.1 + 3.94 ≈ 34.8 °C
  assert.ok(Math.abs(wbgtShade(35, 50, true) - 34.8) < 0.2);
  // Same in °F
  assert.ok(Math.abs(wbgtShade(95, 50, false) - 94.6) < 0.4);
  assert.equal(wbgtShade(null, 50, true), null);
});

test('heat categories follow the flag bands', () => {
  assert.equal(heatCategory(75, false).label, 'Low');
  assert.equal(heatCategory(86, false).label, 'High');
  assert.equal(heatCategory(92, false).label, 'Extreme');
  assert.equal(heatCategory(30, true).label, 'High'); // 30 °C = 86 °F
});

test('heatStress reports now and the 24-hour peak', () => {
  const h = heatStress(fc({ temp: 90 }));
  assert.ok(h.now.wbgt > 75);
  assert.ok(h.peak.wbgt >= h.now.wbgt - 0.1);
  assert.ok(h.peak.category.label);
});

test('moon phase on known dates', () => {
  assert.equal(moonPhase(Date.UTC(2000, 0, 6, 20)).name, 'New moon');
  // Full moon 2024-01-25 17:54 UTC
  const full = moonPhase(Date.UTC(2024, 0, 25, 18));
  assert.equal(full.name, 'Full moon');
  assert.ok(full.illumination >= 98);
  // New moon 2024-04-08 (the total solar eclipse)
  assert.equal(moonPhase(Date.UTC(2024, 3, 8, 18)).name, 'New moon');
  const m = moonPhase(Date.UTC(2024, 0, 20));
  assert.ok(m.waxing);
  assert.ok(Date.parse(m.nextFull) > Date.UTC(2024, 0, 24) && Date.parse(m.nextFull) < Date.UTC(2024, 0, 27));
});
