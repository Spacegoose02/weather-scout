import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { testApp, mockFetch } from './helpers.js';
import { pm25Aqi, purpleAirCorrect, sensorConsensus, aqiLevel } from '../../shared/aqi.js';
import { parseAirNow, parsePurpleAir, encodeSmoke, purpleAirUrl } from '../src/airsensors.js';
import { parsePerimeters } from '../src/hazards.js';
import { biasModel, biasFor, tuneHourly, yardText, forecastAt } from '../../shared/tuning.js';
import { BackyardTuning } from '../src/tuning.js';
import { dailyOdds, oddsHighlights, membersOf } from '../../shared/odds.js';
import { buildOdds, oddsUrl } from '../src/odds.js';
import { dbzToRate, estimateMotion, extrapolate, nowcastText, motionVector } from '../../shared/radarcast.js';
import { cropPng, blockGrid, RadarNowcast, frameUrl, windowFor, MOSAIC } from '../src/radarcast.js';
import { TtlCache } from '../src/cache.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ---- air ---------------------------------------------------------------------
test('PM2.5 turns into the 2024 US AQI, and PurpleAir readings get the EPA correction', () => {
  assert.equal(pm25Aqi(0), 0);
  assert.equal(pm25Aqi(9), 50);
  assert.equal(pm25Aqi(12), 56);
  assert.equal(pm25Aqi(35.4), 100);
  assert.equal(pm25Aqi(55.5), 151);
  assert.equal(pm25Aqi(400), 500);
  assert.equal(pm25Aqi(null), null);
  assert.equal(purpleAirCorrect(20, 50), 11.9);
  assert.equal(purpleAirCorrect(0, 90), 0); // never negative
  assert.ok(purpleAirCorrect(500, 30) > 300); // heavy smoke term
  assert.equal(aqiLevel(120).id, 'usg');
});

test('the AQI near you is the median of the closest sensors, official monitors counted twice', () => {
  const s = [
    { aqi: 40, miles: 1 }, { aqi: 45, miles: 2 }, { aqi: 300, miles: 3 }, // one broken sensor
    { aqi: 50, miles: 4, official: true }, { aqi: 90, miles: 40 },
  ];
  const c = sensorConsensus(s);
  assert.equal(c.aqi, 50);
  assert.equal(c.count, 4);
  assert.equal(c.official, true);
  assert.equal(sensorConsensus([{ aqi: 10, miles: 30 }]), null);
});

test('AirNow keeps one reading per area (PM2.5 first) and PurpleAir drops stale or low-confidence sensors', () => {
  const an = parseAirNow([
    { DateObserved: '2026-11-08 ', HourObserved: 14, LocalTimeZone: 'CST', ReportingArea: 'Minneapolis-St. Paul', StateCode: 'MN', Latitude: 44.98, Longitude: -93.27, ParameterName: 'O3', AQI: 30 },
    { DateObserved: '2026-11-08 ', HourObserved: 14, LocalTimeZone: 'CST', ReportingArea: 'Minneapolis-St. Paul', StateCode: 'MN', Latitude: 44.98, Longitude: -93.27, ParameterName: 'PM2.5', AQI: 61 },
  ], { lat: 44.98, lon: -93.27 });
  assert.equal(an.length, 1);
  assert.equal(an[0].aqi, 61);
  assert.equal(an[0].official, true);
  assert.equal(an[0].observed, '2026-11-08 14:00 CST');
  const now = Date.UTC(2026, 10, 8, 20);
  const pa = parsePurpleAir({
    fields: ['sensor_index', 'name', 'latitude', 'longitude', 'pm2.5_10minute', 'humidity', 'last_seen', 'confidence'],
    data: [
      [1, 'Backyard', 44.99, -93.25, 20, 50, now / 1000 - 300, 100],
      [2, 'Old', 44.99, -93.25, 20, 50, now / 1000 - 3 * 3600, 100],
      [3, 'Broken', 44.99, -93.25, 20, 50, now / 1000 - 300, 20],
    ],
  }, { lat: 44.98, lon: -93.27 }, now);
  assert.deepEqual(pa.map((s) => s.name), ['Backyard']);
  assert.equal(pa[0].pm25, 11.9);
  assert.equal(pa[0].aqi, pm25Aqi(11.9));
  assert.match(purpleAirUrl({ south: 44, north: 45, west: -94, east: -93 }), /nwlat=45.0000&nwlng=-94.0000&selat=44.0000&selng=-93.0000/);
});

