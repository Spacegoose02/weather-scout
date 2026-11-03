import test from 'node:test';
import assert from 'node:assert/strict';
import { modelMapUrl, normalizeModelMap } from '../src/providers/modelmaps.js';
import {
  GRID_COLS, GRID_ROWS, MAP_MODELS, colorAt, gridFor, gridPos, legendFor, pressureCenters, sampleGrid, scaleValue,
} from '../../shared/modelmap.js';
import { testApp, mockFetch } from './helpers.js';

const HOUR = 3600_000;

// One Open-Meteo forecast per grid point. Temperature rises west to east, it
// rains 0.1 in every hour in the north-west corner, and pressure dips in the middle.
function fakeGrid({ days = 7, nullAt = () => false } = {}) {
  const start = Math.floor(Date.now() / HOUR) * HOUR - 24 * HOUR;
  const time = Array.from({ length: 24 * days }, (_, i) => (start + i * HOUR) / 1000);
  const out = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const fill = (v) => time.map(() => (nullAt(r, c) ? null : v));
      out.push({
        latitude: 0, longitude: 0, utc_offset_seconds: 0,
        hourly: {
          time,
          temperature_2m: fill(50 + c),
          precipitation: fill(r < 2 && c < 2 ? 0.1 : 0),
          wind_speed_10m: fill(10),
          wind_direction_10m: fill(270),
          cloud_cover: fill(r * 8),
          pressure_msl: fill(1010 + Math.abs(r - 6) + Math.abs(c - 7)),
        },
      });
    }
  }
  return out;
}

test('grid covers the area around the place, north to south and west to east', () => {
  const g = gridFor(37.55, -77.46, 'region');
  assert.equal(g.lats.length, GRID_ROWS);
  assert.equal(g.lons.length, GRID_COLS);
  assert.ok(g.lats[0] > 37.55 && g.lats[GRID_ROWS - 1] < 37.55);
  assert.ok(g.lons[0] < -77.46 && g.lons[GRID_COLS - 1] > -77.46);
  assert.equal(g.center.lat, 37.5);
  // Nearby places share one grid (and one cache entry).
  assert.deepEqual(gridFor(37.6, -77.4, 'region').lats, g.lats);
  const p = gridPos(g, g.center.lat, g.center.lon);
  assert.ok(Math.abs(p.r - (GRID_ROWS - 1) / 2) < 0.01 && Math.abs(p.c - (GRID_COLS - 1) / 2) < 0.01);
});

test('model map url asks for every grid point in one request', () => {
  const g = gridFor(37.55, -77.46, 'nearby');
  const u = new URL(modelMapUrl(MAP_MODELS.find((m) => m.id === 'gfs_hrrr'), g, 'imperial'));
  assert.equal(u.searchParams.get('latitude').split(',').length, GRID_ROWS * GRID_COLS);
  assert.equal(u.searchParams.get('models'), 'gfs_hrrr');
  assert.equal(u.searchParams.get('forecast_days'), '3');
  assert.equal(u.searchParams.get('timezone'), 'GMT');
  assert.match(u.searchParams.get('hourly'), /pressure_msl/);
});

test('normalize: 3-hour steps from now, rain summed over each 3 hours', () => {
  const g = gridFor(37.55, -77.46, 'region');
  const m = normalizeModelMap(fakeGrid(), MAP_MODELS[0], g, 'imperial');
  assert.equal(m.times.length, 5 * 8 + 1);
  assert.equal(m.times[1] - m.times[0], 3 * HOUR);
  assert.ok(m.times[0] <= Date.now() && m.times[0] > Date.now() - HOUR);
  assert.equal(m.fields.temp[0][0], 50);
  assert.equal(m.fields.temp[0][GRID_COLS - 1], 50 + GRID_COLS - 1);
  assert.equal(m.fields.precip[2][0], 0.3);
  assert.equal(m.coverage, 1);
  assert.throws(() => normalizeModelMap(fakeGrid().slice(1), MAP_MODELS[0], g, 'imperial'), /grid points/);
});

test('sampling interpolates and skips missing points', () => {
  const v = [0, 10, 20, 30];
  assert.equal(sampleGrid(v, 2, 2, 0.5, 0.5), 15);
  assert.equal(sampleGrid(v, 2, 2, 0, 1), 10);
  assert.equal(sampleGrid([null, null, null, 30], 2, 2, 0, 0), null);
  assert.equal(sampleGrid([null, 10, 20, 30], 2, 2, 0.5, 0.5), 20);
  assert.equal(sampleGrid(v, 2, 2, -1, 0), null);
});

test('colors: dry is clear, units convert, pressure highs and lows', () => {
  assert.equal(colorAt('precip', scaleValue('precip', 0, 'imperial'))[3], 0);
  assert.ok(colorAt('precip', scaleValue('precip', 0.2, 'imperial'))[3] > 200);
  assert.equal(scaleValue('temp', 0, 'metric'), 32);
  assert.deepEqual(colorAt('temp', null), [0, 0, 0, 0]);
  const l = legendFor('precip', 'metric');
  assert.equal(l.unit, 'mm in 3 h');
  assert.ok(l.ticks.every((t, i) => i === 0 || t.at > l.ticks[i - 1].at));
  const g = fakeGrid()[0] && Array.from({ length: GRID_ROWS * GRID_COLS }, (_, k) => 1010 + Math.abs(Math.floor(k / GRID_COLS) - 6) + Math.abs((k % GRID_COLS) - 7));
  const centers = pressureCenters(g, GRID_ROWS, GRID_COLS);
  assert.deepEqual(centers.map((x) => [x.kind, x.r, x.c]), [['L', 6, 7]]);
});

test('/api/modelmap returns a grid; HRRR outside the US says so', async () => {
  const { app, fetchImpl } = await testApp({
    fetchImpl: mockFetch({
      'models=gfs_hrrr': () => new Response('{"error":true,"reason":"No data"}', { status: 400 }),
      'models=gem_seamless': () => Response.json(fakeGrid({ nullAt: () => true })),
      'models=ecmwf_ifs025': () => Response.json(fakeGrid()),
    }),
  });
  const r = await app.inject({ url: '/api/modelmap?lat=37.55&lon=-77.46&model=ecmwf_ifs025&area=region' });
  assert.equal(r.statusCode, 200);
  const m = r.json();
  assert.equal(m.name, 'ECMWF');
  assert.equal(m.rows * m.cols, m.fields.temp[0].length);
  // Cached for the hour.
  await app.inject({ url: '/api/modelmap?lat=37.56&lon=-77.45&model=ecmwf_ifs025&area=region' });
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('models=ecmwf_ifs025')).length, 1);

  const h = await app.inject({ url: '/api/modelmap?lat=51.5&lon=-0.1&model=gfs_hrrr' });
  assert.equal(h.statusCode, 404);
  assert.match(h.json().error, /only covers the United States/);
  const empty = await app.inject({ url: '/api/modelmap?lat=37.55&lon=-77.46&model=gem_seamless' });
  assert.equal(empty.statusCode, 404);
  const bad = await app.inject({ url: '/api/modelmap?lat=37.55&lon=-77.46&model=nope' });
  assert.equal(bad.statusCode, 400);
});
