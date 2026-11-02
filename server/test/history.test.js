import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch } from './helpers.js';
import { compactArchive, analyzeDay, nearestThreadEx, acisNumber, archiveUrl, inUS, dateLabel } from '../src/providers/history.js';

// A synthetic ERA5 archive, 1940 through last year: a seasonal curve (°C) that
// warms 1 °C over the period, rain every 4th day and one big snow.
function fakeArchive({ lastYear = new Date().getUTCFullYear() - 1, hotDay = null } = {}) {
  const time = [];
  const hi = [];
  const lo = [];
  const pr = [];
  const sn = [];
  const code = [];
  const start = Date.UTC(1940, 0, 1);
  const end = Date.UTC(lastYear, 11, 31);
  for (let ms = start, i = 0; ms <= end; ms += 86_400_000, i++) {
    const d = new Date(ms);
    const iso = d.toISOString().slice(0, 10);
    const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
    const warm = (d.getUTCFullYear() - 1940) / (lastYear - 1940);
    const base = 12 - 12 * Math.cos(((doy - 15) / 365) * 2 * Math.PI) + warm;
    time.push(iso);
    hi.push(hotDay && iso === hotDay ? 35 : Math.round((base + 6) * 10) / 10);
    lo.push(Math.round((base - 4) * 10) / 10);
    pr.push(i % 4 === 0 ? 5 : 0);
    sn.push(iso === '1950-11-02' ? 20 : 0);
    code.push(i % 4 === 0 ? 63 : 1);
  }
  return { daily: { time, temperature_2m_max: hi, temperature_2m_min: lo, precipitation_sum: pr, snowfall_sum: sn, weather_code: code } };
}

test('archive URL asks for all years in metric', () => {
  const u = new URL(archiveUrl({ lat: 37.5, lon: -77.4 }, 2025));
  assert.equal(u.host, 'archive-api.open-meteo.com');
  assert.equal(u.searchParams.get('start_date'), '1940-01-01');
  assert.equal(u.searchParams.get('end_date'), '2025-12-31');
  assert.equal(u.searchParams.get('temperature_unit'), null);
});

test('analyzeDay finds every past year, records, normals and the trend', () => {
  const arc = compactArchive(fakeArchive({ lastYear: 2025, hotDay: '1974-11-02' }));
  const day = analyzeDay(arc, { monthDay: '11-02', thisYear: 2026, units: 'imperial', today: { high: 70, low: 50 } });
  assert.equal(day.label, 'November 2');
  assert.equal(day.years.length, 2025 - 1940 + 1);
  assert.equal(day.years[0].year, 2025);
  assert.equal(day.since, 1940);
  assert.deepEqual(day.records.warmestHigh, { value: 95, year: 1974 });
  assert.equal(day.records.snowiest.year, 1950);
  assert.ok(Math.abs(day.records.snowiest.value - 7.87) < 0.01);
  assert.ok(day.normal.high > 55 && day.normal.high < 70, `normal high ${day.normal.high}`);
  assert.ok(day.normal.rainChance >= 20 && day.normal.rainChance <= 30, `rain chance ${day.normal.rainChance}`);
  assert.ok(day.trend.change > 1, 'warming shows up');
  assert.equal(day.decades[0].decade, 1940);
  assert.equal(day.decades.at(-1).decade, 2020);
  assert.ok(day.compare.diff > 0);
  assert.equal(day.compare.of, day.years.length);
  assert.ok(day.compare.warmerThan >= day.years.length - 1);
  assert.equal(day.official, null);
  assert.match(day.kid.headline, /70 degrees/);
  assert.ok(day.kid.facts.some((f) => /1974/.test(f.text)));
  assert.ok(day.kid.facts.some((f) => /snowed/.test(f.text)));
});

test('a record-breaking forecast is called out, in metric too', () => {
  const arc = compactArchive(fakeArchive({ lastYear: 2025, hotDay: '1974-11-02' }));
  const day = analyzeDay(arc, { monthDay: '11-02', thisYear: 2026, units: 'metric', today: { high: 36, low: 10 } });
  assert.equal(day.units.temp, '°C');
  assert.equal(day.records.warmestHigh.value, 35);
  assert.equal(day.compare.record, 'record-high');
  assert.match(day.kid.headline, /hottest November 2 ever/);
  const near = analyzeDay(arc, { monthDay: '11-02', thisYear: 2026, units: 'metric', today: { high: 34.5, low: 10 } });
  assert.equal(near.compare.record, 'near-record-high');
});

test('leap day only counts leap years, and New Year windows wrap', () => {
  const arc = compactArchive(fakeArchive({ lastYear: 2025 }));
  const leap = analyzeDay(arc, { monthDay: '02-29', thisYear: 2028, units: 'metric' });
  assert.ok(leap.years.every((y) => y.year % 4 === 0));
  assert.equal(leap.years.length, 22);
  const ny = analyzeDay(arc, { monthDay: '01-01', thisYear: 2026, units: 'metric' });
  assert.equal(ny.years.length, 86);
  // A window across Dec 31 still finds a winter normal, not an empty one.
  assert.ok(ny.normal.high < 8);
});