test('/api/air/sensors is empty without keys and blends AirNow and PurpleAir with them', async () => {
  const { app } = await testApp();
  const none = (await app.inject({ url: '/api/air/sensors?lat=44.98&lon=-93.27' })).json();
  assert.deepEqual(none.sensors, []);
  assert.deepEqual(none.keys, { airnow: false, purpleair: false });
  await app.close();

  const now = Date.now() / 1000;
  const fetchImpl = mockFetch({
    'airnowapi.org/aq/observation': () => json([{ DateObserved: '2026-11-08', HourObserved: 9, ReportingArea: 'Minneapolis', StateCode: 'MN', Latitude: 44.98, Longitude: -93.27, ParameterName: 'PM2.5', AQI: 55 }]),
    'api.purpleair.com': (u, opts) => {
      assert.equal(opts.headers['X-API-Key'], 'pa-key');
      return json({ fields: ['sensor_index', 'name', 'latitude', 'longitude', 'pm2.5_10minute', 'humidity', 'last_seen', 'confidence'], data: [[7, 'Next door', 44.985, -93.272, 25, 40, now - 120, 100]] });
    },
  });
  const t = await testApp({ env: { AIRNOW_API_KEY: 'an-key', PURPLEAIR_API_KEY: 'pa-key' }, fetchImpl });
  const r = (await t.app.inject({ url: '/api/air/sensors?lat=44.98&lon=-93.27' })).json();
  assert.equal(r.sensors.length, 2);
  assert.equal(r.sensors[0].source, 'airnow');
  assert.ok(r.consensus.aqi >= 55);
  assert.match(r.source, /AirNow.*PurpleAir/);
  const zoomOut = (await t.app.inject({ url: '/api/air/sensors/box?south=20&north=50&west=-130&east=-60' })).json();
  assert.equal(zoomOut.zoomIn, true);
  await t.app.close();
});

test('the smoke layer is the model PM2.5 on a grid, as AQI', async () => {
  const fetchImpl = mockFetch({
    'current=pm2_5': (u) => {
      const n = new URL(u).searchParams.get('latitude').split(',').length;
      return json(Array.from({ length: n }, (_, i) => ({ current: { time: '2026-11-08T15:00', pm2_5: i === 0 ? 60 : 4 } })));
    },
  });
  const { app } = await testApp({ fetchImpl });
  const r = (await app.inject({ url: '/api/air/smoke?south=44&north=46&west=-95&east=-92' })).json();
  assert.equal(r.aqi.length, r.rows * r.cols);
  assert.equal(r.aqi[0], pm25Aqi(60));
  assert.equal(r.worst, pm25Aqi(60));
  assert.equal(r.time, '2026-11-08T15:00Z');
  await app.close();
  assert.throws(() => encodeSmoke([{}], { rows: 2, cols: 2 }), /Expected 4/);
});

test('fire perimeters come back as simplified polygons, only for zoomed-in views', async () => {
  const geo = { features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-120, 40], [-119.9, 40], [-119.9, 40.1], [-120, 40]]] }, properties: { poly_IncidentName: 'PARK', poly_GISAcres: 1234.5, attr_PercentContained: 40, attr_IrwinID: 'abc' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-120, 40] }, properties: {} },
  ] };
  const parsed = parsePerimeters(geo);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].properties, { id: 'abc', name: 'Park Fire', acres: 1235, contained: 40, updated: null });
  const { app } = await testApp({ fetchImpl: mockFetch({ WFIGS_Interagency_Perimeters_Current: (u) => { assert.match(u, /maxAllowableOffset=0.002/); return json(geo); } }) });
  const r = (await app.inject({ url: '/api/fires/perimeters?south=39&north=41&west=-121&east=-119' })).json();
  assert.equal(r.features.length, 1);
  const far = (await app.inject({ url: '/api/fires/perimeters?south=20&north=50&west=-130&east=-60' })).json();
  assert.equal(far.zoomIn, true);
  await app.close();
});

