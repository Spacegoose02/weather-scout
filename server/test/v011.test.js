import test from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch, cookieFrom } from './helpers.js';
import { droughtAt, inPolygon, mapDate, parseEnsoDiscussion, parseNinoWeekly, ensoPhase, winterHint } from '../src/climate.js';
import { validEntry, cleanNote, logSummary } from '../src/classroom.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const square = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const USDM = {
  type: 'FeatureCollection',
  features: [
    { properties: { DM: 0, ValidStart: '2026-11-03' }, geometry: square(-100, 40, -90, 50) },
    { properties: { DM: 1 }, geometry: { type: 'MultiPolygon', coordinates: [[square(-96, 43, -92, 47).coordinates[0], square(-94.5, 44.5, -93.8, 45.2).coordinates[0]]] } },
    { properties: { DM: 2 }, geometry: square(-110, 30, -105, 35) },
  ],
};
const DISC = `<html><body><p>ENSO DIAGNOSTIC DISCUSSION issued by CLIMATE PREDICTION CENTER/NCEP/NWS 13 November 2026</p>
<p><strong>ENSO Alert System Status:</strong> La Ni&ntilde;a Advisory</p>
<p>Synopsis: La Niña is favored to continue into the Northern Hemisphere winter, with a transition to ENSO-neutral most likely in January-March 2027 (55% chance). More text.</p></body></html>`;
const week = (d, n34) => ` ${d}     22.1 0.3     26.0-0.2     26.4${n34 >= 0 ? ' ' : ''}${n34.toFixed(1)}     28.5 0.1`;
const WEEKLY = ['Weekly SST data', ' Week          Nino1+2      Nino3        Nino34        Nino4', week('15OCT2026', -0.4), week('22OCT2026', -0.6), week('29OCT2026', -0.7), week('05NOV2026', -0.8)].join('\n');

test('drought: the worst category covering a place, holes respected', () => {
  assert.equal(droughtAt(USDM, { lat: 46, lon: -95 }).code, 'D1');
  assert.equal(droughtAt(USDM, { lat: 44.8, lon: -94 }).code, 'D0'); // in the D1 hole
  assert.equal(droughtAt(USDM, { lat: 41, lon: -99 }).code, 'D0');
  assert.equal(droughtAt(USDM, { lat: 32, lon: -107 }).code, 'D2');
  assert.equal(droughtAt(USDM, { lat: 35, lon: -80 }).code, 'None');
  assert.equal(inPolygon({ lat: 1, lon: 1 }, null), false);
  assert.equal(mapDate(USDM), '2026-11-03');
  assert.equal(mapDate({ features: [{ properties: { MapDate: '20261103' } }] }), '2026-11-03');
});

test('ENSO: discussion and weekly Niño 3.4 parse, and phases read right', () => {
  const d = parseEnsoDiscussion(DISC);
  assert.equal(d.status, 'La Niña Advisory');
  assert.match(d.synopsis, /^La Niña is favored/);
  assert.equal(d.issued, '13 November 2026');
  const w = parseNinoWeekly(WEEKLY);
  assert.equal(w.length, 4);
  assert.deepEqual(w.at(-1), { week: '2026-11-05', nino34: -0.8 });
  assert.equal(ensoPhase(-0.8).id, 'lanina');
  assert.equal(ensoPhase(1.7).label, 'Strong El Niño conditions');
  assert.equal(ensoPhase(0.2).id, 'neutral');
  assert.equal(ensoPhase(null), null);
  assert.match(winterHint('lanina', { lat: 45, lon: -93 }), /colder and snowier/);
  assert.match(winterHint('lanina', { lat: 30, lon: -95 }), /warmer and drier/);
  assert.match(winterHint('elnino', { lat: 47, lon: -122 }), /milder/);
  assert.equal(winterHint('lanina', { lat: 51.5, lon: -0.1 }), null);
});

