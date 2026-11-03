import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom, mockFetch } from './helpers.js';

const camEnv = {
  CAMERA_FEEDS_JSON: JSON.stringify({ feeds: [{ id: 'va', name: 'Test 511', type: 'ibi511', baseUrl: 'https://511.example', keyEnv: 'TEST_511_KEY' }] }),
  TEST_511_KEY: 'sekret',
};

test('GET /api/weather bundles forecast, alerts, air and kid mode', async () => {
  const { app } = await testApp();
  const res = await app.inject('/api/weather?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.forecast.daily.length, 10);
  assert.equal(body.alerts[0].event, 'Tornado Warning');
  assert.equal(body.air.aqi, 42);
  assert.equal(body.kid.playground.rating, 'red');
  await app.close();
});

test('NWS gets a User-Agent and results are cached', async () => {
  const { app, fetchImpl } = await testApp({ env: { NWS_USER_AGENT: 'TestScout (me@example.com)' } });
  await app.inject('/api/weather?lat=37.54&lon=-77.43');
  await app.inject('/api/weather?lat=37.541&lon=-77.431');
  const nwsCalls = fetchImpl.calls.filter((c) => c.url.includes('api.weather.gov'));
  assert.equal(nwsCalls.length, 1);
  assert.equal(nwsCalls[0].opts.headers['User-Agent'], 'TestScout (me@example.com)');
  await app.close();
});

test('weather still works when NWS is down', async () => {
  const fetchImpl = mockFetch({ 'api.weather.gov': () => new Response('down', { status: 503 }) });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/weather?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().alertsAvailable, false);
  await app.close();
});

test('forecast failure is a friendly 502', async () => {
  const fetchImpl = mockFetch({ 'api.open-meteo.com': () => new Response('x', { status: 500 }) });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/weather?lat=37.54&lon=-77.43');
  assert.equal(res.statusCode, 502);
  await app.close();
});

test('bad coordinates are rejected', async () => {
  const { app } = await testApp();
  assert.equal((await app.inject('/api/weather?lat=200&lon=0')).statusCode, 400);
  await app.close();
});

test('cameras are filtered to the map view and keys stay server side', async () => {
  const { app, fetchImpl } = await testApp({ env: camEnv });
  const res = await app.inject('/api/cameras?south=37&west=-78&north=38&east=-77');
  const body = res.json();
  assert.equal(body.cameras.length, 1);
  assert.equal(body.cameras[0].id, 'va:1');
  assert.equal(body.cameras[0].imageUrl, '/api/cameras/image/va%3A1');
  assert.ok(!JSON.stringify(body).includes('sekret'));
  assert.ok(!JSON.stringify(body).includes('cams.example'));
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('key=sekret')));
  const img = await app.inject(body.cameras[0].imageUrl);
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/jpeg');
  assert.equal((await app.inject('/api/cameras/image/nope')).statusCode, 404);
  await app.close();
});

test('camera feeds are listed for the layer panel and can be hidden from the map', async () => {
  const { app } = await testApp({ env: camEnv });
  const feeds = (await app.inject('/api/cameras/feeds')).json().feeds;
  assert.deepEqual(feeds.map((f) => [f.id, f.name, f.count]), [['va', 'Test 511', 2]]);
  assert.ok(!JSON.stringify(feeds).includes('sekret'));
  const hidden = (await app.inject('/api/cameras?south=37&west=-78&north=38&east=-77&hide=va,ny')).json();
  assert.equal(hidden.cameras.length, 0);
  assert.equal(hidden.total, 0);
  assert.equal((await app.inject('/api/cameras?south=37&west=-78&north=38&east=-77&hide=ny')).json().cameras.length, 1);
  await app.close();
});

