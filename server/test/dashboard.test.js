import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom } from './helpers.js';
import { cleanLayout } from '../src/dashboard.js';
import { tonightSky, compass, heightWords } from '../src/stars.js';

async function family() {
  const { app } = await testApp();
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  const admin = cookieFrom(setup);
  await app.inject({ method: 'POST', url: '/api/admin/users', headers: { cookie: admin }, payload: { username: 'kiddo', password: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'kiddo', password: 'password123' } });
  return { app, admin, kid: cookieFrom(login) };
}

test('cleanLayout drops duplicates and fixes sizes', () => {
  assert.deepEqual(cleanLayout({ cards: [{ id: 'radar', size: 'l' }, { id: 'radar', size: 's' }, { id: 'tides', size: 'xl' }, {}] }), {
    cards: [{ id: 'radar', size: 'l' }, { id: 'tides', size: 'm' }],
  });
});

test('dashboards are saved per user, and reset falls back to the house default', async () => {
  const { app, admin, kid } = await family();
  assert.equal((await app.inject('/api/me/dashboard')).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/me/dashboard', headers: { cookie: kid } })).json().layout, null);

  const mine = { cards: [{ id: 'rocky', size: 'l' }, { id: 'current', size: 'm' }] };
  const put = await app.inject({ method: 'PUT', url: '/api/me/dashboard', headers: { cookie: kid }, payload: mine });
  assert.equal(put.statusCode, 200, put.body);
  assert.deepEqual((await app.inject({ url: '/api/me/dashboard', headers: { cookie: kid } })).json().layout, mine);
  // The admin's dashboard is separate.
  assert.equal((await app.inject({ url: '/api/me/dashboard', headers: { cookie: admin } })).json().layout, null);

  // Bad shapes are refused.
  const bad = await app.inject({ method: 'PUT', url: '/api/me/dashboard', headers: { cookie: kid }, payload: { cards: [{ id: '<script>' }] } });
  assert.equal(bad.statusCode, 400);

  // Only admins set the guest default.
  const house = { cards: [{ id: 'current', size: 'l' }, { id: 'radar', size: 'm' }] };
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/dashboard/default', headers: { cookie: kid }, payload: house })).statusCode, 403);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/dashboard/default', headers: { cookie: admin }, payload: house })).statusCode, 200);
  assert.deepEqual((await app.inject('/api/dashboard/default')).json().layout, house);

  const reset = await app.inject({ method: 'DELETE', url: '/api/me/dashboard', headers: { cookie: kid } });
  assert.deepEqual(reset.json().houseDefault, house);
  assert.equal((await app.inject({ url: '/api/me/dashboard', headers: { cookie: kid } })).json().layout, null);

  await app.inject({ method: 'DELETE', url: '/api/admin/dashboard/default', headers: { cookie: admin } });
  assert.equal((await app.inject('/api/dashboard/default')).json().layout, null);
  await app.close();
});

test('journal: one page per day, per kid', async () => {
  const { app, admin, kid } = await family();
  const day = new Date().toISOString().slice(0, 10);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/me/journal/${day}`, payload: { sky: ['sunny'] } })).statusCode, 401);

  const page = { sky: ['sunny', 'windy'], high: 64, low: 41, rain: 0.1, units: 'imperial', note: '  Saw a hawk!  ', forecast: { high: 66, low: 40, icon: 'clear' } };
  const put = await app.inject({ method: 'PUT', url: `/api/me/journal/${day}`, headers: { cookie: kid }, payload: page });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().entry.note, 'Saw a hawk!');
  // Writing the same day again replaces the page.
  await app.inject({ method: 'PUT', url: `/api/me/journal/${day}`, headers: { cookie: kid }, payload: { ...page, high: 65 } });
  await app.inject({ method: 'PUT', url: '/api/me/journal/2026-10-31', headers: { cookie: kid }, payload: { sky: ['rain'], rain: 0.6 } });

  const list = (await app.inject({ url: '/api/me/journal', headers: { cookie: kid } })).json().entries;
  assert.equal(list.length, 2);
  assert.equal(list[0].day, day);
  assert.equal(list[0].high, 65);
  assert.deepEqual(list[0].sky, ['sunny', 'windy']);
  assert.equal((await app.inject({ url: '/api/me/journal', headers: { cookie: admin } })).json().entries.length, 0);

  assert.equal((await app.inject({ method: 'PUT', url: '/api/me/journal/2099-01-01', headers: { cookie: kid }, payload: {} })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/me/journal/${day}`, headers: { cookie: kid }, payload: { sky: ['lava'] } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/me/journal/2026-10-31', headers: { cookie: kid } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/me/journal/2026-10-31', headers: { cookie: kid } })).statusCode, 404);
  await app.close();
});

test('tonight sky: dark window, planets with where-to-look, moonrise', () => {
  // Richmond, VA on the evening of 2 Nov 2026.
  const r = tonightSky({ lat: 37.54, lon: -77.43 }, Date.parse('2026-11-02T22:00:00Z'));
  assert.ok(r.dark);
  const from = Date.parse(r.dark.from);
  const until = Date.parse(r.dark.until);
  assert.ok(from > Date.parse('2026-11-02T22:30:00Z') && from < Date.parse('2026-11-02T23:30:00Z'), r.dark.from); // ~6 PM EST
  assert.ok(until - from > 10 * 3_600_000);
  assert.equal(r.planets.length, 5);
  const saturn = r.planets.find((p) => p.id === 'saturn');
  assert.equal(saturn.visible, true);
  assert.match(saturn.best.where, /south/);
  const venus = r.planets.find((p) => p.id === 'venus');
  assert.equal(venus.visible, false); // close to the Sun this week
  assert.ok(r.planets[0].visible, 'visible planets come first');
  assert.ok(r.moon.rise && r.moon.set);
  assert.ok(r.moon.illumination >= 0 && r.moon.illumination <= 100);
});

test('tonight sky: midsummer in the Arctic never gets dark', () => {
  const r = tonightSky({ lat: 78, lon: 15 }, Date.parse('2026-06-21T22:00:00Z'));
  assert.equal(r.dark, null);
  assert.equal(r.planets.length, 0);
  assert.match(r.note, /never gets dark/);
});

test('sky words', () => {
  assert.equal(compass(0), 'north');
  assert.equal(compass(359), 'north');
  assert.equal(compass(225), 'southwest');
  assert.equal(heightWords(10), 'low in the');
  assert.equal(heightWords(70), 'almost straight overhead');
});

test('sky endpoint', async () => {
  const { app } = await testApp();
  const r = await app.inject('/api/sky/tonight?lat=37.54&lon=-77.43');
  assert.equal(r.statusCode, 200);
  assert.ok(Array.isArray(r.json().planets));
  assert.equal((await app.inject('/api/sky/tonight?lat=99&lon=0')).statusCode, 400);
  await app.close();
});