test('/api/climate joins drought and ENSO, and fails soft per part', async () => {
  const fetchImpl = mockFetch({
    'usdm_current.json': () => json(USDM),
    'ensodisc.shtml': () => new Response(DISC),
    'wksst9120.for': () => new Response(WEEKLY),
  });
  const { app } = await testApp({ fetchImpl });
  const r = (await app.inject({ url: '/api/climate?lat=46&lon=-95' })).json();
  assert.equal(r.drought.code, 'D1');
  assert.equal(r.drought.mapDate, '2026-11-03');
  assert.equal(r.enso.status, 'La Niña Advisory');
  assert.equal(r.enso.nino34, -0.8);
  assert.equal(r.enso.weeks.length, 4);
  assert.match(r.enso.winter, /colder and snowier/);
  await app.close();

  const down = await testApp({ fetchImpl: mockFetch({ 'usdm_current.json': () => json({}, 503), 'ensodisc.shtml': () => new Response('', { status: 500 }), 'wksst9120.for': () => new Response(WEEKLY) }) });
  const d = (await down.app.inject({ url: '/api/climate?lat=46&lon=-95' })).json();
  assert.equal(d.drought, null);
  assert.equal(d.droughtAvailable, false);
  assert.equal(d.enso.status, null);
  assert.equal(d.enso.phase.id, 'lanina'); // still known from the sea temperature
  await down.app.close();
});

test('classroom log: entry checks, notes cleaned, summary', () => {
  assert.match(validEntry({ sky: 'purple' }), /sky/);
  assert.match(validEntry({ sky: 'sunny', temp: 300 }), /temperature/);
  assert.match(validEntry({ sky: 'sunny', wind: 'hurricane' }), /calm/);
  assert.equal(validEntry({ sky: 'rain', temp: 51, wind: 'breezy' }), null);
  assert.equal(cleanNote(' a <b>puddle</b>\n jump '), 'a bpuddle/b jump');
  assert.equal(cleanNote('x'.repeat(200)).length, 140);
  const s = logSummary([
    { day: '2026-11-03', sky: 'sunny', temp: 50, precip: false },
    { day: '2026-11-04', sky: 'rain', temp: 44, precip: true },
    { day: '2026-11-05', sky: 'sunny', temp: 58, precip: false },
  ]);
  assert.deepEqual(s, { days: 3, commonSky: 'sunny', commonCount: 2, rainyDays: 1, warmest: 58, coldest: 44 });
  assert.equal(logSummary([]), null);
});

test('classroom log: signed-in people add, only the writer or an admin removes', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' } });
  const admin = { cookie: cookieFrom(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } })) };
  for (const u of ['kid', 'kid2']) await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: { username: u, displayName: u, password: 'password456' } });
  const as = async (u) => ({ cookie: cookieFrom(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: u, password: 'password456' } })) });
  const kid = await as('kid');
  const kid2 = await as('kid2');

  assert.equal((await app.inject({ method: 'POST', url: '/api/classroom/log', payload: { sky: 'sunny' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/classroom/log', headers: kid, payload: { sky: 'lava' } })).statusCode, 400);
  const add = await app.inject({ method: 'POST', url: '/api/classroom/log', headers: kid, payload: { sky: 'rain', temp: 48, precip: true, wind: 'breezy', note: 'Big <puddles>', day: '2026-11-05' } });
  assert.equal(add.statusCode, 201);
  const id = add.json().id;

  const mine = (await app.inject({ url: '/api/classroom/log', headers: kid })).json();
  assert.equal(mine.entries.length, 1);
  assert.equal(mine.entries[0].note, 'Big puddles');
  assert.equal(mine.entries[0].by, 'kid');
  assert.equal(mine.entries[0].mine, true);
  assert.equal(mine.entries[0].userId, undefined);
  assert.equal(mine.summary.rainyDays, 1);
  assert.equal((await app.inject({ url: '/api/classroom/log', headers: kid2 })).json().entries[0].mine, false);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/classroom/log/${id}`, headers: kid2 })).statusCode, 403);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/classroom/log/${id}`, headers: admin })).statusCode, 200);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/classroom/log/${id}`, headers: kid })).statusCode, 404);
  await app.close();
});
