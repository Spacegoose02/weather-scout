import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCells, cellThreat, cellsNear, movePoint, precipType, ptypeGrid, ptypeCounts, distanceMiles } from '../../shared/stormcells.js';
import { evaluateRules, cleanRules } from '../../shared/thresholds.js';
import { encodePtype, ptypeUrl, snapBox } from '../src/stormcells.js';
import { testApp, mockFetch } from './helpers.js';

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const NOW = Date.parse('2026-11-04T18:00:00Z');
const home = { lat: 37.54, lon: -77.44 };

// Two radars see the same storm west of Richmond moving east (from 270°) at 26 kt (30 mph).
const cellsFixture = { type: 'FeatureCollection', features: [
  { geometry: { type: 'Point', coordinates: [-77.9, 37.55] }, properties: { nexrad: 'AKQ', storm_id: 'B4', valid: '2026-11-04T17:56:00Z', max_dbz: 62, top: 41, posh: 60, poh: 90, max_size: 1.25, tvs: 'NONE', meso: 'NONE', drct: 270, sknt: 26 } },
  { geometry: { type: 'Point', coordinates: [-77.91, 37.56] }, properties: { nexrad: 'LWX', storm_id: 'K2', valid: '2026-11-04T17:55:00Z', max_dbz: 58, tvs: 'NONE', meso: 'NONE', drct: 270, sknt: 26 } },
  { geometry: { type: 'Point', coordinates: [-77.2, 37.3] }, properties: { nexrad: 'AKQ', storm_id: 'C1', valid: '2026-11-04 17:57', max_dbz: 48, tvs: 'NONE', meso: '2', drct: 200, sknt: 20 } },
  { geometry: { type: 'Point', coordinates: [-78, 36] }, properties: { nexrad: 'RAX', storm_id: 'Z0', valid: '2026-11-04T16:00:00Z', max_dbz: 60, drct: 0, sknt: 10 } },
  { geometry: { type: 'Point', coordinates: [-76, 37] }, properties: { nexrad: 'AKQ', storm_id: 'W1', valid: '2026-11-04T17:58:00Z', max_dbz: 30, drct: 0, sknt: 10 } },
] };

test('storm cells: stale and weak dropped, duplicates merged, tracks projected', () => {
  const cells = parseCells(cellsFixture, { now: NOW });
  assert.deepEqual(cells.map((c) => c.id), ['AKQ-C1', 'AKQ-B4'], 'rotation ranks above hail; the LWX copy of B4 is merged');
  const hail = cells[1];
  assert.equal(hail.level, 'hail');
  assert.equal(hail.heading, 90, 'moving east, away from where it came from');
  assert.equal(hail.mph, 30);
  assert.equal(hail.track.length, 4);
  // 60 minutes at 30 mph is about 30 miles east.
  assert.ok(Math.abs(distanceMiles(hail, hail.track[3]) - 30) < 0.5);
  assert.equal(cells[0].level, 'rotation');
  assert.ok(Math.abs(movePoint({ lat: 0, lon: 0 }, 0, 69.1).lat - 1) < 0.01);
});

test('which storms reach you, and when', () => {
  const [rot, hail] = parseCells(cellsFixture, { now: NOW });
  const t = cellThreat(hail, home);
  assert.ok(t, 'the hail storm is on course');
  assert.ok(t.eta > 45 && t.eta < 56, `about 50 minutes out (25 mi at 30 mph), got ${t.eta}`);
  assert.equal(cellThreat(rot, home), null, 'moving north-northeast, away and to the side');
  const near = cellsNear([rot, hail], home);
  assert.equal(near[0].id, 'AKQ-B4', 'storms coming this way first');
  assert.equal(near[0].dir, 'west');
  assert.equal(near[0].moving, 'east');
  assert.equal(cellThreat({ ...hail, lat: 37.55, lon: -77.45 }, home).overhead, true);
});

