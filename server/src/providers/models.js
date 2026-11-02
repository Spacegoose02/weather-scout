// Forecast model comparison and ensemble confidence, from Open-Meteo (free, no key).
// Each model is asked for separately, so one model being unavailable for a place
// (HRRR only covers the US, for example) doesn't break the others.
import { fetchJson } from '../cache.js';
import { unitParams } from './openmeteo.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';

export const MODELS = [
  { id: 'ecmwf_ifs025', name: 'ECMWF', from: 'Europe (ECMWF IFS)', note: 'Often the best global model past 3 days' },
  { id: 'gfs_seamless', name: 'GFS', from: 'USA (NOAA)', note: 'The main US global model' },
  { id: 'icon_seamless', name: 'ICON', from: 'Germany (DWD)', note: 'Strong on fronts and temperatures' },
  { id: 'gem_seamless', name: 'GEM', from: 'Canada (ECCC)', note: 'Good on winter storms' },
  { id: 'gfs_hrrr', name: 'HRRR', from: 'USA (NOAA), 3 km', note: 'Short-range storm detail, next 2 days', shortRange: true },
  { id: 'gfs_graphcast025', name: 'GraphCast', from: 'Google DeepMind', note: 'AI model trained on decades of weather', ai: true },
  { id: 'ecmwf_aifs025_single', name: 'AIFS', from: 'ECMWF', note: "ECMWF's AI model", ai: true },
];

export const ENSEMBLES = [
  { id: 'ecmwf_ifs025', name: 'ECMWF ensemble' },
  { id: 'gfs_seamless', name: 'GFS ensemble' },
];

const coords = (lat, lon) => ({ latitude: lat.toFixed(4), longitude: lon.toFixed(4) });

export function modelUrl(model, { lat, lon, units }) {
  const p = new URLSearchParams({
    ...coords(lat, lon),
    hourly: 'temperature_2m,precipitation,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    models: model.id,
    forecast_days: model.shortRange ? '2' : '10',
    timezone: 'auto',
    ...unitParams(units),
  });
  return `${FORECAST_URL}?${p}`;
}

export function ensembleUrl(id, { lat, lon, units }) {
  const p = new URLSearchParams({
    ...coords(lat, lon),
    hourly: 'temperature_2m,precipitation',
    models: id,
    forecast_days: '10',
    timezone: 'auto',
    ...unitParams(units),
  });
  return `${ENSEMBLE_URL}?${p}`;
}

const nowLocal = (raw, now) => new Date(now + (raw.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13);

// One deterministic model -> next 72 hours + up to 10 days, nulls dropped.
export function normalizeModel(raw, model, now = Date.now()) {
  const h = raw.hourly || {};
  const start = nowLocal(raw, now);
  const hourly = (h.time || [])
    .map((time, i) => ({ time, temp: h.temperature_2m?.[i] ?? null, precip: h.precipitation?.[i] ?? null, wind: h.wind_speed_10m?.[i] ?? null }))
    .filter((r) => r.time.slice(0, 13) >= start && r.temp != null)
    .slice(0, 72);
  const d = raw.daily || {};
  const daily = (d.time || [])
    .map((date, i) => ({ date, high: d.temperature_2m_max?.[i] ?? null, low: d.temperature_2m_min?.[i] ?? null, precip: d.precipitation_sum?.[i] ?? null }))
    .filter((r) => r.date >= start.slice(0, 10) && r.high != null);
  return { id: model.id, name: model.name, from: model.from, note: model.note, ai: !!model.ai, hourly, daily };
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const spread = (values) => {
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  return { p10: r1(percentile(s, 0.1)), p50: r1(percentile(s, 0.5)), p90: r1(percentile(s, 0.9)) };
};

// Ensemble: the control run plus every perturbed member (temperature_2m_member01, ...).
export function normalizeEnsemble(raw, ens, units, now = Date.now()) {
  const h = raw.hourly || {};
  const times = h.time || [];
  const membersOf = (v) => Object.keys(h).filter((k) => k === v || k.startsWith(`${v}_member`)).map((k) => h[k]);
  const temps = membersOf('temperature_2m');
  const precs = membersOf('precipitation');
  const start = nowLocal(raw, now);
  const wet = units === 'metric' ? 0.25 : 0.01; // a measurable amount of rain in the day

  const hourly = [];
  for (let i = 0; i < times.length && hourly.length < 72; i++) {
    if (times[i].slice(0, 13) < start) continue;
    hourly.push({ time: times[i], ...spread(temps.map((m) => m[i])) });
  }

  const days = [...new Set(times.map((t) => t.slice(0, 10)))].filter((d) => d >= start.slice(0, 10));
  const daily = days.map((date) => {
    const idx = times.map((t, i) => (t.startsWith(date) ? i : -1)).filter((i) => i >= 0);
    const highs = temps.map((m) => Math.max(...idx.map((i) => m[i]).filter((v) => v != null))).filter(Number.isFinite);
    const lows = temps.map((m) => Math.min(...idx.map((i) => m[i]).filter((v) => v != null))).filter(Number.isFinite);
    const totals = precs.map((m) => idx.reduce((s, i) => s + (m[i] || 0), 0));
    const hi = spread(highs);
    return {
      date,
      high: hi,
      low: spread(lows),
      precip: spread(totals),
      rainChance: totals.length ? Math.round((totals.filter((t) => t >= wet).length / totals.length) * 100) : null,
      confidence: confidenceWord(hi.p90 - hi.p10, units),
    };
  }).filter((d) => d.high.p50 != null && d.date.length === 10);

  return { id: ens.id, name: ens.name, members: temps.length, hourly, daily };
}

// How sure is the forecast? Based on the 10th-90th percentile range of the day's high.
export function confidenceWord(range, units) {
  if (range == null || Number.isNaN(range)) return null;
  const f = units === 'metric' ? range * 1.8 : range;
  if (f <= 4) return 'High';
  if (f <= 9) return 'Medium';
  return 'Low';
}

// Day by day: how far apart are the models' highs?
export function agreement(models, units) {
  const byDate = new Map();
  for (const m of models) for (const d of m.daily) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date).push(d.high);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, highs]) => {
    const range = highs.length > 1 ? Math.max(...highs) - Math.min(...highs) : null;
    const f = range == null ? null : units === 'metric' ? range * 1.8 : range;
    const label = f == null ? null : f <= 3 ? 'Models agree' : f <= 7 ? 'Some disagreement' : 'Models disagree';
    return { date, count: highs.length, range: r1(range), label };
  });
}

export async function getModels(l, fetchImpl) {
  const results = await Promise.allSettled(MODELS.map((m) => fetchJson(modelUrl(m, l), { source: `Open-Meteo ${m.name}`, fetchImpl, timeoutMs: 15000 })));
  const models = [];
  const missing = [];
  results.forEach((r, i) => {
    const m = MODELS[i];
    const n = r.status === 'fulfilled' ? normalizeModel(r.value, m) : null;
    if (n && n.daily.length) models.push(n);
    else missing.push({ id: m.id, name: m.name, reason: r.status === 'rejected' ? r.reason?.message : 'No data for this place' });
  });
  return { models, missing, agreement: agreement(models.filter((m) => !MODELS.find((x) => x.id === m.id)?.shortRange), l.units) };
}

export async function getEnsemble(l, id, fetchImpl) {
  const ens = ENSEMBLES.find((e) => e.id === id) || ENSEMBLES[0];
  const raw = await fetchJson(ensembleUrl(ens.id, l), { source: `Open-Meteo ${ens.name}`, fetchImpl, timeoutMs: 20000 });
  return normalizeEnsemble(raw, ens, l.units);
}
