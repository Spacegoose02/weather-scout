import test from 'node:test';
import assert from 'node:assert/strict';
import { BusyError, PointBudget, modelMapUrl, normalizeModelMap, sharedBudget } from '../src/providers/modelmaps.js';
import { TtlCache } from '../src/cache.js';
import {
  GRID_COLS, GRID_ROWS, MAP_MODELS, defaultArea, inHrrr, pointsFor, colorAt, gridFor, gridPos, legendFor, pressureCenters, sampleGrid, sampleSmooth, scaleValue,
} from '../../shared/modelmap.js';
import { testApp, mockFetch } from './helpers.js';

const HOUR = 3600_000;

// Rows and columns asked for in a model map url.
const sizeOf = (u) => {
  const q = new URL(u).searchParams;
  const lats = q.get('latitude').split(',');
  const cols = lats.filter((x) => x === lats[0]).length;
  return { rows: lats.length / cols, cols };
};

// One Open-Meteo forecast per grid point. Temperature rises west to east, it
// rains 0.1 in every hour in the north-west corner, and pressure dips in the middle.
function fakeGrid({ days = 7, nullAt = () => false, rows = GRID_ROWS, cols = GRID_COLS } = {}) {
  const start = Math.floor(Date.now() / HOUR) * HOUR - 24 * HOUR;
  const time = Array.from({ length: 24 * days }, (_, i) => (start + i * HOUR) / 1000);
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
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
      'models=gem_seamless': (u) => Response.json(fakeGrid({ nullAt: () => true, ...sizeOf(u) })),
      'models=ecmwf_ifs025': (u) => Response.json(fakeGrid(sizeOf(u))),
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

test('US places get the whole lower 48 by default; elsewhere a wide area', async () => {
  const g = gridFor(37.55, -77.46, 'country');
  assert.equal(g.lats[0], 50);
  assert.equal(g.lats[g.rows - 1], 23.5);
  assert.equal(g.lons[0], -126);
  assert.equal(g.lons[g.cols - 1], -65.5);
  assert.deepEqual(gridFor(47.6, -122.3, 'country').lats, g.lats); // Seattle shares the same map
  assert.ok(g.rows * g.cols * 2 <= 600, 'two whole-US maps fit in a minute of Open-Meteo calls');
  assert.equal(defaultArea(37.55, -77.46), 'country');
  assert.equal(defaultArea(51.5, -0.1), 'region');
  const uk = gridFor(51.5, -0.1, 'country');
  assert.ok(uk.lats[0] > 60 && uk.lats[uk.rows - 1] < 40);

  // North America: Canada, the lower 48 and Mexico on one shared grid.
  const na = gridFor(37.55, -77.46, 'continent');
  assert.deepEqual([na.lats[0], na.lats[na.rows - 1], na.lons[0], na.lons[na.cols - 1]], [60, 15, -135, -55]);
  assert.deepEqual(gridFor(45.4, -75.7, 'continent').lats, na.lats); // Ottawa shares it
  assert.deepEqual(gridFor(19.4, -99.1, 'continent').lons, na.lons); // and Mexico City
  assert.ok(na.rows * na.cols * 2 <= 600, 'two North America maps fit in a minute of Open-Meteo calls');
  assert.ok(gridFor(51.5, -0.1, 'continent').center.lon > -10, 'elsewhere it is a wide area around the place');

  // Like Open-Meteo: one point off HRRR's grid and the whole request is refused.
  const hrrr = (u) => {
    const q = new URL(u).searchParams;
    const lats = q.get('latitude').split(',').map(Number);
    const lons = q.get('longitude').split(',').map(Number);
    if (lats.some((la, i) => !inHrrr(la, lons[i], 0))) return new Response('{"error":true,"reason":"No data is available for this location"}', { status: 400 });
    return Response.json(fakeGrid({ rows: 1, cols: lats.length }));
  };
  sharedBudget.spent = []; // a fresh minute of Open-Meteo calls (the test above used some)
  const { app, fetchImpl } = await testApp({ fetchImpl: mockFetch({ 'models=gfs_hrrr': hrrr }) });
  const r = await app.inject({ url: '/api/modelmap?lat=37.55&lon=-77.46&model=gfs_hrrr' });
  assert.equal(r.statusCode, 200, r.body);
  const m = r.json();
  // The corners off HRRR's grid stay empty; everything else is painted.
  assert.equal(m.fields.temp[0][0], null);
  assert.ok(m.coverage > 0.8 && m.coverage < 1);
  const richmond = gridPos(m, 37.55, -77.46);
  assert.notEqual(m.fields.temp[0][Math.round(richmond.r) * m.cols + Math.round(richmond.c)], null);
  assert.equal(m.area, 'country');
  assert.equal(m.fields.temp[0].length, m.rows * m.cols);
  assert.equal(m.lons[0], -126);
  await app.inject({ url: '/api/modelmap?lat=34.05&lon=-118.24&model=gfs_hrrr' }); // Los Angeles: same cached map
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('models=gfs_hrrr')).length, 1);
});

