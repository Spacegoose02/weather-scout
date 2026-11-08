import test from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch } from './helpers.js';
import { FeedHealth, feedFor } from '../src/feedhealth.js';
import { LiveHub, alertChange, sseLine } from '../src/live.js';
import { normalizeMarine, seaWord, probePoints, marineUrl } from '../src/marine.js';
import { parseSurge, parseWindOdds, townQuery, productText } from '../src/hurricane.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ---- feed health --------------------------------------------------------------
test('every upstream call is noted per feed, and a failure marks the feed down until it works again', async () => {
  let t = 1_000_000;
  const h = new FeedHealth({ now: () => t });
  const f = h.wrap(async (u) => {
    t += 120;
    if (u.includes('fail')) throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    return new Response('{}', { status: u.includes('missing') ? 404 : u.includes('err') ? 503 : 200 });
  });
  await f('https://api.open-meteo.com/v1/forecast?x');
  await f('https://mesonet.agron.iastate.edu/missing.png'); // a 404 probe is an answer
  await f('https://api.weather.gov/err');
  await assert.rejects(f('https://www.nhc.noaa.gov/fail'));
  const r = Object.fromEntries(h.report().map((x) => [x.id, x]));
  assert.equal(r.forecast.state, 'ok');
  assert.equal(r.forecast.medianMs, 120);
  assert.equal(r.iem.state, 'ok');
  assert.equal(r.nws.state, 'down');
  assert.equal(r.nws.lastError, 'HTTP 503');
  assert.equal(r.nhc.lastError, 'timed out');
  assert.equal(h.report()[0].state, 'down'); // problems first
  await f('https://api.weather.gov/ok');
  assert.equal(Object.fromEntries(h.report().map((x) => [x.id, x])).nws.state, 'slow'); // working, but failed this hour
  assert.deepEqual(feedFor('https://example.org/a'), { id: 'example.org', name: 'example.org' });
});

test('/api/status is open and lists the feeds the server has used', async () => {
  const { app } = await testApp({ env: { AUTH_REQUIRED: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'long-password-123' } });
  await app.inject({ url: '/api/config' });
  const r = await app.inject({ url: '/api/status' });
  assert.equal(r.statusCode, 200);
  assert.ok(['ok', 'some-slow', 'some-down'].includes(r.json().overall));
  assert.equal(r.json().keys.airnow, false);
  await app.close();
});

