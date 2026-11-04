// "Which forecast was right?": for each of the last 7 days, what each model
// said the day before (Open-Meteo's Previous Runs API, free, no key) against
// what really happened. In the US "what happened" is the nearest NWS
// observation station (real thermometer readings); elsewhere, or when the
// station is missing hours, it is Open-Meteo's own record of the past days.
import { fetchJson } from './cache.js';
import { MODELS } from './providers/models.js';
import { unitParams } from './providers/openmeteo.js';

export const PREVIOUS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const NWS = 'https://api.weather.gov';
const DAYS = 7;
// HRRR's day-before runs are kept too, but it only covers the US; it drops out on its own elsewhere.
export const SCORED_MODELS = MODELS;

const coords = (l) => ({ latitude: l.lat.toFixed(4), longitude: l.lon.toFixed(4) });

export function previousRunUrl(model, l) {
  const p = new URLSearchParams({
    ...coords(l),
    hourly: 'temperature_2m_previous_day1,precipitation_previous_day1',
    models: model.id,
    past_days: String(DAYS + 1),
    forecast_days: '1',
    timezone: 'auto',
    ...unitParams(l.units),
  });
  return `${PREVIOUS_URL}?${p}`;
}

export function pastUrl(l) {
  const p = new URLSearchParams({
    ...coords(l),
    hourly: 'temperature_2m,precipitation',
    past_days: String(DAYS + 1),
    forecast_days: '1',
    timezone: 'auto',
    ...unitParams(l.units),
  });
  return `${FORECAST_URL}?${p}`;
}

// Hourly columns -> { 'YYYY-MM-DD': { temps: [], precip: number, n } } for complete days only.
export function byDay(times, temps, precip, { today }) {
  const days = {};
  (times || []).forEach((t, i) => {
    const d = t.slice(0, 10);
    if (d >= today) return;
    const temp = temps?.[i];
    if (temp == null) return;
    days[d] ||= { temps: [], precip: 0, n: 0 };
    days[d].temps.push(temp);
    days[d].precip += precip?.[i] || 0;
    days[d].n++;
  });
  const out = {};
  for (const [d, v] of Object.entries(days)) {
    if (v.n < 20) continue; // need most of the day
    out[d] = { high: Math.max(...v.temps), low: Math.min(...v.temps), precip: v.precip };
  }
  return out;
}

const toUnits = (c, units) => (units === 'metric' ? c : c * 9 / 5 + 32);

// NWS observations (GeoJSON) -> the same per-day shape, in local time.
export function nwsDays(features, offsetSec, units, today) {
  const days = {};
  for (const f of features || []) {
    const p = f.properties || {};
    const c = p.temperature?.value;
    if (c == null || !p.timestamp) continue;
    const local = new Date(Date.parse(p.timestamp) + offsetSec * 1000).toISOString();
    const d = local.slice(0, 10);
    if (d >= today) continue;
    days[d] ||= { temps: [], hours: new Set() };
    days[d].temps.push(toUnits(c, units));
    days[d].hours.add(local.slice(11, 13));
  }
  const out = {};
  for (const [d, v] of Object.entries(days)) {
    if (v.hours.size < 18) continue; // a station that missed too many hours can't be trusted for the day's high and low
    out[d] = { high: Math.max(...v.temps), low: Math.min(...v.temps) };
  }
  return out;
}