test('point budget makes a request wait when the minute is used up', async () => {
  let t = 0;
  const waits = [];
  const b = new PointBudget({ perMinute: 600, now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } });
  await b.take(275);
  await b.take(275);
  assert.equal(waits.length, 0);
  await b.take(275);
  assert.equal(waits.length, 1);
  assert.ok(t >= 60_000);
  await b.take(2000); // bigger than a minute's worth still goes, alone
  assert.ok(waits.length >= 2);
});

test('HRRR grid: the lower 48 is on it, the corners of the box and Europe are not', () => {
  for (const [la, lo] of [[47.6, -122.3], [25.8, -80.2], [32.7, -117.2], [44.8, -68.8], [48.9, -95], [37.55, -77.46]]) assert.ok(inHrrr(la, lo), `${la},${lo}`);
  for (const [la, lo] of [[50, -126], [23.5, -126], [23.5, -65.5], [50, -65.5], [51.5, -0.1]]) assert.ok(!inHrrr(la, lo), `${la},${lo}`);
  const g = gridFor(37.55, -77.46, 'country');
  const hrrr = MAP_MODELS.find((x) => x.id === 'gfs_hrrr');
  assert.ok(pointsFor(hrrr, g).length > 0.8 * g.rows * g.cols);
  assert.equal(pointsFor(MAP_MODELS[0], g).length, g.rows * g.cols);
  assert.equal(pointsFor(hrrr, gridFor(51.5, -0.1, 'region')).length, 0);
});

test('point budget gives up with a retry time instead of holding a request for a minute', async () => {
  let t = 0;
  const b = new PointBudget({ perMinute: 600, now: () => t, sleep: async (ms) => { t += ms; } });
  await b.take(275);
  t = 10_000;
  await b.take(275);
  await assert.rejects(b.take(275, { maxWaitMs: 6000 }), (err) => err instanceof BusyError && err.statusCode === 503 && err.retryAfter === 51);
  // A short wait still just waits.
  t = 55_000;
  await b.take(275, { maxWaitMs: 6000 });
  assert.ok(t >= 60_000 && t < 61_000);
});

test('smooth sampling stays between the nearest points (no rings around a shower) and is smooth at the edge', () => {
  const rows = 5;
  const cols = 5;
  const v = new Array(rows * cols).fill(0);
  v[2 * cols + 2] = 10; // one shower in the middle
  for (let r = 0; r <= 4; r += 0.25) {
    for (let c = 0; c <= 4; c += 0.25) {
      const x = sampleSmooth(v, rows, cols, r, c);
      assert.ok(x >= 0 && x <= 10, `${r},${c}: ${x}`);
    }
  }
  assert.equal(sampleSmooth(v, rows, cols, 2, 2), 10);
  // A smooth ramp is reproduced right up to the border.
  const ramp = Array.from({ length: rows * cols }, (_, k) => k % cols);
  assert.ok(Math.abs(sampleSmooth(ramp, rows, cols, 0.2, 0.5) - 0.5) < 0.1);
  assert.ok(Math.abs(sampleSmooth(ramp, rows, cols, 4, 3.5) - 3.5) < 0.1);
});

test('the server keeps sharing a model map while it fetches a newer one', async () => {
  const cache = new TtlCache();
  let n = 0;
  const fn = async () => ++n;
  assert.equal(await cache.wrapStale('k', 1000, 60_000, fn), 1);
  const hit = cache.map.get('k');
  hit.fresh = Date.now() - 1; // an hour later
  assert.equal(await cache.wrapStale('k', 1000, 60_000, fn), 1); // the old copy, at once
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await cache.wrapStale('k', 1000, 60_000, fn), 2); // the refreshed one
});