// ---- live updates -------------------------------------------------------------
test('the live hub checks each place once a tick and tells only that place about new and ended alerts', async () => {
  let list = [{ id: 'a', event: 'Wind Advisory', severity: 'Minor' }];
  let calls = 0;
  let cell = null;
  const hub = new LiveHub({ alerts: async () => { calls++; return { alerts: list }; }, storm: async () => cell, intervalMs: 1e9, heartbeatMs: 1e9 });
  const got = { a: [], b: [] };
  const mk = (k, lat) => ({ place: { lat, lon: -93 }, send: (t) => got[k].push(t) });
  hub.add(mk('a', 45));
  hub.add(mk('a', 45));
  hub.add(mk('b', 40));
  await hub.tick();
  assert.equal(calls, 2); // two places, three clients
  assert.equal(got.a.length, 0); // first look is the baseline
  list = [{ id: 'b', event: 'Tornado Warning', severity: 'Extreme' }];
  cell = { id: 'MPX-B4', level: 'hail', threat: { eta: 20 }, moving: 'E' };
  await hub.tick();
  assert.equal(got.a.length, 4); // alerts + storm, to both clients at place a
  assert.match(got.a[0], /^event: alerts\ndata: .*"added":\[\{"id":"b","event":"Tornado Warning"/);
  assert.equal(got.a.filter((x) => x.startsWith("event: storm\n")).length, 2);
  await hub.tick(); // nothing changed
  assert.equal(got.a.length, 4);
  hub.closeAll();
  assert.equal(hub.clients.size, 0);
  assert.deepEqual(alertChange([{ id: 1, event: 'X' }], []), { added: [], ended: [{ id: 1, event: 'X' }] });
  assert.equal(sseLine('x', { a: 1 }), 'event: x\ndata: {"a":1}\n\n');
});

test('/api/live streams a hello right away', async () => {
  const { app } = await testApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = app.server.address().port;
  const ctl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/api/live?lat=44.98&lon=-93.27`, { signal: ctl.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = Buffer.from(value).toString();
  assert.match(text, /retry: 15000/);
  assert.match(text, /event: hello/);
  assert.equal(app.liveHub.clients.size, 1);
  ctl.abort();
  await app.close();
});

// ---- marine -------------------------------------------------------------------
test('marine waves, sea words and the zone search pattern', () => {
  const m = normalizeMarine({ latitude: 25.7, longitude: -80.1, current: { wave_height: 3.28, wave_period: 7.1, wave_direction: 90, swell_wave_height: 2, sea_surface_temperature: 81.4 }, daily: { time: ['2026-11-08'], wave_height_max: [4.1], wave_period_max: [8], swell_wave_height_max: [2.5], wave_direction_dominant: [95] } });
  assert.equal(m.now.waveHeight, 3.3);
  assert.equal(m.now.water, 81);
  assert.equal(m.days[0].waveMax, 4.1);
  assert.equal(normalizeMarine({ current: { wave_height: null }, daily: { wave_height_max: [null] } }), null); // inland
  assert.equal(seaWord(3.3).id, 'moderate');
  assert.equal(seaWord(0.5, 'metric').id, 'small');
  assert.equal(probePoints({ lat: 40, lon: -70 }).length, 25);
  assert.match(marineUrl({ lat: 1, lon: 2 }, 'imperial'), /length_unit=imperial/);
});

test('/api/marine finds the nearest zone, its forecast, hazards and waves', async () => {
  const fetchImpl = mockFetch({
    'zones?type=coastal&point=25.7700,-80.1900': () => json({ features: [] }),
    'zones?type=coastal&point=': () => json({ features: [{ id: 'https://api.weather.gov/zones/coastal/AMZ651', properties: { id: 'AMZ651', name: 'Coastal waters from Jupiter Inlet to Deerfield Beach' } }] }),
    'zones/coastal/AMZ651/forecast': () => json({ properties: { periods: [{ name: 'Today', detailedForecast: 'East winds 15 to 20 kt. Seas 4 to 6 ft.' }] } }),
    'alerts/active?zone=AMZ651': () => json({ features: [{ id: 'sca', properties: { id: 'sca', event: 'Small Craft Advisory', severity: 'Minor', headline: 'Small Craft Advisory until 8 PM' } }] }),
    'api.weather.gov/alerts': () => json({ features: [{ id: 'rip', properties: { id: 'rip', event: 'Rip Current Statement', severity: 'Moderate' } }] }),
    'marine-api.open-meteo.com': () => json({ current: { wave_height: 5.2, wave_period: 8, sea_surface_temperature: 80 }, daily: { time: ['2026-11-08'], wave_height_max: [6] } }),
  });
  const { app } = await testApp({ fetchImpl });
  const r = (await app.inject({ url: '/api/marine?lat=25.77&lon=-80.19' })).json();
  assert.equal(r.available, true);
  assert.equal(r.zone.id, 'AMZ651');
  assert.match(r.forecast[0].text, /Seas 4 to 6 ft/);
  assert.deepEqual(r.hazards.map((h) => h.event), ['Small Craft Advisory', 'Rip Current Statement']);
  assert.equal(r.rip, true);
  assert.equal(r.sea.id, 'rough');
  await app.close();
});

test('/api/marine says so when there is no water nearby', async () => {
  const fetchImpl = mockFetch({
    'zones?type=coastal': () => json({ features: [] }),
    'marine-api.open-meteo.com': () => json({ current: {}, daily: {} }),
  });
  const { app } = await testApp({ fetchImpl });
  const r = (await app.inject({ url: '/api/marine?lat=44.98&lon=-93.27' })).json();
  assert.equal(r.available, false);
  await app.close();
});

// ---- hurricanes ---------------------------------------------------------------
const ADVISORY = `<html><pre>
BULLETIN
Hurricane Milton Advisory Number  18

STORM SURGE:  The combination of a life-threatening storm surge and
the tide will cause normally dry areas near the coast to be flooded
by rising waters moving inland from the shoreline.  The water could
reach the following heights above ground somewhere in the indicated
areas if the peak surge occurs at the time of high tide...

Anclote River FL to Englewood FL...10-15 ft
Tampa Bay...10-15 ft
Englewood FL to Bonita Beach FL, including Charlotte
Harbor...8-12 ft
Dry Tortugas...1-2 ft
Flamingo FL to Chokoloskee FL...4-6 ft

WIND:  Hurricane conditions are expected within the warning area.
</pre></html>`;

const PWS = `<pre>
                         FROM    FROM    FROM    FROM    FROM    FROM    FROM
  TIME       12Z TUE  00Z WED  12Z WED  00Z THU  12Z THU  12Z FRI  12Z SAT
PERIODS         TO       TO       TO       TO       TO       TO       TO
               00Z WED  12Z WED  00Z THU  12Z THU  12Z FRI  12Z SAT  12Z SUN

FORECAST HOUR    (12)   (24)     (36)     (48)     (72)     (96)    (120)
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
LOCATION       KT

TAMPA FL       34  2  12(14)  70(84)   8(92)   X(92)   X(92)   X(92)
TAMPA FL       50  X   2( 2)  55(57)  10(67)   X(67)   X(67)   X(67)
TAMPA FL       64  X   X( X)  38(38)   9(47)   X(47)   X(47)   X(47)

FT MYERS FL    34  1   8( 9)  60(69)   5(74)   X(74)   X(74)   X(74)
FT MYERS FL    50  X   1( 1)  30(31)   X(31)   X(31)   X(31)   X(31)
FT MYERS FL    64  X   X( X)  12(12)   X(12)   X(12)   X(12)   X(12)

GRAND BAHAMA   34  X   X( X)   X( X)   2( 2)   1( 3)   X( 3)   X( 3)
</pre>`;

test('surge heights and wind odds are read from NHC text products', () => {
  const surge = parseSurge(productText(ADVISORY));
  assert.equal(surge.length, 5);
  assert.deepEqual(surge[0], { area: 'Anclote River FL to Englewood FL', low: 10, high: 15 });
  assert.equal(surge.find((s) => /Charlotte Harbor/.test(s.area)).high, 12);
  assert.deepEqual(parseSurge('no surge here'), []);
  const odds = parseWindOdds(productText(PWS));
  const tampa = odds.find((o) => o.name === 'TAMPA FL');
  assert.deepEqual(tampa, { name: 'TAMPA FL', p34: 92, p50: 67, p64: 47 });
  assert.equal(odds.find((o) => o.name === 'GRAND BAHAMA').p34, 3);
  assert.deepEqual(townQuery('FT MYERS FL'), { query: 'Fort Myers', state: 'Florida' });
  assert.deepEqual(townQuery('GRAND BAHAMA'), { query: 'Grand Bahama', state: null });
});

test('/api/tropics/impacts gives the nearest town\'s wind odds and the surge list for nearby storms', async () => {
  const fetchImpl = mockFetch({
    'CurrentStorms.json': () => json({ activeStorms: [{ id: 'al142026', binNumber: 'AT4', name: 'Milton', classification: 'HU', intensity: '105', latitudeNumeric: 25.5, longitudeNumeric: -85, publicAdvisory: { url: 'https://www.nhc.noaa.gov/text/MIATCPAT4.shtml' }, windSpeedProbabilities: { url: 'https://www.nhc.noaa.gov/text/MIAPWSAT4.shtml' } }] }),
    'MIATCPAT4': () => new Response(ADVISORY),
    'MIAPWSAT4': () => new Response(PWS),
    'geocoding-api': (u) => {
      const q = new URL(u).searchParams.get('name');
      const at = { Tampa: [27.95, -82.46], 'Fort Myers': [26.64, -81.87] }[q];
      return json({ results: at ? [{ name: q, admin1: 'Florida', country_code: 'US', latitude: at[0], longitude: at[1] }] : [] });
    },
  });
  const { app } = await testApp({ fetchImpl });
  const r = (await app.inject({ url: '/api/tropics/impacts?lat=27.9&lon=-82.5' })).json();
  assert.equal(r.storms.length, 1);
  const s = r.storms[0];
  assert.equal(s.name, 'Milton');
  assert.equal(s.wind.near.name, 'TAMPA FL');
  assert.equal(s.wind.near.p64, 47);
  assert.equal(s.surge[0].high, 15);
  const far = (await app.inject({ url: '/api/tropics/impacts?lat=61&lon=-150' })).json();
  assert.equal(far.storms.length, 0);
  await app.close();
});
