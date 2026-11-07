import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNational, normalizeOutlook, alertColor, alertRank, getNexradSites } from '../src/providers/severe.js';
import { radarProducts, radarFrames, siteProductCodes, siteScans, worldRadarFrames, withWorldRadar } from '../src/providers/radar.js';
import { mockFetch, testApp } from './helpers.js';

const poly = [[[-97, 35], [-96, 35], [-96, 36], [-97, 35]]];
export const fakeNational = { features: [
  { properties: { id: 'a', event: 'Wind Advisory', severity: 'Moderate', areaDesc: 'Somewhere' }, geometry: { type: 'Polygon', coordinates: poly } },
  { properties: { id: 'b', event: 'Tornado Warning', severity: 'Extreme', areaDesc: 'Oklahoma County, OK' }, geometry: { type: 'Polygon', coordinates: poly } },
  { properties: { id: 'c', event: 'Winter Storm Warning', severity: 'Severe' }, geometry: null },
  { properties: { id: 'd', event: 'Tornado Watch', severity: 'Severe' }, geometry: { type: 'Polygon', coordinates: poly } },
] };
export const fakeOutlook = { features: [
  { properties: { LABEL: 'TSTM', fill: '#C1E9C1', stroke: '#55BB55' }, geometry: { type: 'Polygon', coordinates: poly } },
  { properties: { LABEL: 'SLGT', fill: 'url(javascript:x)', stroke: '#DDAA00' }, geometry: { type: 'MultiPolygon', coordinates: [poly] } },
  { properties: { LABEL: 'NONE' }, geometry: null },
] };

test('national alerts: polygons only, colored, warnings drawn last and counted', () => {
  const r = normalizeNational(fakeNational);
  assert.equal(r.features.length, 3);
  assert.equal(r.features.at(-1).properties.event, 'Tornado Warning');
  assert.equal(r.features.at(-1).properties.color, '#ff0000');
  assert.deepEqual(r.counts, { warning: 1, watch: 1, advisory: 1 });
  assert.equal(alertColor('Severe Thunderstorm Warning'), '#ffa500');
  assert.equal(alertColor('Something odd'), '#c0c0c0');
  assert.ok(alertRank('Tornado Warning') > alertRank('Flood Warning'));
});

test('SPC outlook keeps the categories and only safe colors', () => {
  const o = normalizeOutlook(fakeOutlook, 1);
  assert.equal(o.features.length, 2);
  assert.equal(o.features[1].properties.name, '2 · Slight');
  assert.equal(o.features[1].properties.fill, '#c1e9c1');
  assert.equal(o.features[1].properties.stroke, '#DDAA00');
});