test('storm-heading-your-way alert', () => {
  const [, hail] = parseCells(cellsFixture, { now: NOW });
  const cell = cellsNear([hail], home)[0];
  const rules = cleanRules({ cell: true, quiet: false });
  assert.equal(rules.cell, true);
  const fc = { utcOffsetSeconds: -18000, hourly: [], current: {} };
  const [ev] = evaluateRules(fc, rules, { now: NOW, cell });
  assert.equal(ev.rule, 'cell');
  assert.match(ev.title, /Storm with hail heading your way, in about 50 min/);
  assert.match(ev.body, /moving east at 30 mph/);
  assert.deepEqual(evaluateRules(fc, rules, { now: NOW, cell: { ...cell, level: 'storm' } }), [], 'a plain shower stays quiet');
});

test('precipitation type from the weather code', () => {
  assert.equal(precipType({ code: 61, rain: 0.5 }), 'rain');
  assert.equal(precipType({ code: 73, snow: 1 }), 'snow');
  assert.equal(precipType({ code: 71, snow: 0.2, rain: 0.1 }), 'mix');
  assert.equal(precipType({ code: 67, rain: 0.2 }), 'ice');
  assert.equal(precipType({ code: 3 }), null);
  const g = ptypeGrid({ south: 36, north: 40, west: -80, east: -74 });
  assert.ok(g.rows * g.cols <= 192);
  assert.ok(g.cols > g.rows, 'wider than tall');
  assert.equal(g.lats[0] > g.lats.at(-1), true, 'north to south');
  assert.deepEqual(snapBox({ south: 36.2, north: 39.7, west: -79.9, east: -74.1 }), { south: 36, north: 40, west: -80, east: -74 });
  const raw = Array.from({ length: g.rows * g.cols }, (_, i) => ({ current: { time: '2026-11-04T18:00', weather_code: i === 0 ? 73 : i === 1 ? 61 : 0, snowfall: i === 0 ? 1 : 0, rain: i === 1 ? 1 : 0 } }));
  const enc = encodePtype(raw, g);
  assert.equal(enc.cells.slice(0, 3), 'sr.');
  assert.equal(enc.time, '2026-11-04T18:00Z');
  assert.deepEqual(ptypeCounts(enc.cells), { rain: 1, snow: 1, mix: 0, ice: 0 });
  assert.match(ptypeUrl(g), /current=weather_code/);
});

test('storm cell and rain/snow routes', async () => {
  let ptypeCalls = 0;
  const fetchImpl = mockFetch({
    'nexrad_attr.geojson': () => json({ ...cellsFixture, features: cellsFixture.features.map((f) => ({ ...f, properties: { ...f.properties, valid: new Date(Date.now() - 60_000).toISOString() } })) }),
    'current=weather_code': (url) => {
      ptypeCalls++;
      const n = new URL(url).searchParams.get('latitude').split(',').length;
      return json(Array.from({ length: n }, () => ({ current: { time: '2026-11-04T18:00', weather_code: 75, snowfall: 2 } })));
    },
  });
  const { app } = await testApp({ fetchImpl });
  const box = (await app.inject({ url: '/api/cells?south=36&west=-79&north=38&east=-76' })).json();
  assert.equal(box.total, 3, 'fresh, strong enough and merged');
  const near = (await app.inject({ url: '/api/cells/near?lat=37.54&lon=-77.44' })).json();
  assert.equal(near.cells[0].id, 'AKQ-B4');
  assert.ok(near.cells[0].threat.eta > 0);
  const p = (await app.inject({ url: '/api/radar/ptype?south=36.2&west=-79.9&north=39.7&east=-74.1' })).json();
  assert.equal(p.rows * p.cols, p.cells.length);
  assert.equal(p.counts.snow, p.cells.length);
  await app.inject({ url: '/api/radar/ptype?south=36.3&west=-79.7&north=39.8&east=-74.2' });
  assert.equal(ptypeCalls, 1, 'nearby views share one cached grid');
  await app.close();
});
