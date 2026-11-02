import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAir, pollenLevel, getAirQuality } from '../src/providers/openmeteo.js';
import { radarFrames } from '../src/providers/radar.js';

const now = Date.parse('2026-06-01T16:20:00Z');
const times = Array.from({ length: 72 }, (_, i) => new Date(Date.parse('2026-06-01T00:00:00Z') + i * 3600e3).toISOString().slice(0, 16));
const raw = (extra = {}) => ({
  utc_offset_seconds: -4 * 3600,
  current: { us_aqi: 72, pm2_5: 18, pm10: 22, ozone: 120, nitrogen_dioxide: 9, uv_index: 7, ...extra },
  hourly: {
    time: times,
    us_aqi: times.map((_, i) => 40 + i),
    us_aqi_pm2_5: times.map(() => 55), us_aqi_pm10: times.map(() => 20),
    us_aqi_ozone: times.map(() => 72), us_aqi_nitrogen_dioxide: times.map(() => 8),
    uv_index: times.map((t) => { const h = Number(t.slice(11, 13)); return h >= 7 && h <= 19 ? Math.max(0, 8 - Math.abs(13 - h) * 1.4) : 0; }),
  },
});

test('air breakdown: sub-indices, main pollutant and hourly from the current local hour', () => {
  const a = normalizeAir(raw(), now);
  assert.equal(a.aqi, 72);
  assert.deepEqual(a.subIndex, { pm25: 55, pm10: 20, ozone: 72, no2: 8 });
  assert.equal(a.main.id, 'ozone');
  assert.equal(a.hourly[0].time, '2026-06-01T12:00'); // 16:20Z at UTC-4
  assert.equal(a.hourly.length, 48);
  assert.equal(a.pollen, null);
});

test('pollen appears only when the source has it (Europe)', () => {
  const a = normalizeAir(raw({ birch_pollen: 120, alder_pollen: 3, grass_pollen: 25, ragweed_pollen: null, mugwort_pollen: 1 }), now);
  assert.equal(a.pollen.tree.level, 'High');
  assert.equal(a.pollen.grass.level, 'High');
  assert.equal(a.pollen.weed.level, 'Low');
  assert.equal(pollenLevel(null), null);
  assert.equal(pollenLevel(300, 'tree'), 'Very high');
});

test('the air request asks for sub-indices and UV by the hour', async () => {
  let url;
  await getAirQuality({ lat: 37.5, lon: -77.4 }, async (u) => { url = u; return Response.json(raw()); });
  assert.match(url, /hourly=us_aqi%2Cus_aqi_pm2_5/);
  assert.match(url, /uv_index_clear_sky/);
  assert.match(url, /grass_pollen/);
});

test('radar config includes the satellite layer', () => {
  const r = radarFrames();
  assert.match(r.satellite.wms, /^https:\/\/gibs\.earthdata\.nasa\.gov\//);
  assert.equal(r.satellite.layers, 'GOES-East_ABI_Band13_Clean_Infrared');
});