test('first-run setup creates an admin, then local login works', async () => {
  const { app } = await testApp();
  let cfg = (await app.inject('/api/config')).json();
  assert.equal(cfg.auth.needsSetup, true);
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  assert.equal(setup.statusCode, 200);
  assert.equal(setup.json().user.isAdmin, true);
  const again = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'x', password: 'password123' } });
  assert.equal(again.statusCode, 409);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'mom', password: 'nope-nope' } });
  assert.equal(bad.statusCode, 401);
  const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'mom', password: 'password123' } });
  const cookie = cookieFrom(good);
  const me = (await app.inject({ url: '/api/auth/me', headers: { cookie } })).json();
  assert.equal(me.user.username, 'mom');
  await app.close();
});

test('preferences are saved per user', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const cookie = cookieFrom(login);
  const put = await app.inject({ method: 'PUT', url: '/api/me/preferences', headers: { cookie }, payload: { kidMode: true, locations: [{ name: 'Home', lat: 1, lon: 2 }] } });
  assert.equal(put.statusCode, 200);
  const get = (await app.inject({ url: '/api/me/preferences', headers: { cookie } })).json();
  assert.equal(get.kidMode, true);
  assert.equal((await app.inject('/api/me/preferences')).statusCode, 401);
  await app.close();
});

test('tinyauth headers are ignored unless trusted', async () => {
  const { app } = await testApp();
  const me = (await app.inject({ url: '/api/auth/me', headers: { 'remote-user': 'kid@example.com' } })).json();
  assert.equal(me.user, null);
  await app.close();
});

