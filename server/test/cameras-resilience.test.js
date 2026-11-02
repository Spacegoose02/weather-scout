import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TtlCache } from '../src/cache.js';
import { CameraService, esriToGeoJson } from '../src/providers/cameras/index.js';

const md = {
  id: 'md', name: 'Maryland CHART', type: 'arcgis',
  url: 'https://geodata.md.gov/imap/rest/services/Transportation/MD_TrafficCameras/MapServer/0',
  fields: { id: 'feedID', name: 'location', embed: 'url' },
};
const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-76.6, 39.3] }, properties: { feedID: 'a1', location: 'I-95 at Exit 49', url: 'https://chart.maryland.gov/video/a1' } }] };
const esri = { features: [{ attributes: { feedID: 'b2', location: 'I-695 at Exit 1', url: 'https://chart.maryland.gov/video/b2' }, geometry: { x: -76.7, y: 39.2 } }] };

function service(handler) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-cam-'));
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return handler(String(url), calls.length);
  };
  const cfg = { dataDir, env: { CAMERA_FEEDS_JSON: JSON.stringify({ feeds: [md] }) }, nwsUserAgent: 'WeatherScout (me@example.com)' };
  const svc = new CameraService(cfg, new TtlCache(), fetchImpl, { retry: { baseDelayMs: 1 } });
  return { svc, calls, cfg, dataDir };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });

test('retries a 503 and sends a User-Agent', async () => {
  const { svc, calls } = service((u, n) => (n === 1 ? json({}, 503) : json(geo)));
  const { cameras, feeds } = await svc.all();
  assert.equal(cameras.length, 1);
  assert.equal(feeds[0].ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].opts.headers['user-agent'], /WeatherScout/);
});

test('falls back to Esri JSON when f=geojson keeps failing', async () => {
  const { svc } = service((u) => (u.includes('f=geojson') ? json({}, 503) : json(esri)));
  const { cameras, feeds } = await svc.all();
  assert.equal(feeds[0].ok, true);
  assert.equal(cameras[0].id, 'md:b2');
  assert.equal(cameras[0].lat, 39.2);
});

test('keeps the last good list through an outage, also after a restart', async () => {
  let down = false;
  const { svc, cfg, dataDir } = service(() => (down ? json({}, 503) : json(geo)));
  assert.equal((await svc.all()).cameras.length, 1);
  assert.ok(fs.existsSync(path.join(dataDir, 'camera-cache', 'md.json')));

  down = true;
  svc.cache.map.clear();
  const out = await svc.all();
  assert.equal(out.cameras.length, 1, 'still shows Maryland');
  assert.equal(out.feeds[0].ok, false);
  assert.equal(out.feeds[0].stale, true);
  assert.match(out.feeds[0].error, /503/);

  // A fresh process (empty memory) reads the saved list from the data volume.
  const fresh = new CameraService(cfg, new TtlCache(), async () => json({}, 503), { retry: { baseDelayMs: 1 } });
  assert.equal((await fresh.all()).cameras.length, 1);
});

test('backs off after a failure instead of asking again on every map move', async () => {
  const { svc, calls } = service(() => json({}, 503));
  const first = await svc.all();
  assert.equal(first.feeds[0].ok, false);
  assert.equal(first.cameras.length, 0);
  const n = calls.length;
  svc.cache.map.clear();
  await svc.all();
  assert.equal(calls.length, n, 'no new requests while backing off');
});

test('esriToGeoJson skips features without a point', () => {
  assert.equal(esriToGeoJson({ features: [{ attributes: {}, geometry: null }, ...esri.features] }).length, 1);
});
