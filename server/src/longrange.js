// Rocky's two-week outlook (Models tab): what the long-range models hint at for
// this place, in plain words, with how sure we can be.
//
// Free sources, no keys:
// - Open-Meteo Ensemble API: the ECMWF ensemble (51 runs, 15 days, ECMWF open
//   data under CC-BY 4.0) and NOAA's GEFS (31 runs, GFS ensemble). Each run
//   starts from a slightly different guess of today's weather; where the runs
//   agree we can be surer, where they scatter it's only a hint.
// - The ECMWF two-week map (the same one the Models tab paints) for storm
//   centers (lows) passing near the place.
// - Open-Meteo Historical (ERA5) for the 1991-2020 normal high of each day, so
//   "warmer than usual" means something. Optional: without it Rocky compares
//   the two weeks with each other.
import { TtlCache, fetchJson } from './cache.js';
import { AiError } from './ai.js';
import * as history from './providers/history.js';
import { unitParams } from './providers/openmeteo.js';
import { defaultArea, directionWord, leadConfidence, milesApart, pressureCenters } from '../../shared/modelmap.js';

const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
export const DAYS = 15;
// Lows farther than this from the place aren't "near you".
const NEAR_MILES = 500;

export const ENSEMBLE_SOURCES = [
  { id: 'ecmwf_ifs025', name: 'ECMWF ensemble', short: 'European', members: 51 },
  { id: 'gfs_seamless', name: 'GFS ensemble (GEFS)', short: 'American', members: 31 },
];

export function longRangeUrl(id, { lat, lon, units }) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,precipitation,snowfall',
    models: id,
    forecast_days: String(DAYS),
    timezone: 'auto',
    ...unitParams(units),
  });
  return `${ENSEMBLE_URL}?${p}`;
}