// ---- backyard tuning -----------------------------------------------------------
const H = 3600_000;
function yardSamples(now, days = 3) {
  const out = [];
  for (let t = now - days * 24 * H; t <= now - H; t += 15 * 60_000) {
    const hr = new Date(t).getUTCHours();
    out.push({ at: t, err: hr < 7 ? -4 : hr >= 12 && hr < 18 ? 2 : 0 });
  }
  return out;
}

test('the yard model learns a night/afternoon pattern and fades today\'s miss into it', () => {
  const now = Date.UTC(2026, 10, 8, 20);
  const s = yardSamples(now);
  s.push({ at: now - 10 * 60_000, err: 5 }); // the station is 5° warm right now
  const m = biasModel(s, { now });
  assert.equal(m.byHour[3], -4);
  assert.equal(m.byHour[14], 2);
  assert.ok(m.recent > 0);
  assert.ok(Math.abs(biasFor(m, now, { now }) - m.recent) < 0.01);
  // A day ahead, the time-of-day pattern wins.
  assert.ok(Math.abs(biasFor(m, now + 31 * H, { now }) - m.byHour[3]) < 0.2);
  assert.equal(yardText(m), 'Your yard runs about 4° cooler than the forecast at night and about 2° warmer than the forecast in the afternoon.');
  assert.match(yardText(biasModel([], { now })), /Learning/);
  // One day is not enough for a pattern.
  const oneDay = biasModel(yardSamples(now, 0.9), { now });
  assert.equal(oneDay.byHour[3], null);
});

test('tuned hours add the bias (scaled for metric) and forecastAt interpolates', () => {
  const now = Date.UTC(2026, 10, 8, 20);
  const hourly = [0, 1, 2].map((i) => ({ time: `2026-11-08T${20 + i}:00`, epoch: now + i * H, temp: 50 + i * 2 }));
  assert.equal(forecastAt(hourly, now + H / 2), 51);
  const m = { recent: 4, byHour: Array(24).fill(0), overall: 0 };
  const t = tuneHourly(hourly, m, { now });
  assert.equal(t[0].tuned, 54);
  assert.ok(t[2].tuned < 58);
  const c = tuneHourly([{ ...hourly[0], temp: 10 }], m, { now, units: 'metric' });
  assert.equal(c[0].tuned, 12); // 4°F is about 2°C
});

test('BackyardTuning stores samples from a fresh station and serves a tuned forecast near home', async () => {
  const db = new DatabaseSync(':memory:');
  const now = Date.UTC(2026, 10, 8, 20);
  const hourly = Array.from({ length: 48 }, (_, i) => ({ time: new Date(now - 6 * 3600_000 + i * H).toISOString().slice(0, 16), epoch: now - H + i * H, temp: 40 }));
  let station = { id: 'eco', name: 'Backyard', stale: false, current: { temp: 43 } };
  const t = new BackyardTuning(db, {
    stations: { primary: () => station },
    forecast: async () => ({ hourly, utcOffsetSeconds: -21600, units: { temp: '°F' } }),
    home: () => ({ lat: 44.98, lon: -93.27 }),
    now: () => now,
  });
  const s = await t.sample();
  assert.equal(s.obs - s.fc, 3);
  const r = await t.tuned({ lat: 44.99, lon: -93.28, units: 'imperial' });
  assert.equal(r.available, true);
  assert.equal(r.now.tuned, 43);
  assert.equal(r.learned.samples, 1);
  const far = await t.tuned({ lat: 40, lon: -100, units: 'imperial' });
  assert.equal(far.reason, 'far');
  station = { ...station, current: { temp: 99 } }; // a broken sensor is ignored
  assert.equal(await t.sample(), null);
  station = null;
  assert.equal(await t.sample(), null);
});

test('/api/forecast/backyard explains what is needed when no station reports', async () => {
  const { app } = await testApp({ env: { DEFAULT_LAT: '37.55', DEFAULT_LON: '-77.46' } });
  const r = (await app.inject({ url: '/api/forecast/backyard?lat=37.55&lon=-77.46' })).json();
  assert.equal(r.available, false);
  assert.equal(r.reason, 'no-station');
  await app.close();
});