test('radar products: loops, single site, rain totals and future radar', () => {
  const p = radarProducts(Date.parse('2026-11-02T18:07:00Z'));
  assert.deepEqual(p.map((x) => x.id), ['composite', 'site', 'velocity', 'srv', 'cc', 'zdr', 'kdp', 'echotops', 'rain1h', 'rain24h', 'future']);
  const by = Object.fromEntries(p.map((x) => [x.id, x]));
  assert.equal(by.composite.frames.length, 11);
  assert.match(by.site.template, /ridge::\{site\}-N0B-0/);
  assert.match(by.velocity.template, /ridge::\{site\}-N0U-0/);
  assert.match(by.srv.template, /ridge::\{site\}-N0S-0/);
  assert.match(by.cc.template, /ridge::\{site\}-N0C-0/);
  assert.match(by.zdr.template, /ridge::\{site\}-N0X-0/);
  assert.match(by.kdp.template, /ridge::\{site\}-N0K-0/);
  for (const id of ['site', 'velocity', 'srv', 'cc', 'zdr', 'kdp']) assert.equal(by[id].site, true);
  assert.match(by.echotops.frames.at(-1).url, /nexrad-eet-900913\//);
  assert.match(by.future.frames[2].url, /hrrr::REFD-F0120-0/);
  assert.equal(by.future.frames.length, 13);
  assert.equal(radarFrames().products.length, 11);
});

test('NEXRAD sites merge with which radars reported recently', async () => {
  const now = Date.parse('2026-11-02T18:00:00Z');
  const fetchImpl = mockFetch({
    'NEXRAD.geojson': () => Response.json({ features: [
      { properties: { sid: 'AKQ', sname: 'Wakefield' }, geometry: { coordinates: [-77.0, 36.98] } },
      { properties: { sid: 'LWX', sname: 'Sterling' }, geometry: { coordinates: [-77.48, 38.98] } },
      { properties: { sid: '<b>', sname: 'x' }, geometry: { coordinates: [0, 0] } },
    ] }),
    'ridge_current.py': () => Response.json({ meta: [{ site: 'AKQ', valid: '2026-11-02T17:55:00Z' }, { site: 'LWX', valid: '2026-10-01T00:00:00Z' }] }),
  });
  const s = await getNexradSites(fetchImpl, now);
  assert.equal(s.length, 2);
  assert.equal(s[0].online, true);
  assert.equal(s[1].online, false);
});

test('API: national alerts, outlook and sites', async () => {
  const fetchImpl = mockFetch({
    'alerts/active?status=actual': () => Response.json(fakeNational),
    'day2otlk_cat': () => Response.json(fakeOutlook),
    'NEXRAD.geojson': () => Response.json({ features: [] }),
    'ridge_current.py': () => new Response('nope', { status: 500 }),
  });
  const { app } = await testApp({ fetchImpl });
  const a = (await app.inject('/api/alerts/national')).json();
  assert.equal(a.features.length, 3);
  assert.equal(fetchImpl.calls.find((c) => c.url.includes('alerts/active?status')).opts.headers['User-Agent'].length > 0, true);
  assert.equal((await app.inject('/api/outlook?day=2')).json().day, 2);
  assert.equal((await app.inject('/api/outlook?day=5')).statusCode, 400);
  assert.deepEqual((await app.inject('/api/radar/sites')).json(), { sites: [] });
  await app.close();
});

test('single-site radar: picks the products a radar sends and loops its real scans', async () => {
  const now = Date.parse('2026-11-05T00:40:00Z');
  const fetchImpl = mockFetch({
    'operation=products': () => Response.json({ products: [{ id: 'N0B' }, { id: 'N0Q' }, { id: 'N0U' }, { id: 'N0C' }, { id: 'N0X' }] }),
    'operation=list': () => Response.json({ scans: [
      { ts: '2026-11-05T00:31:00Z' }, { ts: '2026-11-05T00:22:00Z' }, { ts: '2026-11-05T00:31:00Z' }, { ts: 'bad' }, { ts: '2026-11-05T00:36:00Z' },
    ] }),
  });
  const codes = await siteProductCodes('EAX', fetchImpl, now);
  assert.deepEqual(codes, { site: 'N0B', velocity: 'N0U', cc: 'N0C', zdr: 'N0X' });
  assert.match(fetchImpl.calls[0].url, /radar\.py\?operation=products&radar=EAX&start=2026-11-04T22:40Z/);
  const frames = await siteScans('EAX', 'N0X', fetchImpl, now);
  assert.deepEqual(frames.map((f) => f.time), ['2026-11-05T00:22:00.000Z', '2026-11-05T00:31:00.000Z', '2026-11-05T00:36:00.000Z']);
  assert.match(frames[2].url, /ridge::EAX-N0X-202611050036\/\{z\}/);
  assert.match(fetchImpl.calls[1].url, /product=N0X&start=2026-11-04T23:40Z&end=2026-11-05T00:45Z/);
});

test('API: radar scans say when a radar is not sending a product', async () => {
  const fetchImpl = mockFetch({
    'operation=products': () => Response.json({ products: [{ id: 'N0B' }, { id: 'N0U' }] }),
    'operation=list': () => Response.json({ scans: [{ ts: '2026-11-05T00:31:00Z' }, { ts: '2026-11-05T00:36:00Z' }] }),
  });
  const { app } = await testApp({ fetchImpl });
  const zdr = (await app.inject('/api/radar/scans?site=eax&product=zdr')).json();
  assert.deepEqual(zdr, { site: 'EAX', product: 'zdr', code: null, available: ['site', 'velocity'], frames: [] });
  const vel = (await app.inject('/api/radar/scans?site=EAX&product=velocity')).json();
  assert.equal(vel.code, 'N0U');
  assert.equal(vel.frames.length, 2);
  assert.equal((await app.inject('/api/radar/scans?site=EAX&product=nope')).statusCode, 400);
  assert.equal((await app.inject('/api/radar/scans?site=../x&product=zdr')).statusCode, 400);
  await app.close();
});

test('Canada and Mexico radar from RainViewer pairs with the US loop', async () => {
  const fetchImpl = mockFetch({
    'weather-maps.json': () => Response.json({
      host: 'https://tilecache.rainviewer.com',
      radar: { past: [
        { time: Date.parse('2026-11-02T18:00:00Z') / 1000, path: '/v2/radar/abc123' },
        { time: Date.parse('2026-11-02T17:50:00Z') / 1000, path: '/v2/radar/def456' },
        { time: Date.parse('2026-11-02T17:40:00Z') / 1000, path: '../evil' },
      ] },
    }),
  });
  const fill = await worldRadarFrames(fetchImpl);
  assert.equal(fill.length, 2);
  assert.equal(fill[0].url, 'https://tilecache.rainviewer.com/v2/radar/def456/256/{z}/{x}/{y}/2/1_1.png');
  const r = withWorldRadar(radarFrames(Date.parse('2026-11-02T18:07:00Z')), fill);
  assert.match(r.frames.at(-1).fill, /abc123/);
  assert.match(r.frames[0].fill, /def456/); // 17:15, before any fill frame: oldest one
  const composite = r.products.find((p) => p.id === 'composite');
  assert.match(composite.frames.at(-1).fill, /abc123/);
  assert.equal(r.products.find((p) => p.id === 'echotops').frames[0].fill, undefined);
  assert.equal(r.fill.maxNativeZoom, 7);
  assert.match(r.fill.attribution, /RainViewer/);
  assert.deepEqual(r.view, { south: 5, west: -172, north: 72, east: -50 });
  // Without fill frames nothing changes.
  const plain = radarFrames();
  assert.equal(withWorldRadar(plain, []), plain);
});
