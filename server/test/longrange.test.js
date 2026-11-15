import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCost, modelMapUrl, normalizeModelMap } from '../src/providers/modelmaps.js';
import { buildOutlook, longRangeUrl, lowsNear, summarizeEnsemble, tempWord } from '../src/longrange.js';
import {
  MAP_MODELS, callWeight, directionWord, fieldsOffered, gridFor, leadConfidence, legendFor, milesApart, modelsFor, patternColor, precipType, snowShare,
} from '../../shared/modelmap.js';
import { testApp, mockFetch } from './helpers.js';

const HOUR = 3600_000;
const ECMWF = MAP_MODELS.find((m) => m.id === 'ecmwf_ifs025');

const sizeOf = (u) => {
  const q = new URL(u).searchParams;
  const lats = q.get('latitude').split(',');
  const cols = lats.filter((x) => x === lats[0]).length;
  return { rows: lats.length / cols, cols };
};

// Six-hourly Open-Meteo answers for a grid, 16 days from yesterday. A low sits
// in the middle of the grid; it snows (thick 528 dam) in the top rows.
function fakeLongGrid({ rows, cols, days = 16 }) {
  const start = Math.floor(Date.now() / (6 * HOUR)) * 6 * HOUR - 24 * HOUR;
  const time = Array.from({ length: 4 * days }, (_, i) => (start + i * 6 * HOUR) / 1000);
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fill = (v) => time.map(() => v);
      const cold = r < 3;
      out.push({
        hourly: {
          time,
          temperature_2m: fill(cold ? 28 : 50),
          precipitation: fill(0.2),
          snowfall: fill(cold ? 1.4 : 0),
          pressure_msl: fill(1000 + 2 * (Math.abs(r - Math.floor(rows / 2)) + Math.abs(c - Math.floor(cols / 2)))),
          geopotential_height_500hPa: fill(cold ? 5300 : 5580),
          geopotential_height_1000hPa: fill(20),
        },
      });
    }
  }
  return out;
}

// One ensemble: `members` runs, hourly, `days` days in local time.
function fakeEnsemble({ members = 10, days = 15, high = () => 50, precip = () => 0, snow = () => 0, offset = -18000 } = {}) {
  const start = Math.floor(Date.now() / (24 * HOUR)) * 24 * HOUR;
  const n = 24 * days;
  const local = (ms) => new Date(ms + offset * 1000).toISOString().slice(0, 16);
  const time = Array.from({ length: n }, (_, i) => local(start + i * HOUR));
  const hourly = { time };
  for (let m = 0; m < members; m++) {
    const sfx = m === 0 ? '' : `_member${String(m).padStart(2, '0')}`;
    hourly[`temperature_2m${sfx}`] = time.map((_, i) => high(Math.floor(i / 24), m) - (i % 24 < 12 ? 10 : 0));
    hourly[`precipitation${sfx}`] = time.map((_, i) => (i % 24 === 12 ? precip(Math.floor(i / 24), m) : 0));
    hourly[`snowfall${sfx}`] = time.map((_, i) => (i % 24 === 12 ? snow(Math.floor(i / 24), m) : 0));
  }
  return { utc_offset_seconds: offset, hourly };
}

test('two-week map url: 6-hourly, as many days as the model runs, six variables', () => {
  const g = gridFor(37.55, -77.46, 'country');
  const u = new URL(modelMapUrl(ECMWF, g, 'imperial', undefined, 'long'));
  assert.equal(u.searchParams.get('forecast_days'), '15');
  assert.equal(u.searchParams.get('temporal_resolution'), 'hourly_6');
  assert.equal(u.searchParams.get('hourly').split(',').length, 6);
  assert.match(u.searchParams.get('hourly'), /geopotential_height_500hPa/);
  const gfs = new URL(modelMapUrl(MAP_MODELS.find((m) => m.id === 'gfs_seamless'), g, 'imperial', undefined, 'long'));
  assert.equal(gfs.searchParams.get('forecast_days'), '16');
  // Short maps keep hourly data and add snow and thickness.
  const short = new URL(modelMapUrl(ECMWF, g, 'imperial'));
  assert.equal(short.searchParams.get('temporal_resolution'), null);
  assert.match(short.searchParams.get('hourly'), /snowfall/);
  // Two weeks cost a little more of the free limit.
  assert.equal(mapCost(ECMWF, 100, 'short'), 100);
  assert.equal(mapCost(ECMWF, 100, 'long'), Math.ceil(100 * callWeight(6, 15)));
  assert.ok(!modelsFor('long').some((m) => m.id === 'gfs_hrrr'));
  // Two-week grids are thinner, so a 5-day map, a 2-week map and the outlook fit in one minute's budget.
  const thin = gridFor(37.55, -77.46, 'country', 'long');
  assert.equal(thin.rows * thin.cols, 119);
  assert.ok(275 + mapCost(ECMWF, 119, "long") + mapCost(MAP_MODELS[1], 119, "long") < 560);
  assert.deepEqual(fieldsOffered('long').map((f) => f.id), ['temp', 'precip', 'pressure', 'pattern']);
});

