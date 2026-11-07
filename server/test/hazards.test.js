import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNote, parseLsr, reportsNear, parseGauges, gaugesNear, eroAt, geometryContains, parseFires, firesNear, smokeOutlook, hailLabel } from '../../shared/hazards.js';
import { lsrUrl, gaugesUrl, firesUrl } from '../src/hazards.js';
import { testApp, mockFetch } from './helpers.js';

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const home = { lat: 37.54, lon: -77.44 };
const NOW = Date.parse('2026-11-04T18:00:00Z');

const lsrFixture = {
  type: 'FeatureCollection',
  features: [
    { geometry: { type: 'Point', coordinates: [-77.5, 37.6] }, properties: { valid: '2026-11-04T17:10:00Z', typetext: 'HAIL', magnitude: 1.0, unit: 'INCH', city: 'Glen Allen', state: 'VA', source: 'TRAINED SPOTTER', remark: 'Quarter size hail.', wfo: 'AKQ' } },
    { geometry: { type: 'Point', coordinates: [-77.3, 37.4] }, properties: { valid: '2026-11-04 16:00', typetext: 'FLASH FLOOD', magnitude: '', city: 'Richmond', state: 'VA', source: 'PUBLIC', wfo: 'AKQ' } },
    { geometry: { type: 'Point', coordinates: [-100, 40] }, properties: { valid: '2026-11-04T15:00:00Z', typetext: 'TSTM WND DMG', city: 'Far', state: 'NE', wfo: 'GID' } },
  ],
};

// The same reports as if they came in just now, for tests that run on the real clock
// (reports older than REPORT_HOURS drop off, so fixed dates go stale).
const freshLsr = () => ({
  ...lsrFixture,
  features: lsrFixture.features.map((f) => ({ ...f, properties: { ...f.properties, valid: new Date(Date.parse(f.properties.valid.replace(' ', 'T') + (f.properties.valid.includes('Z') ? '' : 'Z')) + Date.now() - NOW).toISOString() } })),
});

test('notes are cleaned for everyone to read', () => {
  assert.equal(cleanNote('  big\n drops  https://spam.example now '), 'big drops now');
  assert.equal(cleanNote('x'.repeat(300)).length, 140);
  assert.equal(hailLabel(1.75), 'Golf ball');
});

test('NWS storm reports from the IEM feed', () => {
  const r = parseLsr(lsrFixture);
  assert.equal(r.length, 3);
  assert.equal(r[0].kind, 'hail');
  assert.equal(r[0].magnitude, 1);
  assert.equal(r[0].by, 'Trained Spotter');
  assert.equal(r[1].kind, 'flooding');
  assert.equal(r[1].t, Date.parse('2026-11-04T16:00:00Z'));
  assert.equal(r[2].label, 'Thunderstorm Wind Damage');
  const near = reportsNear(r, home, { miles: 25, now: NOW });
  assert.deepEqual(near.map((x) => x.kind), ['hail', 'flooding'], 'newest first, far one dropped');
  assert.ok(near[0].dir);
  assert.match(lsrUrl(), /hours=24/);
});

test('river gauges, flood categories and the worst first', () => {
  const g = parseGauges({ gauges: [
    { lid: 'RMDV2', name: 'James River at Richmond', latitude: 37.56, longitude: -77.54, state: { abbreviation: 'VA' }, status: { observed: { primary: 12.1, primaryUnit: 'ft', secondary: 40.2, secondaryUnit: 'kcfs', floodCategory: 'action', validTime: '2026-11-04T17:00:00Z' }, forecast: { primary: 16.3, floodCategory: 'minor', validTime: '2026-11-05T12:00:00Z' } } },
    { lid: 'XYZV2', name: 'Calm Creek', latitude: 37.5, longitude: -77.4, status: { observed: { primary: 2, floodCategory: 'no_flooding' }, forecast: { primary: -999 } } },
    { lid: 'BAD', latitude: null },
  ] });
  assert.equal(g.length, 2);
  assert.equal(g[0].url, 'https://water.noaa.gov/gauges/rmdv2');
  assert.equal(g[1].forecast, null);
  const near = gaugesNear(g, home);
  assert.equal(near[0].id, 'RMDV2', 'rising to minor flooding comes first');
  assert.equal(near[0].rank, 3);
  assert.match(gaugesUrl({ south: 37, west: -78, north: 38, east: -77 }), /bbox\.xmin=-78\.00/);
});

test('excessive rainfall outlook at a point', () => {
  const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
  const geo = { features: [
    { properties: { OUTLOOK: 'Marginal (At Least 5%)' }, geometry: sq(-80, 35, -75, 40) },
    { properties: { OUTLOOK: 'Slight (At Least 15%)' }, geometry: { type: 'MultiPolygon', coordinates: [sq(-78, 37, -77, 38).coordinates] } },
    { properties: { OUTLOOK: 'Moderate (At Least 40%)' }, geometry: sq(-90, 30, -88, 32) },
  ] };
  assert.equal(eroAt(geo, home).id, 'slight');
  assert.equal(eroAt(geo, { lat: 36, lon: -79 }).id, 'marginal');
  assert.equal(eroAt(geo, { lat: 45, lon: -100 }).id, 'none');
  // A hole in a polygon is not inside it.
  assert.equal(geometryContains({ type: 'Polygon', coordinates: [sq(0, 0, 10, 10).coordinates[0], sq(4, 4, 6, 6).coordinates[0]] }, 5, 5), false);
});