// ---- forecast odds -------------------------------------------------------------
function fakeEnsemble({ members = 10, wet = 7 } = {}) {
  const time = Array.from({ length: 72 }, (_, i) => `2026-11-${String(8 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`);
  const hourly = { time };
  for (let m = 0; m < members; m++) {
    const suffix = m === 0 ? '' : `_member${String(m).padStart(2, '0')}`;
    // Day 2 (Nov 9): `wet` members bring 0.6 in of rain; lows at 30 for half of them.
    hourly[`precipitation${suffix}_ecmwf_ifs025`] = time.map((t) => (t.startsWith('2026-11-09') && m < wet ? 0.025 : 0));
    hourly[`temperature_2m${suffix}_ecmwf_ifs025`] = time.map((t) => (t.startsWith('2026-11-09') && m < members / 2 ? 30 : 45));
    hourly[`snowfall${suffix}_ecmwf_ifs025`] = time.map(() => 0);
  }
  hourly.precipitation_probability = time.map(() => 50); // must not count as a member
  return { utc_offset_seconds: -21600, hourly };
}

test('ensemble runs become daily chances, spreads and highlights', () => {
  const raw = fakeEnsemble();
  assert.equal(membersOf(raw.hourly, 'precipitation').length, 10);
  const { members, days } = dailyOdds(raw.hourly, { fromTime: '2026-11-08T00:00' });
  assert.equal(members, 10);
  const d = days.find((x) => x.date === '2026-11-09');
  assert.equal(d.chance.rain, 70);
  assert.equal(d.chance.soaking, 70);
  assert.equal(d.chance.heavy, 0);
  assert.equal(d.chance.freeze, 50);
  assert.equal(d.chance.gust, null); // no gust data in this run
  assert.equal(d.low.low, 30);
  const hl = oddsHighlights(days);
  assert.equal(hl[0].key, 'soaking');
  assert.equal(hl[0].text, '70% chance of at least half an inch of rain tomorrow');
  // A certain freeze is not news.
  assert.ok(!oddsHighlights([{ date: '2026-01-10', chance: { freeze: 100 } }]).length);
});

