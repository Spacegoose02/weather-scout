import test from 'node:test';
import assert from 'node:assert/strict';
import { snowTotals, roadIce, snowDayOdds, nextSchoolMorning, snowText, snowDayWord } from '../../shared/winter.js';
import { nextRain, nextRainShort, nextRainText } from '../../shared/glance.js';
import { samplePoints, pointHazard, tripWeather, routeUrl } from '../src/trip.js';
import { testApp, mockFetch } from './helpers.js';

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const HOUR = 3600_000;
const OFF = -18000; // US Eastern standard time
// Thursday 2026-11-05 22:00 local (Friday 03:00 UTC).
const NOW = Date.parse('2026-11-06T03:00:00Z');
const local = (ms) => new Date(ms + OFF * 1000).toISOString().slice(0, 16);

// 36 hours starting now, each hour set by `f(i, localTime)`.
function fc(f, { units = { temp: '°F' }, recent = { precipLast6h: 0 } } = {}) {
  const hourly = Array.from({ length: 36 }, (_, i) => {
    const epoch = NOW + i * HOUR;
    const time = local(epoch);
    return { epoch, time, temp: 30, feelsLike: 25, precip: 0, snow: 0, code: 3, ...f(i, time) };
  });
  return { utcOffsetSeconds: OFF, units, hourly, daily: [{ date: '2026-11-05', snowTotal: 2 }, { date: '2026-11-06', snowTotal: 4 }], recent };
}

test('snow totals and words', () => {
  const f = fc((i) => (i >= 2 && i < 10 ? { snow: 0.5, code: 73, precip: 0.05 } : {}));
  const s = snowTotals(f, NOW);
  assert.equal(s.next24, 4);
  assert.equal(s.week, 6);
  assert.equal(s.start, local(NOW + 2 * HOUR));
  assert.equal(snowText(4, 'in'), 'about 4 inches');
  assert.equal(snowText(0.3, 'in'), 'a dusting (under ½ inch)');
  assert.equal(snowText(5, 'cm'), 'about 5 cm');
});

test('road ice: freezing rain, then wet roads refreezing', () => {
  const f = fc((i) => (i === 1 ? { code: 66, precip: 0.05, temp: 31 } : i === 3 ? { code: 61, precip: 0.1, temp: 36 } : i === 6 ? { temp: 31 } : { temp: 38 }));
  const r = roadIce(f, NOW);
  assert.equal(r.level, 'high');
  assert.equal(r.worst.why, 'freezing rain or sleet');
  const refreeze = r.hours.find((h) => h.why === 'wet roads refreezing');
  assert.ok(refreeze, 'rain at hour 3, below freezing at hour 6');
  assert.equal(roadIce(fc(() => ({ temp: 45 })), NOW).level, 'none');
});

test('snow day odds for the next school morning', () => {
  assert.deepEqual(nextSchoolMorning(NOW, OFF), { date: '2026-11-06', name: 'tomorrow' });
  // Friday 23:00 local -> next school day is Monday.
  assert.equal(nextSchoolMorning(Date.parse('2026-11-07T04:00:00Z'), OFF).name, 'Monday');
  // Before 7 AM on a weekday it is today.
  assert.equal(nextSchoolMorning(Date.parse('2026-11-06T10:00:00Z'), OFF).name, 'today');

  // 6 inches overnight, mostly after 3 AM.
  const big = snowDayOdds(fc((i, t) => (t >= '2026-11-06T01:00' && t <= '2026-11-06T06:00' ? { snow: 1, code: 75 } : {})), NOW);
  assert.equal(big.name, 'tomorrow');
  assert.ok(big.chance >= 80, `got ${big.chance}`);
  assert.match(big.reason, /about 6 inches/);
  assert.equal(snowDayWord(big.chance), 'Very likely');
  const none = snowDayOdds(fc(() => ({ temp: 40, feelsLike: 38 })), NOW);
  assert.equal(none.chance, 0);
  assert.equal(snowDayWord(0), 'School as usual');
  const ice = snowDayOdds(fc((i, t) => (t === '2026-11-06T05:00' ? { code: 67, precip: 0.05 } : {})), NOW);
  assert.ok(ice.ice);
  assert.ok(ice.chance >= 30);
});

