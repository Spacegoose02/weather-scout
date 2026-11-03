import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMiles, bearing, compass, nearby, strikeStyle, thunderCount, boxAround, inBox, WINDOW_MIN } from '../../shared/lightning.js';
import { decodeBlitz, parseBlitz, BlitzFeed } from '../src/providers/blitzortung.js';
import { fileStart, hourPrefix, parseListing, GlmFeed } from '../src/providers/glm.js';
import { LightningService } from '../src/lightning.js';
import { lightningPayload } from '../src/push.js';
import { testApp } from './helpers.js';

const home = { lat: 37.54, lon: -77.44 };
const MIN = 60_000;
// A strike `miles` due north of home.
const north = (miles, t, src = 'glm') => ({ t, lat: home.lat + miles / 69.05, lon: home.lon, src });

// The same LZW packing the live map uses, to build test messages.
function encodeBlitz(s) {
  const dict = new Map();
  const out = [];
  let w = s[0];
  let code = 256;
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (dict.has(w + c) || (w + c).length === 1) { w += c; continue; }
    out.push(w.length > 1 ? String.fromCharCode(dict.get(w)) : w);
    dict.set(w + c, code++);
    w = c;
  }
  out.push(w.length > 1 ? String.fromCharCode(dict.get(w)) : w);
  return out.join('');
}

test('distance, direction and the kid count-to-30 rule', () => {
  assert.ok(Math.abs(distanceMiles(home, north(10, 0)) - 10) < 0.1);
  assert.equal(compass(bearing(home, north(10, 0))), 'N');
  assert.equal(compass(bearing(home, { lat: home.lat, lon: home.lon - 0.5 })), 'W');
  assert.equal(thunderCount(15).inside, true);
  assert.equal(thunderCount(15).miles, 3);
  assert.equal(thunderCount(40).inside, false);
  assert.match(thunderCount(10).say, /Go inside now/);
});

test('strikes fade with age and disappear after 30 minutes', () => {
  assert.equal(strikeStyle(0).color, '#ffffff');
  assert.ok(strikeStyle(0).opacity > strikeStyle(25).opacity);
  assert.ok(strikeStyle(0).radius > strikeStyle(25).radius);
  assert.equal(strikeStyle(WINDOW_MIN + 1), null);
});

test('nearby summary and the 30-30 all-clear clock', () => {
  const now = Date.UTC(2026, 10, 3, 1, 0);
  const strikes = [north(3, now - 2 * MIN), north(8, now - 20 * MIN), north(30, now - MIN), north(2, now - 40 * MIN)];
  const n = nearby(strikes, home, { miles: 10, now });
  assert.equal(n.count, 2);
  assert.equal(n.last10, 1);
  assert.equal(n.nearest.dir, 'N');
  assert.equal(Math.round(n.nearest.miles), 3);
  assert.equal(n.newest.ageMin, 2);
  assert.equal(n.minutesToAllClear, 28);
  assert.equal(nearby([], home, { now }).count, 0);
});

test('boxes, including across the date line', () => {
  const b = boxAround(home, 10);
  assert.ok(inBox(north(5, 0), b));
  assert.ok(!inBox(north(20, 0), b));
  assert.ok(inBox({ lat: 0, lon: 179.5 }, { south: -1, north: 1, west: 179, east: -179 }));
  assert.ok(inBox({ lat: 0, lon: -179.5 }, { south: -1, north: 1, west: 179, east: -179 }));
});

test('Blitzortung messages are unpacked into strikes', () => {
  const json = JSON.stringify({ time: 1793667600123456789, lat: 37.6012345, lon: -77.4, alt: 0, pol: 0, mds: 9000, mcg: 200, status: 1, region: 3, sig: [{ sta: 1 }, { sta: 2 }] });
  const packed = encodeBlitz(json);
  assert.ok(packed.length < json.length);
  assert.equal(decodeBlitz(packed), json);
  const s = parseBlitz(packed);
  assert.deepEqual({ ...s, t: Math.floor(s.t / 1000) }, { t: 1793667600, lat: 37.6012, lon: -77.4, src: 'bo' });
  assert.equal(parseBlitz('not json'), null);
  assert.equal(parseBlitz(JSON.stringify({ lat: 200, lon: 0, time: 1 })), null);
});