test('two-week map: steps 6 hours apart out to 15 days, with thickness and snow share', () => {
  const g = gridFor(37.55, -77.46, 'region');
  const m = normalizeModelMap(fakeLongGrid({ ...g, days: 17 }), ECMWF, g, 'imperial', Date.now(), 'long');
  assert.equal(m.step, 6);
  assert.equal(m.range, 'long');
  assert.equal(m.times[1] - m.times[0], 6 * HOUR);
  assert.equal(m.times.length, 15 * 4 + 1);
  assert.ok(m.times[0] <= Date.now() && m.times[0] > Date.now() - 6 * HOUR);
  assert.deepEqual(Object.keys(m.fields).sort(), ['precip', 'pressure', 'snow', 'temp', 'thick']);
  // Each 6-hour answer is already a 6-hour total.
  assert.equal(m.fields.precip[3][0], 0.2);
  assert.equal(m.fields.thick[0][0], 528);
  assert.equal(m.fields.thick[0][g.cols * 8], 556);
  assert.equal(m.fields.snow[0][0], 1); // 1.4 in. of snow from 0.2 in. of water
  assert.equal(m.fields.snow[0][g.cols * 8], 0);
});

test('precipitation type from snow share, ground temperature and thickness', () => {
  assert.equal(snowShare({ precip: 0, snowfall: 0 }, 'imperial'), null);
  assert.equal(snowShare({ precip: 0.1, snowfall: 0.7 }, 'imperial'), 1);
  assert.equal(snowShare({ precip: 2, snowfall: 0.7 }, 'metric'), 0.5);
  assert.equal(snowShare({ precip: 0.1, snowfall: 0.7, tempC: 6 }, 'imperial'), 0);
  // No snowfall from the model: the thickness decides.
  assert.equal(snowShare({ precip: 0.1, snowfall: null, thick: 532 }, 'imperial'), 1);
  assert.equal(snowShare({ precip: 0.1, snowfall: null, thick: 552 }, 'imperial'), 0);
  assert.equal(precipType(0.9, 25), 'snow');
  assert.equal(precipType(0.5, 30), 'sleet');
  assert.equal(precipType(0, 30), 'frzr');
  assert.equal(precipType(0, 40), 'rain');
  assert.equal(precipType(null, 40), 'rain');
  assert.equal(patternColor('snow', 0.001)[3], 0);
  const heavy = patternColor('snow', 10);
  assert.ok(heavy[2] > heavy[1] && heavy[3] >= 150);
  // Legend for 6-hour totals is labeled per 6 hours.
  const l = legendFor('pattern', 'imperial', 6);
  assert.equal(l.unit, 'in. in 6 h');
  assert.equal(l.ticks[0].v, 0.02);
});

test('how sure: pretty sure, good idea, just a hint', () => {
  assert.equal(leadConfidence(24).id, 'good');
  assert.equal(leadConfidence(5 * 24).id, 'fair');
  assert.equal(leadConfidence(11 * 24).id, 'hint');
  assert.equal(tempWord(10, 'imperial'), 'much warmer than usual');
  assert.equal(tempWord(-2, 'metric'), 'colder than usual');
  assert.equal(tempWord(1, 'imperial'), 'close to normal');
  assert.equal(directionWord({ lat: 37, lon: -77 }, { lat: 35, lon: -75 }), 'southeast');
  assert.ok(Math.abs(milesApart({ lat: 37, lon: -77 }, { lat: 38, lon: -77 }) - 69) < 1);
});

test('ensemble summary: spread of highs and the share of runs bringing rain or snow', () => {
  const raw = fakeEnsemble({ members: 10, high: (d, m) => 50 + m, precip: (d, m) => (d === 9 && m < 7 ? 0.3 : 0), snow: (d, m) => (d === 9 && m < 2 ? 2 : 0) });
  const e = summarizeEnsemble(raw, 'imperial');
  assert.equal(e.members, 10);
  assert.ok(e.days.length >= 13);
  const day = e.days.find((d) => d.wet > 0);
  assert.equal(day.wet, 70);
  assert.equal(day.snow, 20);
  assert.ok(day.high.p10 < day.high.p50 && day.high.p50 < day.high.p90);
});