test('rain countdown for widgets', () => {
  assert.equal(nextRain([{ precip: 0 }, { precip: 0.1, code: 61 }]).minutes, 15);
  assert.equal(nextRainShort([{ precip: 0 }, { precip: 0.1, code: 73 }]), 'Snow in 15 min');
  assert.equal(nextRainShort([{ precip: 0.2 }, { precip: 0 }]), 'Rain ends in 15 min');
  assert.equal(nextRainText([{ precip: 0 }]), 'No rain expected in the next 2 hours.');
  assert.equal(nextRain([]), null);
});

const route = {
  distance: 160934, // 100 miles
  duration: 5400, // 90 minutes
  geometry: { type: 'LineString', coordinates: [[-77.44, 37.54], [-77.44, 38.0], [-77.44, 38.99]] },
};

test('trip: points along the route and hazards at each ETA', () => {
  const { points, miles, minutes } = samplePoints(route);
  assert.equal(miles, 100);
  assert.equal(minutes, 90);
  assert.equal(points.length, 4, 'start, every 30 minutes, end');
  assert.equal(points[0].minutes, 0);
  assert.equal(points.at(-1).minutes, 90);
  assert.ok(Math.abs(points.at(-1).lat - 38.99) < 0.01);
  assert.equal(pointHazard({ code: 66, precip: 0.1, temp: 31 }, 'imperial').id, 'ice');
  assert.equal(pointHazard({ code: 73, snow: 0.8 }, 'imperial').label, 'Heavy snow');
  assert.equal(pointHazard({ code: 45, visibility: 400 }, 'imperial').id, 'fog');
  assert.equal(pointHazard({ code: 0, gust: 20 }, 'imperial'), null);
  const t0 = Date.parse('2026-11-06T15:00:00Z');
  const hourly = (code, snow) => ({ hourly: { time: [0, 1, 2, 3].map((h) => (t0 + h * HOUR) / 1000), temperature_2m: [30, 30, 30, 30], precipitation: [0, 0, 0.1, 0.1], snowfall: [0, 0, snow, snow], weather_code: [3, 3, code, code], wind_gusts_10m: [10, 10, 10, 10], visibility: [20000, 20000, 20000, 20000] } });
  const stops = tripWeather([hourly(3, 0), hourly(3, 0), hourly(73, 0.6), hourly(73, 0.6)], points, t0, 'imperial');
  assert.equal(stops[0].hazard, null, 'dry at the start');
  assert.equal(stops[3].hazard.id, 'snow', 'snow by the time you get there');
  assert.match(routeUrl({ lat: 1, lon: 2 }, { lat: 3, lon: 4 }), /driving\/2\.00000,1\.00000;4\.00000,3\.00000/);
});

test('trip route and widget endpoints', async () => {
  const fetchImpl = mockFetch({
    'router.project-osrm.org': () => json({ code: 'Ok', routes: [route] }),
    'wind_gusts_10m%2Cvisibility': (url) => {
      const n = new URL(url).searchParams.get('latitude').split(',').length;
      const t = Math.floor(Date.now() / HOUR) * HOUR;
      return json(Array.from({ length: n }, () => ({ hourly: { time: [0, 1, 2, 3].map((h) => (t + h * HOUR) / 1000), temperature_2m: [40, 40, 40, 40], precipitation: [0, 0, 0, 0], snowfall: [0, 0, 0, 0], weather_code: [1, 1, 1, 1], wind_gusts_10m: [10, 10, 10, 10], visibility: [20000, 20000, 20000, 20000] } })));
    },
  });
  const { app } = await testApp({ fetchImpl });
  const r = await app.inject({ url: '/api/trip?fromLat=37.54&fromLon=-77.44&toLat=38.99&toLon=-77.44' });
  assert.equal(r.statusCode, 200, r.body);
  const trip = r.json();
  assert.equal(trip.stops.length, 4);
  assert.equal(trip.worst, null);
  assert.equal(trip.line.length, 3);
  const close = await app.inject({ url: '/api/trip?fromLat=37.54&fromLon=-77.44&toLat=37.541&toLon=-77.441' });
  assert.equal(close.statusCode, 400);

  const w = (await app.inject({ url: '/api/connect/widget' })).json();
  assert.ok(w.temp);
  assert.equal(w.rainSoon, 'Dry next 2 h');
  await app.close();

  const locked = await testApp({ env: { AUTH_REQUIRED: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct-horse-9' } });
  const no = await locked.app.inject({ url: '/api/connect/widget' });
  assert.equal(no.statusCode, 401);
  await locked.app.close();
});
