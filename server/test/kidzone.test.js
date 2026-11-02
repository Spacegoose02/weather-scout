import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom, mockFetch } from './helpers.js';
import { spreadCameras, fieldTripMissions, parseActuals, decodePhoto, distanceMiles, directionWord } from '../src/kidzone.js';

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;

async function signedIn(env = {}, fetchImpl) {
  const { app } = await testApp({ env, fetchImpl });
  const res = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  return { app, cookie: cookieFrom(res) };
}

test('kid data needs sign-in and round-trips per user', async () => {
  const { app, cookie } = await signedIn();
  assert.equal((await app.inject('/api/me/kid')).statusCode, 401);
  const put = await app.inject({ method: 'PUT', url: '/api/me/kid', headers: { cookie }, payload: { badges: { 'first-bingo': '2026-11-02' } } });
  assert.equal(put.statusCode, 200);
  const get = await app.inject({ url: '/api/me/kid', headers: { cookie } });
  assert.deepEqual(get.json().data.badges, { 'first-bingo': '2026-11-02' });
  await app.close();
});

test('seasons photos: upload, list, fetch and delete', async () => {
  const { app, cookie } = await signedIn();
  const up = await app.inject({
    method: 'POST', url: '/api/me/photos', headers: { cookie },
    payload: { spot: 'Maple tree', image: JPEG, takenOn: '2026-11-02', weather: { temp: 61, units: '°F', icon: 'clear', kidLabel: 'Sunny and clear!' } },
  });
  assert.equal(up.statusCode, 200, up.body);
  const { photo } = up.json();
  const list = (await app.inject({ url: '/api/me/photos', headers: { cookie } })).json().photos;
  assert.equal(list.length, 1);
  assert.equal(list[0].spot, 'Maple tree');
  assert.equal(list[0].weather.temp, 61);
  const img = await app.inject({ url: photo.url, headers: { cookie } });
  assert.equal(img.headers['content-type'], 'image/jpeg');
  assert.equal(img.rawPayload[0], 0xff);
  assert.equal((await app.inject({ method: 'DELETE', url: photo.url, headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ url: photo.url, headers: { cookie } })).statusCode, 404);
  await app.close();
});

test('photos reject things that are not images', async () => {
  const { app, cookie } = await signedIn();
  const bad = await app.inject({ method: 'POST', url: '/api/me/photos', headers: { cookie }, payload: { spot: 'x', image: 'data:image/jpeg;base64,PHNjcmlwdD4=' } });
  assert.equal(bad.statusCode, 400);
  assert.equal(decodePhoto('data:text/html;base64,AAAA'), null);
  await app.close();
});

test('one kid cannot see another kid\'s photos', async () => {
  const { app, cookie } = await signedIn();
  const up = (await app.inject({ method: 'POST', url: '/api/me/photos', headers: { cookie }, payload: { spot: 'Yard', image: JPEG } })).json();
  await app.inject({ method: 'POST', url: '/api/admin/users', headers: { cookie }, payload: { username: 'kid', password: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'kid', password: 'password123' } });
  const kidCookie = cookieFrom(login);
  assert.equal((await app.inject({ url: up.photo.url, headers: { cookie: kidCookie } })).statusCode, 404);
  assert.equal((await app.inject({ url: '/api/me/photos', headers: { cookie: kidCookie } })).json().photos.length, 0);
  await app.close();
});

test('actuals return past days only', () => {
  const days = parseActuals({
    current: { time: '2026-11-02T10:00' },
    daily: { time: ['2026-10-31', '2026-11-01', '2026-11-02'], temperature_2m_max: [60, 64, 70], temperature_2m_min: [40, 45, 50], precipitation_sum: [0, 0.3, 0], weather_code: [0, 61, 1] },
  });
  assert.deepEqual(days.map((d) => d.date), ['2026-10-31', '2026-11-01']);
  assert.equal(days[1].precipTotal, 0.3);
});

test('GET /api/kid/actuals asks Open-Meteo for past days', async () => {
  const fetchImpl = mockFetch({
    'past_days=14': () => new Response(JSON.stringify({ daily: { time: ['2000-01-01'], temperature_2m_max: [50], temperature_2m_min: [30], precipitation_sum: [0], weather_code: [3] } }), { headers: { 'content-type': 'application/json' } }),
  });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/kid/actuals?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().days[0].high, 50);
  await app.close();
});

test('field trip cameras are spread out and nearest first', () => {
  const home = { lat: 37.5, lon: -77.4 };
  const cams = [
    { id: 'a', lat: 37.51, lon: -77.41 }, { id: 'b', lat: 37.515, lon: -77.415 }, // same cell
    { id: 'c', lat: 38.2, lon: -77.4 }, { id: 'd', lat: 37.3, lon: -77.9, hasImage: false },
  ];
  const out = spreadCameras(home, cams);
  assert.deepEqual(out.map((c) => c.id), ['a', 'c']);
  assert.ok(distanceMiles(home, { lat: 38.5, lon: -77.4 }) > 68);
  assert.equal(directionWord(home, { lat: 38.5, lon: -77.4 }), 'north');
});

test('field trip missions find rain and the coldest camera', () => {
  const home = { lat: 37.5, lon: -77.4 };
  const spot = (id, o) => ({ id, name: id, lat: 37.6, lon: -77.4, miles: 7, imageUrl: `/img/${id}`, temp: 50, code: 1, gust: 5, precip: 0, snowfall: 0, isDay: true, cloudCover: 10, ...o });
  const missions = fieldTripMissions(home, [spot('dry', {}), spot('wet', { code: 63, precip: 0.2, temp: 44 }), spot('windy', { gust: 40 })]);
  const by = Object.fromEntries(missions.map((m) => [m.id, m]));
  assert.deepEqual(by.rain.cameras.map((c) => c.id), ['wet']);
  assert.equal(by.snow.found, false);
  assert.ok(by.snow.none);
  assert.equal(by.coldest.cameras[0].id, 'wet');
  assert.equal(by.windiest.cameras[0].id, 'windy');
  assert.equal(missions.at(-1).found, false);
});

test('GET /api/kid/field-trip checks the weather at nearby cameras', async () => {
  const camEnv = {
    CAMERA_FEEDS_JSON: JSON.stringify({ feeds: [{ id: 'va', name: 'Test 511', type: 'ibi511', baseUrl: 'https://511.example', keyEnv: 'K' }] }),
    K: 'x',
  };
  const fetchImpl = mockFetch({
    'current=temperature_2m%2Cweather_code%2Cwind_gusts_10m': () => new Response(JSON.stringify({ current: { temperature_2m: 41, weather_code: 63, wind_gusts_10m: 12, precipitation: 0.1, snowfall: 0, is_day: 1, cloud_cover: 100 } }), { headers: { 'content-type': 'application/json' } }),
  });
  const { app } = await testApp({ env: camEnv, fetchImpl });
  const res = await app.inject('/api/kid/field-trip?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.cameraCount, 1);
  const rain = body.missions.find((m) => m.id === 'rain');
  assert.equal(rain.found, true);
  assert.equal(rain.cameras[0].name, 'I-95 at Exit 74');
  assert.match(rain.cameras[0].imageUrl, /^\/api\/cameras\/image\//);
  await app.close();
});

test('field trip with no cameras configured is empty, not an error', async () => {
  const { app } = await testApp();
  const res = await app.inject('/api/kid/field-trip?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().missions.length, 0);
  await app.close();
});