test('ACIS helpers: nearest ThreadEx station and value parsing', () => {
  const meta = { meta: [
    { name: 'Far', sids: ['FARthr 9'], ll: [-76.0, 37.0], valid_daterange: [['1890-01-01', '2026-10-01']] },
    { name: 'Richmond Area', sids: ['RIC 3', 'RICthr 9'], ll: [-77.32, 37.51], valid_daterange: [['1897-01-01', '2026-10-01']] },
    { name: 'Coop', sids: ['447201 2'], ll: [-77.46, 37.55] },
  ] };
  assert.deepEqual(nearestThreadEx(meta, { lat: 37.55, lon: -77.46 }), { sid: 'RICthr', name: 'Richmond Area', km: 13, since: 1897 });
  assert.equal(nearestThreadEx({ meta: [] }, { lat: 37, lon: -77 }), null);
  assert.equal(acisNumber('M'), null);
  assert.equal(acisNumber('T'), 0.001);
  assert.equal(acisNumber('65A'), 65);
  assert.ok(inUS({ lat: 37.5, lon: -77.4 }));
  assert.ok(!inUS({ lat: 51.5, lon: -0.1 }));
  assert.equal(dateLabel('07-04'), 'July 4');
});

function acisMock(monthDay) {
  return (u) => {
    const params = JSON.parse(new URL(u).searchParams.get('params'));
    if (u.includes('StnMeta')) return Response.json({ meta: [{ name: 'Richmond Area', sids: ['RICthr 9'], ll: [-77.32, 37.51], valid_daterange: [['1897-01-01', '2026-10-01']] }] });
    if (params.elems[0].normal) return Response.json({ meta: { name: 'Richmond Area' }, data: [[params.sdate, '66.0', '43.0', '0.11']] });
    const first = Number(params.sdate.slice(0, 4));
    const last = Number(params.edate.slice(0, 4));
    const data = [];
    for (let y = first; y <= last; y++) data.push([`${y}-${monthDay}`, y === 1961 ? '84' : '66', y === 1910 ? '19' : 'M', y === 1955 ? '2.40' : 'T', '0.0']);
    return Response.json({ meta: { name: 'Richmond Area' }, data });
  };
}

test('GET /api/history/today blends official US records with ERA5 years', async () => {
  const local = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const md = local.slice(5);
  const arc = fakeArchive();
  const fetchImpl = mockFetch({ 'archive-api.open-meteo.com': () => Response.json(arc), 'rcc-acis.org': acisMock(md) });
  const { app } = await testApp({ fetchImpl });
  const res = await app.inject('/api/history/today?lat=37.55&lon=-77.46&units=imperial');
  assert.equal(res.statusCode, 200, res.body);
  const h = res.json();
  assert.equal(h.monthDay, md);
  assert.equal(h.official.station.name, 'Richmond Area');
  assert.equal(h.official.station.since, 1897);
  if (md !== '02-29') {
    assert.deepEqual(h.records.warmestHigh, { value: 84, year: 1961 });
    assert.deepEqual(h.records.coldestLow, { value: 19, year: 1910 });
    assert.deepEqual(h.records.wettest, { value: 2.4, year: 1955 });
    assert.equal(h.normal.high, 66);
  }
  assert.ok(h.reanalysis.records.warmestHigh, 'ERA5 records are kept alongside');
  // The year list starts when the station does and uses its numbers.
  assert.equal(h.since, 1897);
  assert.equal(h.years.at(-1).year, 1897);
  assert.equal(h.years.at(-1).source, 'station');
  assert.equal(h.years.at(-1).icon, null);
  if (md !== '02-29') assert.equal(h.years.find((y) => y.year === 1961).high, 84);
  assert.ok(h.years.find((y) => y.year === 1961).icon, 'ERA5 still gives the sky');
  assert.equal(h.compare.of, h.years.filter((y) => y.high != null).length);
  assert.equal(h.today.high, 78);
  assert.match(h.source, /NOAA ACIS/);
  // Cached: a second ask does not download 86 years again.
  const before = fetchImpl.calls.filter((c) => c.url.includes('archive-api')).length;
  await app.inject('/api/history/today?lat=37.551&lon=-77.459&units=metric');
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('archive-api')).length, before);
  await app.close();
});

test('history still works when ACIS is down or the place is outside the US', async () => {
  const fetchImpl = mockFetch({
    'archive-api.open-meteo.com': () => Response.json(fakeArchive()),
    'rcc-acis.org': () => new Response('nope', { status: 503 }),
  });
  const { app } = await testApp({ fetchImpl });
  const us = await app.inject('/api/history/today?lat=37.55&lon=-77.46');
  assert.equal(us.statusCode, 200, us.body);
  assert.equal(us.json().official, null);
  const uk = await app.inject('/api/history/today?lat=51.5&lon=-0.12&units=metric');
  assert.equal(uk.statusCode, 200);
  assert.ok(!fetchImpl.calls.some((c) => c.url.includes('rcc-acis') && c.url.includes('51.')), 'no ACIS call outside the US');
  await app.close();

  const down = await testApp({ fetchImpl: mockFetch({ 'archive-api.open-meteo.com': () => new Response('x', { status: 500 }) }) });
  assert.equal((await down.app.inject('/api/history/today?lat=37.55&lon=-77.46')).statusCode, 502);
  await down.app.close();
});