test('/api/forecast/odds pools ECMWF and GFS', async () => {
  const fetchImpl = mockFetch({ 'ensemble-api.open-meteo.com': (u) => { assert.match(u, /models=ecmwf_ifs025%2Cgfs_seamless/); return json(fakeEnsemble()); } });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject({ url: '/api/forecast/odds?lat=44.98&lon=-93.27' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().members, 10);
  assert.ok(res.json().days.length >= 1);
  await app.close();
  assert.throws(() => buildOdds({ hourly: {} }, 'imperial'), /not available/);
  assert.match(oddsUrl({ lat: 1, lon: 2, units: 'metric' }), /temperature_unit=celsius/);
});

// ---- radar nowcast -------------------------------------------------------------
function png(w, h, rowFn, { color = 3, filters = [0] } = {}) {
  const raw = Buffer.alloc((w + 1) * h);
  let prev = Buffer.alloc(w);
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const row = rowFn(y);
    const f = filters[y % filters.length];
    raw[y * (w + 1)] = f;
    for (let x = 0; x < w; x++) {
      const a = x ? row[x - 1] : 0;
      const b = prev[x];
      const c = x ? prev[x - 1] : 0;
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0;
      raw[y * (w + 1) + 1 + x] = (row[x] - pred) & 0xff;
    }
    prev = row;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = color;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('the PNG reader undoes every filter type and returns just the window', async () => {
  const w = 37;
  const h = 23;
  const value = (x, y) => (x * 7 + y * 13 + ((x * y) % 5)) & 0xff;
  const buf = png(w, h, (y) => Buffer.from(Array.from({ length: w }, (_, x) => value(x, y))), { filters: [0, 1, 2, 3, 4] });
  const c = await cropPng(buf, { x0: 5, x1: 30, y0: 3, y1: 19 });
  assert.equal(c.w, 25);
  assert.equal(c.h, 16);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) assert.equal(c.data[y * c.w + x], value(x + 5, y + 3));
  await assert.rejects(cropPng(png(4, 4, () => Buffer.alloc(4), { color: 2 }), { x0: 0, x1: 2, y0: 0, y1: 2 }), /Unsupported/);
});

test('motion is found by matching the two frames, then rain is slid forward to the place', () => {
  const w = 60;
  const h = 40;
  const blob = (cx) => ({ w, h, data: Float32Array.from({ length: w * h }, (_, i) => { const x = i % w; const y = Math.floor(i / w); return Math.hypot(x - cx, y - 20) < 5 ? 40 : NaN; }) });
  const a = blob(10);
  const b = blob(14); // moved 4 cells east in 10 minutes
  const m = estimateMotion(a, b);
  assert.deepEqual([m.dx, m.dy], [4, 0]);
  const perMin = { dx: 0.4, dy: 0 };
  const steps = extrapolate(b, 34, 20, perMin);
  // The blob's leading edge (x = 18.x) reaches x = 34 after ~(34 - 19) / 0.4 = 37 minutes.
  const first = steps.find((s) => s.rate > 0);
  assert.ok(first.min >= 30 && first.min <= 45, `first wet step at ${first.min}`);
  assert.match(nowcastText(steps), /^Heavy rain starting in about \d+ minutes(, lasting about \d+ minutes)?\.$/);
  assert.equal(nowcastText(extrapolate(b, 14, 20, null)), 'Rain for at least the next hour.');
  assert.equal(nowcastText(extrapolate(a, 50, 5, null), { snow: true }), 'No snow on radar for the next hour.');
  assert.equal(estimateMotion(blob(-50), blob(-50)), null); // nothing on radar
  assert.deepEqual(motionVector(perMin, { x: 1, y: 1 }), { heading: 90, mph: 24 });
  assert.equal(dbzToRate(10), 0);
  assert.ok(dbzToRate(40) > 10 && dbzToRate(40) < 13);
});

test('RadarNowcast reads two mosaics around a place and times the rain', async () => {
  const now = Date.UTC(2026, 10, 8, 18, 7);
  const place = { lat: 45, lon: -93, units: 'imperial' };
  const win = windowFor({ lat: 45, lon: -93 });
  const W = Math.round((MOSAIC.east - MOSAIC.west) / MOSAIC.res);
  const px = (lon, lat) => ({ x: (lon - MOSAIC.west) / MOSAIC.res, y: (MOSAIC.north - lat) / MOSAIC.res });
  const p = px(-93, 45);
  // A 40 dBZ blob 15 miles west of the place, moving east at 30 mph (5 miles in 10 minutes).
  const milesLon = 69.17 * Math.cos((45 * Math.PI) / 180) * MOSAIC.res;
  const frame = (westMiles) => png(W, win.y1, (y) => {
    const row = Buffer.alloc(W);
    if (y < win.y0) return row;
    const cx = p.x - westMiles / milesLon;
    for (let x = win.x0; x < win.x1; x++) {
      const dx = (x - cx) * milesLon;
      const dy = (y - p.y) * 69.17 * MOSAIC.res;
      if (Math.hypot(dx, dy) < 8) row[x] = (40 + 32.5) * 2;
    }
    return row;
  });
  const latest = frame(15);
  const older = frame(20);
  const fetchImpl = async (u) => {
    if (u === frameUrl(Date.UTC(2026, 10, 8, 18, 0))) return new Response(latest);
    if (u === frameUrl(Date.UTC(2026, 10, 8, 17, 50))) return new Response(older);
    return new Response('nope', { status: 404 });
  };
  const n = new RadarNowcast(new TtlCache(), fetchImpl, { now: () => now });
  const r = await n.forPlace(place);
  assert.equal(r.available, true);
  assert.equal(r.ageMin, 7);
  assert.ok(Math.abs(r.motion.heading - 90) <= 10, `heading ${r.motion.heading}`);
  assert.ok(Math.abs(r.motion.mph - 30) <= 6, `speed ${r.motion.mph}`);
  const first = r.steps.find((s) => s.rate > 0);
  // Leading edge 7 miles away at 30 mph = 14 minutes after the scan, 7 minutes already gone.
  assert.ok(first && first.min >= 0 && first.min <= 15, `first wet at ${first?.min}`);
  assert.match(r.text, /starting/);
  assert.equal(r.rateUnit, 'in/h');
  assert.equal((await n.forPlace({ lat: 61, lon: -150, units: 'imperial' })).reason, 'coverage');
});

test('/api/nowcast/radar falls back softly when the mosaics cannot be reached', async () => {
  const { app } = await testApp();
  const r = (await app.inject({ url: '/api/nowcast/radar?lat=44.98&lon=-93.27' })).json();
  assert.equal(r.available, false);
  assert.equal(r.reason, 'error');
  await app.close();
});