test('tinyauth SSO auto-creates users, and admin can link SSO to an existing username', async () => {
  const { app } = await testApp({ env: { AUTH_TRUST_PROXY_HEADERS: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const admin = { cookie: cookieFrom(login) };

  const created = await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: { username: 'sam', password: 'password123', displayName: 'Sam' } });
  assert.equal(created.statusCode, 200);
  const samId = created.json().user.id;
  const link = await app.inject({ method: 'PATCH', url: `/api/admin/users/${samId}`, headers: admin, payload: { ssoSubject: 'sam@family.example' } });
  assert.equal(link.json().user.ssoSubject, 'sam@family.example');

  const viaSso = (await app.inject({ url: '/api/auth/me', headers: { 'remote-user': 'sam@family.example' } })).json();
  assert.equal(viaSso.user.username, 'sam');

  const newbie = (await app.inject({ url: '/api/auth/me', headers: { 'remote-user': 'grandpa@family.example', 'remote-name': 'Grandpa' } })).json();
  assert.equal(newbie.user.username, 'grandpa');
  assert.equal(newbie.user.displayName, 'Grandpa');
  assert.equal(newbie.user.isAdmin, false);

  const forbidden = await app.inject({ url: '/api/admin/users', headers: { 'remote-user': 'grandpa@family.example' } });
  assert.equal(forbidden.statusCode, 403);
  await app.close();
});

test('AUTH_REQUIRED blocks weather for guests', async () => {
  const { app } = await testApp({ env: { AUTH_REQUIRED: 'true' } });
  assert.equal((await app.inject('/api/weather?lat=37.54&lon=-77.43')).statusCode, 401);
  assert.equal((await app.inject('/api/config')).statusCode, 200);
  await app.close();
});

test('cannot remove the last admin', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const users = (await app.inject({ url: '/api/admin/users', headers })).json().users;
  const res = await app.inject({ method: 'DELETE', url: `/api/admin/users/${users[0].id}`, headers });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test('app keys: admin makes one, Den-Duty reads the summary with it, revoke stops it', async () => {
  const { app } = await testApp({ env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const made = (await app.inject({ method: 'POST', url: '/api/admin/app-keys', headers, payload: { name: 'Den-Duty' } })).json();
  assert.match(made.key, /^wsk_/);
  const listed = (await app.inject({ url: '/api/admin/app-keys', headers })).json().keys;
  assert.equal(listed[0].name, 'Den-Duty');
  assert.ok(!JSON.stringify(listed).includes(made.key));

  assert.equal((await app.inject('/api/connect/summary')).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/connect/summary', headers: { authorization: 'Bearer wsk_wrongwrongwrongwrongwrong' } })).statusCode, 401);
  const res = await app.inject({ url: '/api/connect/summary', headers: { authorization: `Bearer ${made.key}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.location.name, 'Richmond, VA');
  assert.equal(body.playground.rating, 'red');
  assert.equal(body.alerts[0].event, 'Tornado Warning');
  assert.ok(Array.isArray(body.checklist));
  assert.equal(body.raccoon.art.full, '/rocky/rocky.png');
  assert.match(body.raccoon.art.dressed, /^\/api\/connect\/rocky\.svg\?items=/);
  // The dressed picture needs no key (it's only the mascot), even with sign-in required.
  const rocky = await app.inject(body.raccoon.art.dressed);
  assert.equal(rocky.statusCode, 200);
  assert.match(rocky.headers['content-type'], /^image\/svg\+xml/);
  assert.match(rocky.body, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(rocky.body, /href="data:image\/webp;base64,/);
  assert.ok(!('description' in body.alerts[0]));
  assert.ok((await app.inject({ url: '/api/admin/app-keys', headers })).json().keys[0].lastUsedAt);

  await app.inject({ method: 'DELETE', url: `/api/admin/app-keys/${made.id}`, headers });
  assert.equal((await app.inject({ url: '/api/connect/summary', headers: { authorization: `Bearer ${made.key}` } })).statusCode, 401);
  await app.close();
});

test('app keys are admin only', async () => {
  const { app } = await testApp();
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/app-keys', payload: { name: 'x' } })).statusCode, 401);
  await app.close();
});

test('Virginia cameras are on by default with no config, and can be turned off', async () => {
  const va = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-77.44, 37.55] }, properties: { id: '7', description: 'I-64 at Broad St', active: true, image_url: 'http://cams.example/7.jpg' } }] };
  const fetchImpl = mockFetch({ '511.vdot.virginia.gov': () => new Response(JSON.stringify(va), { headers: { 'content-type': 'application/json' } }) });
  const { app } = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'va' } });
  const body = (await app.inject('/api/cameras?south=37&west=-78&north=38&east=-77')).json();
  assert.equal(body.cameras[0].id, 'va:7');
  assert.equal(body.feeds[0].name, '511 Virginia (VDOT)');
  await app.close();

  const off = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'false' } });
  assert.equal((await off.app.inject('/api/cameras?south=37&west=-78&north=38&east=-77')).json().feeds.length, 0);
  await off.app.close();
});

test('Maryland and Kentucky ArcGIS feeds page through results; MD cams are live players', async () => {
  const page = (n, offset, more) => ({
    type: 'FeatureCollection', exceededTransferLimit: more,
    features: Array.from({ length: n }, (_, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-76.6, 39.2] },
      properties: { feedID: `f${offset + i}`, location: `MD cam ${offset + i}`, url: `https://chart.maryland.gov/video/video.php?feed=f${offset + i}` } })),
  });
  const ky = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-85.74, 38.26] }, properties: { OBJECTID: 2, description: 'I-65 at Spaghetti Junction', snapshot: 'http://www.trimarc.org/images/x.jpg' } }] };
  const fetchImpl = mockFetch({
    'geodata.md.gov': (u) => {
      const offset = Number(new URL(u).searchParams.get('resultOffset'));
      return Response.json(offset === 0 ? page(500, 0, true) : page(3, 500, false));
    },
    'kygisserver.ky.gov': () => Response.json(ky),
  });
  const { app } = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'md,ky' } });
  const md = (await app.inject('/api/cameras?south=39&west=-77&north=39.5&east=-76')).json();
  assert.equal(md.total, 503);
  assert.equal(md.cameras[0].imageUrl, null);
  assert.match(md.cameras[0].embed, /^https:\/\/chart\.maryland\.gov\/video/);
  assert.equal((await app.inject(`/api/cameras/image/${encodeURIComponent(md.cameras[0].id)}`)).statusCode, 404);
  const kyRes = (await app.inject('/api/cameras?south=38&west=-86&north=38.5&east=-85')).json();
  assert.equal(kyRes.cameras[0].name, 'I-65 at Spaghetti Junction');
  assert.equal(kyRes.cameras[0].imageUrl, '/api/cameras/image/ky%3A2');
  const mdCalls = fetchImpl.calls.filter((c) => c.url.includes('geodata.md.gov'));
  assert.equal(mdCalls.length, 2);
  assert.match(mdCalls[0].url, /f=geojson/);
  await app.close();
});