test("Rocky's outlook: weeks vs normal, a storm to watch, and honest about week 2", () => {
  const ecmwf = summarizeEnsemble(fakeEnsemble({ members: 51, high: (d) => (d >= 8 ? 40 : 58), precip: (d, m) => (d === 10 && m < 40 ? 0.5 : 0), snow: (d, m) => (d === 10 && m < 10 ? 3 : 0) }), 'imperial');
  const gefs = summarizeEnsemble(fakeEnsemble({ members: 31, high: (d) => (d >= 8 ? 41 : 57), precip: (d, m) => (d === 10 && m < 15 ? 0.5 : 0) }), 'imperial');
  const normals = new Map(ecmwf.days.map((d) => [d.date, { high: 52 }]));
  const stormDay = ecmwf.days[10].date;
  const lows = new Map([[stormDay, { hPa: 1004, miles: 200, dir: 'southeast' }]]);
  const o = buildOutlook({ ecmwf, gefs, normals, lows, units: 'imperial' });
  assert.equal(o.weeks.length, 2);
  assert.equal(o.weeks[0].temp, 'warmer than usual');
  assert.equal(o.weeks[1].temp, 'much colder than usual');
  assert.equal(o.weeks[1].agree, true);
  assert.equal(o.weeks[1].confidence.id, 'hint');
  assert.equal(o.storms.length, 1);
  assert.equal(o.storms[0].date, stormDay);
  assert.equal(o.storms[0].wet, 78);
  assert.equal(o.storms[0].low.hPa, 1004);
  assert.match(o.rocky.headline, /storm to watch/);
  assert.match(o.rocky.text, /clues, not promises/);
  assert.match(o.rocky.text, /8 in 10 European runs bring rain or snow, and 5 in 10 American runs do/);
  assert.match(o.rocky.text, /low of 1004 mb\) about 200 miles southeast of you/);
  assert.equal(o.days[12].confidence, 'hint');
  // Without normals, Rocky still talks about the highs.
  const plain = buildOutlook({ ecmwf, units: 'imperial' });
  assert.equal(plain.hasNormals, false);
  assert.match(plain.rocky.text, /highs are mostly around 40°F/);
});

test('lows near the place on the two-week map', () => {
  const g = gridFor(37.55, -77.46, 'region');
  const m = normalizeModelMap(fakeLongGrid(g), ECMWF, g, 'imperial', Date.now(), 'long');
  const lows = lowsNear(m, { lat: 37.55, lon: -77.46 });
  assert.ok(lows.size >= 14);
  const first = [...lows.values()][0];
  assert.equal(first.hPa, 1000);
  assert.ok(first.miles <= 100);
  assert.equal(lowsNear(m, { lat: 60, lon: 10 }).size, 0);
});

test('/api/longrange: the outlook from both ensembles and the ECMWF two-week map', async () => {
  const { app, fetchImpl } = await testApp({
    fetchImpl: mockFetch({
      'ensemble-api.open-meteo.com': (u) => Response.json(u.includes('ecmwf')
        ? fakeEnsemble({ members: 51, precip: (d, m) => (d === 9 && m < 35 ? 0.4 : 0) })
        : fakeEnsemble({ members: 31, precip: (d, m) => (d === 9 && m < 10 ? 0.4 : 0) })),
      'temporal_resolution=hourly_6': (u) => Response.json(fakeLongGrid(sizeOf(u))),
      'archive-api.open-meteo.com': () => new Response('{}', { status: 500 }),
    }),
  });
  const r = await app.inject({ url: '/api/longrange?lat=37.55&lon=-77.46&place=Richmond' });
  assert.equal(r.statusCode, 200);
  const o = r.json();
  assert.equal(o.place, 'Richmond');
  assert.equal(o.members.ecmwf, 51);
  assert.equal(o.members.gefs, 31);
  assert.equal(o.hasNormals, false);
  assert.equal(o.storms.length, 1);
  assert.equal(o.storms[0].low, null); // the map's low is in Kansas, too far from Richmond
  assert.match(o.rocky.text, /Keep an eye on/);
  // The map behind it is shared with the Models tab's two-week map.
  const map = await app.inject({ url: '/api/modelmap?lat=37.55&lon=-77.46&model=ecmwf_ifs025&range=long' });
  assert.equal(map.statusCode, 200);
  assert.equal(map.json().step, 6);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('temporal_resolution=hourly_6')).length, 1);
  // HRRR doesn't go out two weeks.
  const hrrr = await app.inject({ url: '/api/modelmap?lat=37.55&lon=-77.46&model=gfs_hrrr&range=long' });
  assert.equal(hrrr.statusCode, 400);
});
