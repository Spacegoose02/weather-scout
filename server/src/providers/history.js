// Historical weather for "on this day": every past year's weather for today's
// date, records, 1991-2020 normals and how today compares.
//
// Two free sources, no keys:
// - Open-Meteo Historical (ERA5 reanalysis, archive-api.open-meteo.com). Daily
//   values back to 1940 for any place on Earth. This is the main source.
// - NOAA ACIS (data.rcc-acis.org), US only. Official records from the nearest
//   ThreadEx station (the long city records the NWS quotes) and the official
//   1991-2020 normals. Optional: when it is out of reach the ERA5 numbers stand.
//
// The archive is fetched once per place in metric, kept compact in memory for a
// week (it only changes once a year, since it stops at last December 31) and
// converted to the person's units when the day is analysed.
import { fetchJson } from '../cache.js';
import { describeCode } from '../weathercodes.js';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const ACIS_URL = 'https://data.rcc-acis.org';
export const FIRST_YEAR = 1940;
const DAY_MS = 86_400_000;
const NORMALS = [1991, 2020];

// ---- Open-Meteo archive ------------------------------------------------------------

export function archiveUrl({ lat, lon }, lastYear) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start_date: `${FIRST_YEAR}-01-01`,
    end_date: `${lastYear}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,weather_code',
    timezone: 'auto',
  });
  return `${ARCHIVE_URL}?${p}`;
}

const f32 = (list = [], n) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = list[i] == null ? NaN : list[i];
  return a;
};

// Raw archive JSON -> { start, n, high, low, precip, snow, code } as typed arrays
// (about 600 KB for 86 years instead of several MB of JSON objects).
export function compactArchive(raw) {
  const d = raw?.daily || {};
  const n = d.time?.length || 0;
  return {
    start: d.time?.[0] || `${FIRST_YEAR}-01-01`,
    n,
    high: f32(d.temperature_2m_max, n),
    low: f32(d.temperature_2m_min, n),
    precip: f32(d.precipitation_sum, n),
    snow: f32(d.snowfall_sum, n),
    code: f32(d.weather_code, n),
  };
}

export async function getArchive(l, fetchImpl, { lastYear = new Date().getUTCFullYear() - 1 } = {}) {
  const raw = await fetchJson(archiveUrl(l, lastYear), { source: 'Open-Meteo Historical', timeoutMs: 45_000, fetchImpl });
  return compactArchive(raw);
}

// ---- NOAA ACIS (US) -----------------------------------------------------------------

export const inUS = ({ lat, lon }) => lat > 17 && lat < 72 && lon > -180 && lon < -64;

const acisUrl = (path, params) => `${ACIS_URL}/${path}?params=${encodeURIComponent(JSON.stringify(params))}`;
const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return Math.sqrt(x * x + ((b.lat - a.lat) * r) ** 2) * 6371;
};

// The nearest ThreadEx station (station id type 9) within about 100 km. ThreadEx
// stitches a city's records across station moves, so its records are the ones
// the NWS and the local news quote.
export function nearestThreadEx(meta, l) {
  let best = null;
  for (const s of meta?.meta || []) {
    const sid = (s.sids || []).map((x) => String(x).split(' ')).find(([, type]) => type === '9')?.[0];
    if (!sid || !Array.isArray(s.ll)) continue;
    const at = { lat: s.ll[1], lon: s.ll[0] };
    const d = km(l, at);
    const since = Number(String(s.valid_daterange?.[0]?.[0] || '').slice(0, 4)) || null;
    if (d <= 100 && (!best || d < best.km)) best = { sid, name: s.name, km: Math.round(d), since };
  }
  return best;
}

// ACIS values are strings: "65", "0.25", "T" (trace), "M" (missing), sometimes
// with a flag letter ("65A"). Trace counts as a tiny amount, not zero.
export function acisNumber(v) {
  if (v == null || v === 'M' || v === '') return null;
  if (v === 'T') return 0.001;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function getOfficial(l, monthDay, lastYear, fetchImpl) {
  if (!inUS(l) || monthDay === '02-29') return null;
  const bbox = [l.lon - 1, l.lat - 1, l.lon + 1, l.lat + 1].map((x) => x.toFixed(2)).join(',');
  const meta = await fetchJson(acisUrl('StnMeta', { bbox, meta: 'name,sids,ll,valid_daterange', elems: 'maxt' }), { source: 'NOAA ACIS', timeoutMs: 15_000, fetchImpl });
  const station = nearestThreadEx(meta, l);
  if (!station) return null;
  const year = (y) => `${y}-${monthDay}`;
  const elem = (name) => ({ name, interval: [1, 0, 0], duration: 'dly' });
  const normal = (name) => ({ name, interval: 'dly', duration: 'dly', normal: '1' });
  const [data, norms] = await Promise.all([
    fetchJson(acisUrl('StnData', { sid: station.sid, sdate: year(station.since || 1870), edate: year(lastYear), elems: ['maxt', 'mint', 'pcpn', 'snow'].map(elem) }), { source: 'NOAA ACIS', timeoutMs: 20_000, fetchImpl }),
    fetchJson(acisUrl('StnData', { sid: station.sid, sdate: year(lastYear + 1), edate: year(lastYear + 1), elems: ['maxt', 'mint', 'pcpn'].map(normal) }), { source: 'NOAA ACIS', timeoutMs: 15_000, fetchImpl }).catch(() => null),
  ]);
  const years = (data?.data || [])
    .filter((r) => String(r[0]).slice(5) === monthDay)
    .map(([date, hi, lo, p, s]) => ({ year: Number(String(date).slice(0, 4)), high: acisNumber(hi), low: acisNumber(lo), precip: acisNumber(p), snow: acisNumber(s) }))
    .filter((y) => y.high != null || y.low != null);
  if (years.length < 10) return null;
  const n = norms?.data?.[0] || [];
  return {
    station: { name: station.name, sid: station.sid, km: station.km, since: years[0].year },
    years, // imperial: °F and inches
    normal: n.length ? { high: acisNumber(n[1]), low: acisNumber(n[2]), precip: acisNumber(n[3]) } : null,
  };
}

// ---- analysis ---------------------------------------------------------------------

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dateLabel = (monthDay) => `${MONTHS[Number(monthDay.slice(0, 2)) - 1]} ${Number(monthDay.slice(3))}`;

const conv = (metric) => (metric
  ? { t: (c) => c, p: (mm) => mm, s: (cm) => cm, wet: 0.25, tSlop: 1, big: 6, some: 2.5 }
  : { t: (c) => (c * 9) / 5 + 32, p: (mm) => mm / 25.4, s: (cm) => cm / 2.54, wet: 0.01, tSlop: 2, big: 10, some: 4 });
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fromF = (metric) => (f) => (f == null ? null : metric ? ((f - 32) * 5) / 9 : f);
const fromIn = (metric, cm) => (x) => (x == null ? null : metric ? x * (cm ? 2.54 : 25.4) : x);

// Days apart in the calendar, ignoring the year (Dec 30 and Jan 2 are 3 apart).
function calendarGap(aMs, md) {
  const a = new Date(aMs);
  const y = a.getUTCFullYear();
  const [m, d] = md.split('-').map(Number);
  let best = Infinity;
  for (const yy of [y - 1, y, y + 1]) best = Math.min(best, Math.abs(aMs - Date.UTC(yy, m - 1, d === 29 && m === 2 && !isLeap(yy) ? 28 : d)) / DAY_MS);
  return Math.round(best);
}

function pick(list, key, dir) {
  let best = null;
  for (const y of list) {
    const v = y[key];
    if (v == null) continue;
    // Ties go to the most recent year, as the NWS lists them.
    if (!best || (dir > 0 ? v >= best.value : v <= best.value)) best = { value: v, year: y.year };
  }
  return best;
}

export function recordsOf(years) {
  return {
    warmestHigh: pick(years, 'high', 1),
    coolestHigh: pick(years, 'high', -1),
    warmestLow: pick(years, 'low', 1),
    coldestLow: pick(years, 'low', -1),
    wettest: pick(years.filter((y) => y.precip > 0), 'precip', 1),
    snowiest: pick(years.filter((y) => y.snow > 0), 'snow', 1),
  };
}

function compareWords(diff, big, some) {
  if (diff == null) return null;
  if (diff >= big) return 'much warmer than usual';
  if (diff >= some) return 'warmer than usual';
  if (diff <= -big) return 'much colder than usual';
  if (diff <= -some) return 'cooler than usual';
  return 'close to normal';
}

// Everything the "on this day" card needs, from the compact archive.
//   archive: compactArchive() output (metric)
//   monthDay: 'MM-DD' for today where the person is
//   today: today's forecast { high, low, precipTotal, snowTotal } in `units`
//   official: getOfficial() output or null (imperial)
export function analyzeDay(archive, { monthDay, thisYear, units = 'imperial', today = null, official = null }) {
  const metric = units === 'metric';
  const u = conv(metric);
  const t0 = Date.parse(`${archive.start}T00:00:00Z`);
  const years = [];
  const windowDays = []; // ±7 calendar days, for normals
  const decadeDays = []; // ±3 calendar days, for the decade trend
  for (let i = 0; i < archive.n; i++) {
    const ms = t0 + i * DAY_MS;
    const gap = calendarGap(ms, monthDay);
    if (gap > 7) {
      i += gap - 8; // jump close to the next window (gap never overshoots)
      continue;
    }
    const year = new Date(ms).getUTCFullYear();
    const row = {
      year,
      high: Number.isNaN(archive.high[i]) ? null : r1(u.t(archive.high[i])),
      low: Number.isNaN(archive.low[i]) ? null : r1(u.t(archive.low[i])),
      precip: Number.isNaN(archive.precip[i]) ? null : r2(u.p(archive.precip[i])),
      snow: Number.isNaN(archive.snow[i]) ? null : r2(u.s(archive.snow[i])),
    };
    windowDays.push(row);
    if (gap <= 3) decadeDays.push(row);
    if (gap === 0 && new Date(ms).toISOString().slice(5, 10) === monthDay) {
      const code = Number.isNaN(archive.code[i]) ? null : archive.code[i];
      const d = code == null ? null : describeCode(code);
      years.push({ ...row, icon: d?.icon || null, label: d?.label || null, kidLabel: d?.kidLabel || null });
    }
  }
  years.sort((a, b) => b.year - a.year);
  if (!years.length) return null;

  const inNormals = windowDays.filter((d) => d.year >= NORMALS[0] && d.year <= NORMALS[1]);
  const wetDays = inNormals.filter((d) => d.precip != null);
  const normal = {
    years: NORMALS,
    high: r1(mean(inNormals.map((d) => d.high).filter((v) => v != null))),
    low: r1(mean(inNormals.map((d) => d.low).filter((v) => v != null))),
    precip: r2(mean(wetDays.map((d) => d.precip))),
    rainChance: wetDays.length ? Math.round((100 * wetDays.filter((d) => d.precip >= u.wet).length) / wetDays.length) : null,
    snowChance: wetDays.length ? Math.round((100 * inNormals.filter((d) => d.snow >= u.wet).length) / wetDays.length) : null,
  };

  const decades = [];
  for (const d of decadeDays) {
    const dec = Math.floor(d.year / 10) * 10;
    let row = decades.find((x) => x.decade === dec);
    if (!row) decades.push((row = { decade: dec, highs: [], lows: [] }));
    if (d.high != null) row.highs.push(d.high);
    if (d.low != null) row.lows.push(d.low);
  }
  const decadeRows = decades
    .sort((a, b) => a.decade - b.decade)
    .map((d) => ({ decade: d.decade, high: r1(mean(d.highs)), low: r1(mean(d.lows)), years: Math.round(d.highs.length / 7) }));
  const firstYear = years.at(-1).year; // first ERA5 year
  const avgHighs = (from, to) => mean(decadeDays.filter((d) => d.year >= from && d.year <= to && d.high != null).map((d) => d.high));
  const early = avgHighs(firstYear, firstYear + 29);
  const late = avgHighs(thisYear - 30, thisYear - 1);
  const trend = early != null && late != null ? { from: [firstYear, firstYear + 29], to: [thisYear - 30, thisYear - 1], change: r1(late - early) } : null;

  // Official station numbers replace the ERA5 ones where we have them.
  const off = official
    ? {
      station: official.station,
      records: convertRecords(recordsOf(official.years), metric),
      normal: official.normal ? { high: r1(fromF(metric)(official.normal.high)), low: r1(fromF(metric)(official.normal.low)), precip: r2(fromIn(metric)(official.normal.precip)) } : null,
      years: official.years.length,
    }
    : null;

  const records = recordsOf(years);
  const best = { records: off?.records || records, normal: { ...normal, ...(off?.normal ? pickDefined(off.normal) : {}) } };
  // The year-by-year list uses the station's own numbers where it has them, so
  // the list, the chart and the records always agree. ERA5 fills the sky icon
  // and any year the station is missing.
  const list = official ? mergeYears(years, official.years, metric) : years;

  let compare = null;
  if (today && today.high != null) {
    const highs = list.filter((y) => y.high != null);
    const diff = best.normal.high != null ? r1(today.high - best.normal.high) : null;
    const warmerThan = highs.filter((y) => y.high < today.high).length;
    const rec = best.records.warmestHigh;
    const cold = best.records.coldestLow;
    compare = {
      high: today.high,
      low: today.low ?? null,
      diff,
      lowDiff: today.low != null && best.normal.low != null ? r1(today.low - best.normal.low) : null,
      words: compareWords(diff, u.big, u.some),
      warmerThan,
      of: highs.length,
      record: rec && today.high >= rec.value ? 'record-high' : rec && today.high >= rec.value - u.tSlop ? 'near-record-high' : cold && today.low != null && today.low <= cold.value ? 'record-low' : cold && today.low != null && today.low <= cold.value + u.tSlop ? 'near-record-low' : null,
    };
  }

  return {
    monthDay,
    label: dateLabel(monthDay),
    units: metric ? { temp: '°C', precip: 'mm', snow: 'cm' } : { temp: '°F', precip: 'in', snow: 'in' },
    since: list.at(-1).year,
    normal: best.normal,
    records: best.records,
    reanalysis: { records, normal },
    official: off,
    compare,
    trend,
    decades: decadeRows,
    years: list,
    kid: kidHistory({ years: list, records: best.records, normal: best.normal, compare, trend, label: dateLabel(monthDay), thisYear, metric }),
  };
}

function mergeYears(era5, station, metric) {
  const t = fromF(metric);
  const p = fromIn(metric);
  const sn = fromIn(metric, true);
  const byYear = new Map(era5.map((y) => [y.year, { ...y, source: 'era5' }]));
  for (const o of station) {
    const e = byYear.get(o.year) || { year: o.year, icon: null, label: null, kidLabel: null, high: null, low: null, precip: null, snow: null };
    byYear.set(o.year, {
      ...e,
      source: 'station',
      high: o.high != null ? r1(t(o.high)) : e.high,
      low: o.low != null ? r1(t(o.low)) : e.low,
      precip: o.precip != null ? r2(p(o.precip)) : e.precip,
      snow: o.snow != null ? r2(sn(o.snow)) : e.snow,
    });
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

const pickDefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

function convertRecords(r, metric) {
  const t = fromF(metric);
  const p = fromIn(metric);
  const s = fromIn(metric, true);
  const map = (x, f, round) => (x ? { value: round(f(x.value)), year: x.year } : null);
  return {
    warmestHigh: map(r.warmestHigh, t, r1),
    coolestHigh: map(r.coolestHigh, t, r1),
    warmestLow: map(r.warmestLow, t, r1),
    coldestLow: map(r.coldestLow, t, r1),
    wettest: map(r.wettest, p, r2),
    snowiest: map(r.snowiest, s, r2),
  };
}

// ---- kid-friendly words -------------------------------------------------------------

const deg = (v) => `${Math.round(v)} degrees`;

export function kidHistory({ years, records, normal, compare, trend, label, thisYear, metric }) {
  const facts = [];
  const hot = records.warmestHigh;
  const cold = records.coldestLow;
  const ago = (y) => thisYear - y;
  if (hot) facts.push({ emoji: '🔥', text: `The hottest ${label} was in ${hot.year}, when it got to ${deg(hot.value)}. That was ${ago(hot.year)} years ago!` });
  if (cold) facts.push({ emoji: '🥶', text: `The coldest ${label} morning was in ${cold.year}: just ${deg(cold.value)}. Brrr!` });
  if (normal.high != null) facts.push({ emoji: '📏', text: `On a usual ${label}, it gets up to about ${deg(normal.high)} and down to about ${deg(normal.low)} at night.` });
  if (records.snowiest && records.snowiest.value >= (metric ? 1 : 0.5)) {
    const v = metric ? `${Math.round(records.snowiest.value)} centimeters` : `${Math.round(records.snowiest.value * 10) / 10} inches`;
    facts.push({ emoji: '⛄', text: `It snowed ${v} on ${label}, ${records.snowiest.year}. Snowball time!` });
  } else if (records.wettest && records.wettest.value > 0) {
    const v = metric ? `${Math.round(records.wettest.value)} millimeters` : `${Math.round(records.wettest.value * 100) / 100} inches`;
    facts.push({ emoji: '☔', text: `The rainiest ${label} was in ${records.wettest.year}, with ${v} of rain. Puddle party!` });
  }
  if (normal.rainChance != null) facts.push({ emoji: '🎲', text: `It rains on about ${Math.max(1, Math.round(normal.rainChance / 10))} out of every 10 ${label}s.` });
  const grownUp = years.find((y) => y.year === thisYear - 30);
  if (grownUp?.high != null) facts.push({ emoji: '🧑', text: `30 years ago, when your grown-ups might have been kids, ${label} was ${deg(grownUp.high)}${grownUp.kidLabel ? ` and ${grownUp.kidLabel.toLowerCase()}` : ''}.` });
  if (trend?.change != null && Math.abs(trend.change) >= (metric ? 0.5 : 1)) {
    facts.push({ emoji: trend.change > 0 ? '🌡️' : '❄️', text: `${label} highs are about ${Math.abs(Math.round(trend.change))} degrees ${trend.change > 0 ? 'warmer' : 'cooler'} now than they were around ${trend.from[0]}.` });
  }

  let headline = `Let's travel back in time to see ${label}s long ago!`;
  if (compare) {
    if (compare.record === 'record-high') headline = `Wow! Today could be the hottest ${label} ever! The old record was ${deg(hot.value)} in ${hot.year}.`;
    else if (compare.record === 'record-low') headline = `Brrr! Tonight could be the coldest ${label} ever! The old record was ${deg(cold.value)} in ${cold.year}.`;
    else if (compare.record === 'near-record-high') headline = `Today is almost as hot as the hottest ${label} ever, from ${hot.year}!`;
    else if (compare.words === 'close to normal') headline = `Today should be ${deg(compare.high)}, just like a usual ${label}.`;
    else if (compare.words) headline = `Today should be ${deg(compare.high)}. That's ${compare.words.replace('than usual', 'than a usual')} ${label}!`;
  }
  return { headline, facts };
}