test('CAMERAS_DEFAULT_FEEDS picks states', async () => {
  const { defaultFeeds } = await import('../src/providers/cameras/index.js');
  assert.deepEqual(defaultFeeds('').map((f) => f.id), ['va', 'sc', 'md', 'ky', 'de']);
  assert.deepEqual(defaultFeeds('', { NC_DRIVENC_API_KEY: 'k' }).map((f) => f.id), ['va', 'sc', 'md', 'ky', 'de', 'nc']);
  assert.deepEqual(defaultFeeds('', { OHGO_API_KEY: 'k', GA511_API_KEY: 'g' }).map((f) => f.id), ['va', 'sc', 'md', 'ky', 'de', 'ga', 'oh']);
  assert.deepEqual(defaultFeeds('nc').map((f) => f.id), []);
  assert.deepEqual(defaultFeeds('va, ky').map((f) => f.id), ['va', 'ky']);
  assert.equal(defaultFeeds('false').length, 0);
});

test('DriveNC cameras load with a key using the 511 v2 API', async () => {
  const nc = [{ Id: 55, Roadway: 'I-40', Direction: 'East', Latitude: 35.78, Longitude: -78.64, Location: 'I-40 at Wade Ave', Views: [{ Id: 1, Url: 'https://www.drivenc.gov/map/Cctv/55', Status: 'Enabled', VideoUrl: null }] }];
  const fetchImpl = mockFetch({ 'drivenc.gov/api/v2/get/cameras': () => Response.json(nc) });
  const { app } = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'nc', NC_DRIVENC_API_KEY: 'nckey' } });
  const body = (await app.inject('/api/cameras?south=35&west=-79&north=36&east=-78')).json();
  assert.deepEqual([body.cameras[0].id, body.cameras[0].name, body.cameras[0].road], ['nc:55', 'I-40 at Wade Ave', 'I-40']);
  assert.ok(fetchImpl.calls.some((c) => c.url.includes('key=nckey')));
  assert.ok(!JSON.stringify(body).includes('nckey'));
  await app.close();
});

test('South Carolina cameras skip offline and problem streams', async () => {
  const cam = (name, active, problem) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-79.062775, 33.845627] },
    properties: { name, description: `US 501 N @ ${name}`, route: 'US 501', direction: 'NB', active, problem_stream: problem,
      image_url: `https://scdotsnap.us-east-1.skyvdn.com/thumbs/${name}.flv.png`, https_url: `https://s18.us-east-1.skyvdn.com/rtplive/${name}/playlist.m3u8` } });
  const sc = { type: 'FeatureCollection', features: [cam('50001', true, false), cam('50002', false, false), cam('50003', true, true)] };
  const fetchImpl = mockFetch({ 'sc.cdn.iteris-atis.com': () => Response.json(sc) });
  const { app } = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'sc' } });
  const body = (await app.inject('/api/cameras?south=33&west=-80&north=34&east=-79')).json();
  assert.deepEqual(body.cameras.map((c) => c.id), ['sc:50001']);
  assert.equal(body.cameras[0].direction, 'NB');
  assert.match(body.cameras[0].video, /playlist\.m3u8$/);
  await app.close();
});