test('wildfires: prescribed burns skipped, upwind fires first', () => {
  const fires = parseFires({ features: [
    { geometry: { type: 'Point', coordinates: [-78.5, 37.5] }, properties: { IncidentName: 'BIG PINE', IncidentSize: 12000.4, PercentContained: 35, FireDiscoveryDateTime: Date.parse('2026-11-02T12:00:00Z'), POOState: 'US-VA', IncidentTypeCategory: 'WF', IrwinID: 'a' } },
    { geometry: { type: 'Point', coordinates: [-77.4, 38.0] }, properties: { IncidentName: 'Ridge Complex', IncidentSize: 300, IncidentTypeCategory: 'WF', IrwinID: 'b' } },
    { geometry: { type: 'Point', coordinates: [-77.5, 37.6] }, properties: { IncidentName: 'Burn', IncidentTypeCategory: 'RX', IrwinID: 'c' } },
  ] });
  assert.deepEqual(fires.map((f) => f.name), ['Big Pine Fire', 'Ridge Complex']);
  assert.equal(fires[0].state, 'VA');
  // Wind from the west (270°): Big Pine (to the west) is upwind.
  const near = firesNear(fires, home, { windFrom: 270 });
  assert.equal(near[0].name, 'Big Pine Fire');
  assert.equal(near[0].upwind, true);
  assert.equal(near[1].upwind, false);
  assert.match(firesUrl({ south: 37, west: -79, north: 38, east: -77 }), /esriGeometryEnvelope/);
});

test('smoke outlook from the air quality forecast', () => {
  const s = smokeOutlook({ aqi: 120, main: { id: 'pm25' }, hourly: [{ time: 'a', aqi: 80 }, { time: 'b', aqi: 140 }, { time: 'c', aqi: 110 }] });
  assert.equal(s.badHours, 2);
  assert.equal(s.worst.aqi, 140);
  assert.equal(s.likelySmoke, true);
});

test('crowd reports: sign in to post, one at a time, own or admin can remove', async () => {
  const fetchImpl = mockFetch({ 'geojson/lsr.php': () => json(freshLsr()) });
  const { app } = await testApp({ fetchImpl, env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct-horse-9' } });
  const guest = await app.inject({ method: 'POST', url: '/api/reports', payload: { kind: 'rain', lat: 37.5, lon: -77.4 } });
  assert.equal(guest.statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'correct-horse-9' } });
  const cookie = login.headers['set-cookie'];
  const hail = await app.inject({ method: 'POST', url: '/api/reports', headers: { cookie }, payload: { kind: 'hail', lat: 37.5, lon: -77.4 } });
  assert.equal(hail.statusCode, 400, 'hail needs a size');
  const ok = await app.inject({ method: 'POST', url: '/api/reports', headers: { cookie }, payload: { kind: 'hail', hail: 1, note: 'Bouncing off the deck! http://x.y', lat: 37.54321, lon: -77.4321 } });
  assert.equal(ok.statusCode, 201, ok.body);
  const rep = ok.json();
  assert.equal(rep.lat, 37.54, 'rounded so it is not a front door');
  assert.equal(rep.remark, 'Bouncing off the deck!');
  const again = await app.inject({ method: 'POST', url: '/api/reports', headers: { cookie }, payload: { kind: 'rain', lat: 37.5, lon: -77.4 } });
  assert.equal(again.statusCode, 429);

  const near = (await app.inject({ url: '/api/reports/near?lat=37.54&lon=-77.44&miles=25' })).json();
  assert.equal(near.reports[0].source, 'family');
  assert.ok(near.reports.some((r) => r.source === 'nws'));
  const box = (await app.inject({ url: '/api/reports?south=37&west=-78&north=38&east=-77' })).json();
  assert.equal(box.reports.length, 3);

  const del = await app.inject({ method: 'DELETE', url: `/api/reports/${encodeURIComponent(rep.id)}`, headers: { cookie } });
  assert.equal(del.statusCode, 200);
  await app.close();
});

test('flood and fire routes', async () => {
  const fetchImpl = mockFetch({
    'api.water.noaa.gov/nwps/v1/gauges': () => json({ gauges: [{ lid: 'RMDV2', name: 'James River', latitude: 37.56, longitude: -77.54, status: { observed: { primary: 20, floodCategory: 'moderate' } } }] }),
    Day1_Latest: () => json({ features: [{ properties: { OUTLOOK: 'Slight' }, geometry: { type: 'Polygon', coordinates: [[[-80, 35], [-75, 35], [-75, 40], [-80, 40], [-80, 35]]] } }] }),
    Day2_Latest: () => new Response('nope', { status: 500 }),
    WFIGS_Incident_Locations_Current: () => json({ features: [{ geometry: { type: 'Point', coordinates: [-78, 37.5] }, properties: { IncidentName: 'Test', IncidentSize: 50, IncidentTypeCategory: 'WF' } }] }),
  });
  const { app } = await testApp({ fetchImpl });
  const f = (await app.inject({ url: '/api/flood?lat=37.54&lon=-77.44' })).json();
  assert.equal(f.gauges[0].category, 'moderate');
  assert.equal(f.outlook.today.id, 'slight');
  assert.equal(f.outlook.tomorrow, null, 'day 2 down: shown as unavailable');
  const fires = (await app.inject({ url: '/api/fires/near?lat=37.54&lon=-77.44' })).json();
  assert.equal(fires.fires[0].name, 'Test Fire');
  assert.equal(fires.windFrom, 180);
  const box = (await app.inject({ url: '/api/rivers?south=37&west=-78&north=38&east=-77' })).json();
  assert.equal(box.total, 1);
  await app.close();
});