test('Blitzortung feed connects, batches strikes and moves on when a server drops', () => {
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(m) { this.sent.push(m); }
    close() { this.closed = true; }
  }
  const timers = { setTimeout: (fn) => { timers.pending.push(fn); return timers.pending.length; }, clearTimeout: () => {}, pending: [] };
  const got = [];
  const feed = new BlitzFeed({ WebSocketImpl: FakeWS, timers, onStrikes: (b) => got.push(...b), log: {} });
  feed.start();
  assert.equal(sockets.length, 1);
  sockets[0].onopen();
  assert.deepEqual(sockets[0].sent, ['{"a":111}']);
  assert.equal(feed.connected, true);
  sockets[0].onmessage({ data: encodeBlitz(JSON.stringify({ time: 1e18, lat: 1, lon: 2 })) });
  sockets[0].onmessage({ data: JSON.stringify({ time: 1e18, lat: 3, lon: 4 }) });
  timers.pending.shift()();
  assert.equal(got.length, 2);
  sockets[0].onclose();
  assert.equal(feed.connected, false);
  timers.pending.shift()();
  assert.equal(sockets.length, 2);
  assert.notEqual(sockets[1].url, sockets[0].url);
  feed.stop();
  assert.equal(sockets[1].closed, true);
});

test('GLM file names and listings', () => {
  const key = 'GLM-L2-LCFA/2026/307/01/OR_GLM-L2-LCFA_G19_s20263070100200_e20263070100400_c20263070100420.nc';
  assert.equal(new Date(fileStart(key)).toISOString(), '2026-11-03T01:00:20.000Z');
  assert.equal(hourPrefix(Date.UTC(2026, 10, 3, 1, 5)), 'GLM-L2-LCFA/2026/307/01/');
  assert.equal(hourPrefix(Date.UTC(2026, 0, 1, 0, 0)), 'GLM-L2-LCFA/2026/001/00/');
  assert.deepEqual(parseListing(`<ListBucketResult><Contents><Key>${key}</Key></Contents></ListBucketResult>`), [key]);
});