const r1 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10) / 10);
const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const mean = (xs) => {
  const v = xs.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * One ensemble (every member's hourly temperature, rain and snow) -> a row per
 * day from today: spread of the highs, and the share of runs bringing rain
 * (any wet day) or snow.
 */
export function summarizeEnsemble(raw, units, now = Date.now()) {
  const h = raw?.hourly || {};
  const times = h.time || [];
  const membersOf = (v) => Object.keys(h).filter((k) => k === v || k.startsWith(`${v}_member`)).map((k) => h[k]);
  const temps = membersOf('temperature_2m');
  const precs = membersOf('precipitation');
  const snows = membersOf('snowfall');
  const metric = units === 'metric';
  const wet = metric ? 1 : 0.04; // a millimeter: enough to call it a wet day
  const snowy = metric ? 1 : 0.4; // about a centimeter of snow
  const today = new Date(now + (raw?.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 10);
  const byDay = new Map();
  times.forEach((t, i) => {
    const d = t.slice(0, 10);
    if (d < today) return;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  });
  const days = [];
  for (const [date, idx] of byDay) {
    if (idx.length < 12) continue; // a part day at the end of the run
    const highs = temps.map((m) => Math.max(...idx.map((i) => m[i] ?? -Infinity))).filter(Number.isFinite).sort((a, b) => a - b);
    if (highs.length < 3) continue;
    const totals = precs.map((m) => idx.reduce((s, i) => s + (m[i] || 0), 0));
    const snowTotals = snows.map((m) => idx.reduce((s, i) => s + (m[i] || 0), 0));
    days.push({
      date,
      high: { p10: r1(pct(highs, 0.1)), p50: r1(pct(highs, 0.5)), p90: r1(pct(highs, 0.9)) },
      wet: totals.length ? Math.round((100 * totals.filter((x) => x >= wet).length) / totals.length) : null,
      snow: snowTotals.length ? Math.round((100 * snowTotals.filter((x) => x >= snowy).length) / snowTotals.length) : null,
      precip: totals.length ? (metric ? r1(mean(totals)) : Math.round(mean(totals) * 100) / 100) : null,
    });
  }
  return { members: temps.length, days };
}

/**
 * The deepest low within NEAR_MILES of the place on each day of a two-week map.
 * Returns date (UTC) -> { hPa, miles, dir }.
 */
export function lowsNear(map, place) {
  const out = new Map();
  if (!map?.fields?.pressure) return out;
  map.times.forEach((t, i) => {
    const grid = map.fields.pressure[i];
    if (!grid) return;
    for (const c of pressureCenters(grid, map.rows, map.cols)) {
      if (c.kind !== 'L') continue;
      const at = { lat: map.lats[c.r], lon: map.lons[c.c] };
      const miles = milesApart(place, at);
      if (miles > NEAR_MILES) continue;
      const date = new Date(t).toISOString().slice(0, 10);
      const was = out.get(date);
      if (!was || c.v < was.hPa) out.set(date, { hPa: Math.round(c.v), miles: Math.round(miles / 25) * 25, dir: directionWord(place, at), time: t });
    }
  });
  return out;
}

export const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const tenths = (p) => Math.max(1, Math.round(p / 10));

/** "warmer than usual" and friends, from the difference with normal in the person's units. */
export function tempWord(diff, units) {
  if (diff == null) return null;
  const f = units === 'metric' ? diff * 1.8 : diff;
  if (f >= 9) return 'much warmer than usual';
  if (f >= 3) return 'warmer than usual';
  if (f <= -9) return 'much colder than usual';
  if (f <= -3) return 'colder than usual';
  return 'close to normal';
}

function weekOf(days, gefsByDate, normals, from, to, units) {
  const list = days.filter((_, i) => i >= from && i <= to);
  if (!list.length) return null;
  const anomaly = (d, high) => (normals?.get(d.date)?.high != null && high != null ? high - normals.get(d.date).high : null);
  const ec = mean(list.map((d) => anomaly(d, d.high.p50)));
  const us = mean(list.map((d) => anomaly(d, gefsByDate.get(d.date)?.high.p50)));
  const highs = list.map((d) => d.high.p50).filter((v) => v != null);
  const wettest = list.reduce((a, d) => ((d.wet ?? 0) > (a?.wet ?? -1) ? d : a), null);
  const snowiest = list.reduce((a, d) => ((d.snow ?? 0) > (a?.snow ?? -1) ? d : a), null);
  const tol = units === 'metric' ? 2 : 4;
  return {
    from: list[0].date,
    to: list[list.length - 1].date,
    highLow: highs.length ? Math.round(Math.min(...highs)) : null,
    highHigh: highs.length ? Math.round(Math.max(...highs)) : null,
    anomaly: r1(ec),
    gefsAnomaly: r1(us),
    temp: tempWord(ec, units),
    // Close together, or both clearly on the same side of normal.
    agree: ec != null && us != null ? Math.abs(ec - us) <= tol || (Math.sign(ec) === Math.sign(us) && Math.min(Math.abs(ec), Math.abs(us)) >= tol) : null,
    wettest: wettest && wettest.wet != null ? { date: wettest.date, wet: wettest.wet } : null,
    snowiest: snowiest && snowiest.snow >= 20 ? { date: snowiest.date, snow: snowiest.snow } : null,
    spread: r1(mean(list.map((d) => (d.high.p90 != null ? d.high.p90 - d.high.p10 : null)))),
    confidence: leadConfidence(to * 24),
  };
}

/**
 * Everything the outlook card shows, from the two ensembles, the normals
 * (date -> { high }), and the lows near the place on the ECMWF map.
 */
export function buildOutlook({ ecmwf, gefs = null, normals = null, lows = new Map(), units = 'imperial', place = '' }) {
  const days = ecmwf.days.slice(0, DAYS);
  if (!days.length) return null;
  const gefsByDate = new Map((gefs?.days || []).map((d) => [d.date, d]));
  const deg = units === 'metric' ? '°C' : '°F';
  const weeks = [
    { id: 'week1', label: 'Next 7 days', ...weekOf(days, gefsByDate, normals, 1, 7, units) },
    { id: 'week2', label: 'Week 2', ...weekOf(days, gefsByDate, normals, 8, 14, units) },
  ].filter((w) => w.from);

  // Storms to watch: wet days at least 3 days out where most runs agree, or a low passes close by.
  // A storm usually spans two days, so a low the day before or after counts too.
  const lowNear = (i) => [days[i], days[i + 1], days[i - 1]].map((d) => d && lows.get(d.date)).find(Boolean) || null;
  const storms = days.map((d, i) => {
    const low = lowNear(i);
    const score = (d.wet ?? 0) + (low ? 25 : 0) + (d.snow ?? 0) / 2;
    return { i, d, low, score };
  }).filter(({ i, d, low }) => i >= 3 && ((d.wet ?? 0) >= 50 || (low && (d.wet ?? 0) >= 30)))
    .sort((a, b) => b.score - a.score)
    // One storm, one entry: drop a day next to a stronger one already picked.
    .filter((x, k, all) => !all.slice(0, k).some((y) => Math.abs(y.i - x.i) === 1))
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map(({ i, d, low }) => ({
      date: d.date,
      day: i,
      wet: d.wet,
      snow: d.snow,
      gefsWet: gefsByDate.get(d.date)?.wet ?? null,
      gefsSnow: gefsByDate.get(d.date)?.snow ?? null,
      low,
      confidence: leadConfidence(i * 24),
    }));

  // What Rocky says.
  const s = [];
  s.push("Here's my two-week peek! The next few days I'm pretty sure about. Past a week, the models give us clues, not promises.");
  const [w1, w2] = weeks;
  if (w1) {
    const temp = w1.temp ? `${w1.temp}, ` : '';
    s.push(`The next 7 days look ${temp}with highs mostly between ${w1.highLow}${deg} and ${w1.highHigh}${deg}.`);
    if (w1.wettest?.wet >= 50) s.push(`The best chance of rain or snow is ${dayName(w1.wettest.date)}: ${tenths(w1.wettest.wet)} in 10 of the European runs bring some.`);
    else s.push('It looks mostly dry this week.');
  }
  if (w2) {
    if (w2.temp) s.push(`In week 2, the clues point to ${w2.temp === 'close to normal' ? 'temperatures close to normal' : `weather ${w2.temp}`}.`);
    else s.push(`In week 2, highs are mostly around ${w2.highLow}${deg} to ${w2.highHigh}${deg}.`);
    if (w2.agree === true) s.push('The European and American models agree on that, which makes me a little more confident.');
    else if (w2.agree === false) s.push("The European and American models don't agree yet, so this could still change a lot.");
  }
  const big = storms.find((x) => x.day >= 5) || storms[0];
  if (big) {
    const what = big.snow >= 30 ? 'snow' : big.snow >= 10 ? 'rain or snow' : 'rain';
    let line = `Keep an eye on ${dayName(big.date)}: ${tenths(big.wet)} in 10 European runs bring ${what}`;
    if (big.gefsWet != null) line += `, and ${tenths(big.gefsWet)} in 10 American runs do`;
    s.push(`${line}.`);
    if (big.low) s.push(`The main European run even draws a storm center (a low of ${big.low.hPa} mb) about ${big.low.miles} miles ${big.low.dir} of you. Storms that far out often shift or fizzle, so think of it as a maybe.`);
    if (big.snow >= 10 && big.snow < 30) s.push(`A few runs (${tenths(big.snow)} in 10) make it snow, so it is worth watching if you love snow days.`);
  }
  s.push("I'll know a lot more in a few days, so check back!");

  const headline = big && big.wet >= 60
    ? `A storm to watch around ${dayName(big.date)}`
    : w2?.temp && w2.temp !== 'close to normal'
      ? `Week 2 leans ${w2.temp.replace(' than usual', '')}`
      : 'A calm-looking two weeks';

  return {
    place,
    units,
    days: days.map((d, i) => ({ ...d, normal: normals?.get(d.date)?.high ?? null, gefs: gefsByDate.get(d.date) || null, confidence: leadConfidence(i * 24).id })),
    weeks,
    storms,
    members: { ecmwf: ecmwf.members, gefs: gefs?.members || 0 },
    hasNormals: !!normals?.size,
    rocky: { headline, sentences: s, text: s.join(' ') },
  };
}

/** Normal high (1991-2020) for each date, from the ERA5 archive. */
export function normalsFor(archive, dates, units) {
  const out = new Map();
  for (const date of dates) {
    const day = history.analyzeDay(archive, { monthDay: date.slice(5, 10), thisYear: Number(date.slice(0, 4)), units });
    if (day?.normal?.high != null) out.set(date, { high: day.normal.high });
  }
  return out;
}

const AI_ASK = (o) => `Here is your two-week weather outlook for ${o.place || 'the family'}:

${o.rocky.text}

Say it again as Rocky the raccoon in your own words, ready to be read aloud: 4 to 7 short sentences, plain text, no lists, no emoji. Keep every number and day exactly right. Keep it honest about uncertainty: anything past 7 days is a clue, not a promise. Do not add weather that is not in the outlook.`;

export function registerLongRange(app, { cache, fetchImpl, ai, latLonSchema, loc, settle, modelMap }) {
  const aiCache = new TtlCache({ max: 100 });
  app.get('/api/longrange', {
    schema: {
      querystring: {
        ...latLonSchema.querystring,
        properties: { ...latLonSchema.querystring.properties, place: { type: 'string', maxLength: 80 }, ai: { type: 'boolean' } },
      },
    },
  }, async (req) => {
    const l = loc(req.query);
    const place = req.query.place || '';
    const out = await cache.wrap(`longrange:${l.lat},${l.lon},${l.units}`, 3 * 60 * MIN, async () => {
      const [ec, us, map] = await Promise.all([
        fetchJson(longRangeUrl('ecmwf_ifs025', l), { source: 'Open-Meteo ECMWF ensemble', fetchImpl, timeoutMs: 30_000 }),
        settle(fetchJson(longRangeUrl('gfs_seamless', l), { source: 'Open-Meteo GFS ensemble', fetchImpl, timeoutMs: 30_000 })),
        settle(modelMap({ ...l, model: 'ecmwf_ifs025', area: defaultArea(l.lat, l.lon), range: 'long' })),
      ]);
      const ecmwf = summarizeEnsemble(ec, l.units);
      const gefs = us ? summarizeEnsemble(us, l.units) : null;
      // Normal highs from the same cached ERA5 download the "on this day" card uses.
      const lastYear = new Date().getUTCFullYear() - 1;
      const near = { lat: Math.round(l.lat * 10) / 10, lon: Math.round(l.lon * 10) / 10 };
      const archive = await settle(cache.wrap(`hist-arc:${near.lat},${near.lon}:${lastYear}`, 7 * DAY, () => history.getArchive(near, fetchImpl, { lastYear })));
      const normals = archive ? normalsFor(archive, ecmwf.days.map((d) => d.date), l.units) : null;
      const o = buildOutlook({ ecmwf, gefs, normals, lows: lowsNear(map, l), units: l.units });
      if (!o) {
        const err = new Error('No long-range forecast for this place right now.');
        err.statusCode = 404;
        throw err;
      }
      return { ...o, updated: Date.now(), sources: ['ECMWF ensemble (CC-BY 4.0) and NOAA GEFS via Open-Meteo', ...(normals?.size ? ['Normals: ERA5 1991-2020'] : [])] };
    });
    const res = { ...out, place, ai: false };
    if (!req.query.ai || !ai?.enabled) return res;
    try {
      const said = await aiCache.wrap(`${l.lat},${l.lon}|${out.rocky.text}`, 3 * 60 * MIN, async () => {
        const r = await ai.chat({ messages: [{ role: 'user', content: AI_ASK({ ...out, place }) }], kidMode: true, context: `Two-week outlook for ${place || 'the family'}.` });
        return (r.answer || '').trim();
      });
      if (said && said.length <= 1600) return { ...res, rocky: { ...out.rocky, text: said, template: out.rocky.text }, ai: true };
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      req.log.warn({ err: err.message }, 'AI outlook failed, using the template');
    }
    return res;
  });
}