const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// Put it together. truth: { date: { high, low, precip? } }; models: [{ id, name, ai, days: { date: { high, low, precip } } }].
export function scoreModels(truth, models, units) {
  const wet = units === 'metric' ? 0.3 : 0.01;
  const dates = Object.keys(truth).sort().slice(-DAYS);
  const ranking = models.map((m) => {
    let errSum = 0;
    let highErr = 0;
    let lowErr = 0;
    let n = 0;
    let rainRight = 0;
    let rainN = 0;
    const perDay = {};
    for (const d of dates) {
      const t = truth[d];
      const f = m.days[d];
      if (!f) continue;
      const hi = Math.abs(f.high - t.high);
      const lo = Math.abs(f.low - t.low);
      highErr += hi;
      lowErr += lo;
      errSum += (hi + lo) / 2;
      n++;
      let rainOk = null;
      if (t.precip != null) {
        rainOk = (f.precip >= wet) === (t.precip >= wet);
        rainN++;
        if (rainOk) rainRight++;
      }
      perDay[d] = { high: r1(f.high), low: r1(f.low), precip: r1(f.precip), off: r1((hi + lo) / 2), rainOk };
    }
    return {
      id: m.id, name: m.name, ai: !!m.ai, days: n,
      avgError: n ? r1(errSum / n) : null,
      highError: n ? r1(highErr / n) : null,
      lowError: n ? r1(lowErr / n) : null,
      rainRight, rainDays: rainN,
      perDay,
    };
  }).filter((m) => m.days >= Math.min(3, dates.length) && m.days > 0)
    .sort((a, b) => a.avgError - b.avgError || b.rainRight - a.rainRight);
  return {
    dates,
    truth: Object.fromEntries(dates.map((d) => [d, { high: r1(truth[d].high), low: r1(truth[d].low), precip: truth[d].precip == null ? null : r1(truth[d].precip) }])),
    ranking,
    best: ranking[0] ? { id: ranking[0].id, name: ranking[0].name, avgError: ranking[0].avgError } : null,
  };
}

async function nwsTruth(l, { userAgent, fetchImpl, offsetSec, today, now }) {
  const headers = { 'user-agent': userAgent, accept: 'application/geo+json' };
  const point = await fetchJson(`${NWS}/points/${l.lat.toFixed(4)},${l.lon.toFixed(4)}`, { source: 'nws', fetchImpl, headers });
  const list = point?.properties?.observationStations;
  if (!list) return null;
  const stations = await fetchJson(list, { source: 'nws', fetchImpl, headers });
  const first = stations?.features?.[0]?.properties;
  if (!first?.stationIdentifier) return null;
  const start = new Date(now - (DAYS + 2) * 86400_000).toISOString().replace(/\.\d+Z$/, 'Z');
  const obs = await fetchJson(`${NWS}/stations/${first.stationIdentifier}/observations?start=${encodeURIComponent(start)}`, { source: 'nws', fetchImpl, headers });
  const days = nwsDays(obs?.features, offsetSec, l.units, today);
  return Object.keys(days).length >= 3 ? { days, station: { id: first.stationIdentifier, name: first.name || first.stationIdentifier } } : null;
}

export async function getScorecard(l, { fetchImpl, userAgent, now = Date.now() }) {
  const past = await fetchJson(pastUrl(l), { source: 'open-meteo', fetchImpl });
  const offsetSec = past.utc_offset_seconds || 0;
  const today = new Date(now + offsetSec * 1000).toISOString().slice(0, 10);
  const recorded = byDay(past.hourly?.time, past.hourly?.temperature_2m, past.hourly?.precipitation, { today });

  const runs = await Promise.all(SCORED_MODELS.map(async (m) => {
    try {
      const raw = await fetchJson(previousRunUrl(m, l), { source: 'open-meteo-previous', fetchImpl });
      const h = raw.hourly || {};
      const days = byDay(h.time, h.temperature_2m_previous_day1, h.precipitation_previous_day1, { today });
      return Object.keys(days).length ? { id: m.id, name: m.name, ai: !!m.ai, days } : null;
    } catch {
      return null;
    }
  }));

  let truth = recorded;
  let truthSource = { kind: 'model', name: 'Open-Meteo record of the past days' };
  let station = null;
  try {
    station = await nwsTruth(l, { userAgent, fetchImpl, offsetSec, today, now });
  } catch {
    station = null; // outside the US, or NWS is down
  }
  if (station) {
    // Station highs and lows, with rain from the Open-Meteo record (stations often skip rain amounts).
    truth = Object.fromEntries(Object.entries(station.days).map(([d, v]) => [d, { ...v, precip: recorded[d]?.precip ?? null }]));
    truthSource = { kind: 'station', name: `NWS station ${station.station.id}${station.station.name && station.station.name !== station.station.id ? ` (${station.station.name})` : ''}` };
  }

  const scored = scoreModels(truth, runs.filter(Boolean), l.units);
  return {
    ...scored,
    units: l.units,
    truthSource,
    source: "Forecasts: Open-Meteo Previous Runs (each model's forecast from the day before)",
  };
}