test('GLM feed fetches only new files inside the backfill window', async () => {
  const now = Date.UTC(2026, 10, 3, 1, 3, 0);
  const name = (sec) => {
    const d = new Date(Date.UTC(2026, 10, 3, 1, 0, 0) + sec * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `GLM-L2-LCFA/2026/307/01/OR_GLM-L2-LCFA_G19_s2026307${hh}${mm}${ss}0_e0_c0.nc`;
  };
  let keys = [name(0), name(60), name(120), name(140)];
  const fetched = [];
  const fetchImpl = async (url) => {
    if (url.includes('list-type=2')) return new Response(`<x>${keys.map((k) => `<Key>${k}</Key>`).join('')}</x>`);
    fetched.push(url.split('/').pop());
    return new Response(new Uint8Array([1, 2, 3]));
  };
  const got = [];
  const feed = new GlmFeed({ backfillMin: 2, fetchImpl, log: {}, onStrikes: (s) => got.push(...s), parse: (buf, k) => [{ t: fileStart(k), lat: 1, lon: 1, src: 'glm' }] });
  let r = await feed.poll(now);
  assert.equal(r.files, 3, 'the file from 3 minutes ago is outside the 2 minute backfill');
  assert.equal(got.length, 3);
  r = await feed.poll(now + 20_000);
  assert.equal(r.files, 0, 'nothing new');
  keys = [...keys, name(160)];
  r = await feed.poll(now + 40_000);
  assert.equal(r.files, 1);
  assert.ok(feed.lastOk);

  const broken = new GlmFeed({ fetchImpl: async () => new Response('no', { status: 503 }), log: {} });
  r = await broken.poll(now);
  assert.match(r.error, /503/);
  assert.equal(broken.lastOk, null);
});

test('lightning service keeps 30 minutes of strikes and answers by area', () => {
  let now = Date.UTC(2026, 10, 3, 1, 0);
  const svc = new LightningService({ lightning: { glm: true } }, { now: () => now, fetchImpl: async () => new Response('', { status: 404 }), log: {} });
  svc.add([north(3, now - MIN), north(50, now - 2 * MIN), north(4, now - 45 * MIN), { t: now - MIN, lat: 0, lon: 179.9, src: 'bo' }]);
  assert.equal(svc.strikes.length, 3, 'already too old on arrival');
  assert.equal(svc.query(boxAround(home, 10)).length, 1);
  assert.equal(svc.query({ south: -1, north: 1, west: 179, east: -179 }).length, 1);
  assert.equal(svc.near(home, 10).count, 1);
  now += 30 * MIN;
  svc.prune();
  assert.equal(svc.strikes.length, 0);
});

test('lightning API, alert push and the all-clear', async () => {
  const sent = [];
  const { app } = await testApp({ pushSend: async (s, p) => sent.push(JSON.parse(p)) });
  const cfg = (await app.inject({ url: '/api/config' })).json();
  assert.deepEqual(cfg.lightning, { enabled: true, sources: ['glm'] });

  const now = Date.now();
  app.lightning.add([north(4, now - MIN), north(120, now - MIN, 'bo')]);
  app.lightning.glm.lastOk = now;

  const map = (await app.inject({ url: '/api/lightning?south=36&west=-79&north=39&east=-76' })).json();
  assert.equal(map.strikes.length, 1);
  assert.equal(map.strikes[0][3], 'glm');
  assert.equal(map.windowMin, 30);
  assert.equal(map.sources[0].id, 'glm');
  const newer = (await app.inject({ url: `/api/lightning?south=36&west=-79&north=39&east=-76&since=${now}` })).json();
  assert.equal(newer.strikes.length, 0);
  const world = (await app.inject({ url: '/api/lightning?south=-85&west=-200&north=85&east=200' })).json();
  assert.equal(world.strikes.length, 2);

  const near = (await app.inject({ url: `/api/lightning/near?lat=${home.lat}&lon=${home.lon}&miles=10` })).json();
  assert.equal(near.count, 1);
  assert.equal(near.nearest.dir, 'N');

  // Lightning-only subscription (no NWS levels) is allowed.
  const place = { name: 'Home', ...home };
  const s = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }, place, levels: [], lightningMiles: 10 } });
  assert.equal(s.statusCode, 201);
  assert.equal(s.json().lightningMiles, 10);
  assert.equal(app.push.lightningCount(), 1);
  assert.equal(app.lightning.active(), true);

  let r = await app.push.checkLightning(app.lightning, now);
  assert.equal(r.sent, 1);
  assert.match(sent[0].title, /Lightning 4 mi away/);
  assert.match(sent[0].body, /north of Home/);
  r = await app.push.checkLightning(app.lightning, now + MIN);
  assert.equal(r.sent, 0, 'one alert per storm');

  // Stale data never turns into an all-clear.
  app.lightning.glm.lastOk = now - 10 * MIN;
  r = await app.push.checkLightning(app.lightning, now + 40 * MIN);
  assert.equal(r.skipped, true);

  app.lightning.glm.lastOk = Date.now();
  app.lightning.strikes = [];
  r = await app.push.checkLightning(app.lightning, now + 31 * MIN);
  assert.equal(r.sent, 1);
  assert.match(sent[1].title, /all clear/);
  r = await app.push.checkLightning(app.lightning, now + 32 * MIN);
  assert.equal(r.sent, 0);

  const off = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }, place, levels: [], lightningMiles: 0 } });
  assert.equal(off.statusCode, 400, 'nothing picked');
  await app.close();
});

test('lightning push wording', () => {
  const p = lightningPayload({ nearest: { miles: 0.4, dir: 'SW', ageMin: 0 } }, 'Home');
  assert.equal(p.title, '⚡ Lightning overhead');
  assert.match(p.body, /less than 1 mile southwest of Home just now/);
  assert.equal(p.requireInteraction, true);
});

test('lightning can be turned off', async () => {
  const { app } = await testApp({ env: { LIGHTNING_GLM: 'false' } });
  assert.equal((await app.inject({ url: '/api/lightning?south=1&west=1&north=2&east=2' })).statusCode, 404);
  assert.equal((await app.inject({ url: '/api/config' })).json().lightning.enabled, false);
  await app.close();
});