test('Rocky picture for connected apps: known pieces only, mood badge, safe headers', async () => {
  const { app } = await testApp();
  const res = await app.inject('/api/connect/rocky.svg?items=raincoat,boots,<script>,beanie&mood=shivering');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.match(res.body, /class="coat raincoat"/);
  assert.match(res.body, /class="boots rain"/);
  assert.match(res.body, /class="beanie"/);
  assert.match(res.body, /🥶/);
  assert.ok(!res.body.includes('<script'));
  assert.match(res.body, /aria-label="Rocky the raccoon wearing raincoat, boots, beanie"/);
  const plain = await app.inject('/api/connect/rocky.svg?mood=grumpy');
  assert.match(plain.body, /class="raccoon mood-happy"/);
  assert.ok(!plain.body.includes('class="coat'));
  await app.close();
});

test('Delaware cameras are live video only and skip disabled ones', async () => {
  const de = { features: [
    { attributes: { ID: 'KCAM001', ENABLED: 1, TITLE: 'DE 1 @ MILFORD NECK RD', M3U8S: 'https://video.deldot.gov:443/live/KCAM001.stream/playlist.m3u8' }, geometry: { x: -75.4486, y: 38.9909 } },
    { attributes: { ID: 'KCAM002', ENABLED: 0, TITLE: 'Off camera', M3U8S: 'https://video.deldot.gov:443/live/KCAM002.stream/playlist.m3u8' }, geometry: { x: -75.54, y: 39.15 } },
  ] };
  const geo = { type: 'FeatureCollection', features: de.features.map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.geometry.x, f.geometry.y] }, properties: f.attributes })) };
  const fetchImpl = mockFetch({ 'firstmaptest.delaware.gov': () => Response.json(geo) });
  const { app } = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'de' } });
  const body = (await app.inject('/api/cameras?south=38.5&west=-76&north=39.5&east=-75')).json();
  assert.deepEqual(body.cameras.map((c) => c.id), ['de:KCAM001']);
  assert.equal(body.cameras[0].imageUrl, null);
  assert.match(body.cameras[0].video, /^https:\/\/video\.deldot\.gov.*playlist\.m3u8$/);
  await app.close();
});

test('Ohio OHGO cameras load with the key in a header, never in the response', async () => {
  const oh = { totalResultCount: 1, results: [{ id: '000001', latitude: 39.96, longitude: -83.0, location: 'I-70 at I-71', description: 'Columbus',
    cameraViews: [{ direction: 'East', smallUrl: 'https://itscameras.dot.state.oh.us/images/a-s.jpg', largeUrl: 'https://itscameras.dot.state.oh.us/images/a.jpg', mainRoute: 'I-70' }] }] };
  const fetchImpl = mockFetch({ 'publicapi.ohgo.com/api/v1/cameras': () => Response.json(oh) });
  const { app } = await testApp({ fetchImpl, env: { CAMERAS_DEFAULT_FEEDS: 'oh', OHGO_API_KEY: 'ohkey' } });
  const body = (await app.inject('/api/cameras?south=39.5&west=-83.5&north=40.5&east=-82.5')).json();
  assert.deepEqual([body.cameras[0].id, body.cameras[0].name, body.cameras[0].road, body.cameras[0].direction], ['oh:000001', 'I-70 at I-71', 'I-70', 'East']);
  assert.equal(body.cameras[0].imageUrl, '/api/cameras/image/oh%3A000001');
  const call = fetchImpl.calls.find((c) => c.url.includes('ohgo'));
  assert.match(call.url, /page-all=true/);
  assert.ok(!call.url.includes('ohkey'));
  assert.ok(!JSON.stringify(body).includes('ohkey'));
  await app.close();
});

test('built-in states waiting for a key are listed with the setting to fill in', async () => {
  const { feedsNeedingKeys } = await import('../src/providers/cameras/index.js');
  assert.deepEqual(feedsNeedingKeys('', { NY511_API_KEY: 'k' }).map((f) => f.keyEnv), ['NC_DRIVENC_API_KEY', 'GA511_API_KEY', 'OHGO_API_KEY']);
  assert.deepEqual(feedsNeedingKeys('va,oh').map((f) => f.id), ['oh']);
  assert.equal(feedsNeedingKeys('false').length, 0);
  assert.match(feedsNeedingKeys('nc')[0].signup, /^https:\/\/www\.drivenc\.gov/);
});
