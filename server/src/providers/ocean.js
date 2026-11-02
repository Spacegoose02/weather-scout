// Ocean data, all from NOAA with no key:
// - NDBC buoys: the latest observation from every station in one text file.
// - CO-OPS tides: the nearest tide-prediction station and its highs and lows.
import { UpstreamError, fetchJson } from '../cache.js';
import { milesBetween } from './tropics.js';

export const NDBC_LATEST = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';
export const TIDE_STATIONS = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';
const TIDE_DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const TIDE_RANGE_MILES = 60;

const val = (s) => (s == null || s === 'MM' || s === '' || Number.isNaN(Number(s)) ? null : Number(s));
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// Columns are named on the first header line, so parse by name, not position.
export function parseNdbc(text, units = 'imperial') {
  const lines = String(text).split('\n');
  const header = (lines.find((l) => l.startsWith('#STN')) || '').replace(/^#/, '').trim().split(/\s+/);
  if (!header.includes('LAT')) throw new Error('Unexpected NDBC format');
  const col = (name) => header.indexOf(name);
  const imp = units !== 'metric';
  const buoys = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const f = line.trim().split(/\s+/);
    const get = (name) => (col(name) >= 0 ? f[col(name)] : null);
    const lat = val(get('LAT'));
    const lon = val(get('LON'));
    if (lat == null || lon == null) continue;
    const [Y, M, D, h, m] = ['YYYY', 'MM', 'DD', 'hh', 'mm'].map(get);
    const time = Y && M && D ? `${Y}-${M}-${D}T${h || '00'}:${m || '00'}:00Z` : null;
    const wvht = val(get('WVHT'));
    const wspd = val(get('WSPD'));
    const gst = val(get('GST'));
    const wtmp = val(get('WTMP'));
    const atmp = val(get('ATMP'));
    const b = {
      id: get('STN'),
      lat, lon, time,
      waveHeight: wvht == null ? null : r1(imp ? wvht * 3.28084 : wvht),
      wavePeriod: val(get('DPD')),
      waveDir: val(get('MWD')),
      windDir: val(get('WDIR')),
      wind: wspd == null ? null : Math.round(imp ? wspd * 2.23694 : wspd * 3.6),
      gust: gst == null ? null : Math.round(imp ? gst * 2.23694 : gst * 3.6),
      waterTemp: wtmp == null ? null : r1(imp ? wtmp * 1.8 + 32 : wtmp),
      airTemp: atmp == null ? null : r1(imp ? atmp * 1.8 + 32 : atmp),
      pressure: val(get('PRES')),
    };
    // Skip stations that reported nothing useful.
    if ([b.waveHeight, b.wind, b.waterTemp, b.airTemp].some((v) => v != null)) buoys.push(b);
  }
  return buoys;
}

export async function getBuoys(units, fetchImpl) {
  const res = await fetchImpl(NDBC_LATEST, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new UpstreamError('NOAA buoys', res.status);
  return parseNdbc(await res.text(), units);
}

export function inBox(list, { south, west, north, east }, limit = 300) {
  const hit = list.filter((b) => b.lat >= south && b.lat <= north && (west <= east ? b.lon >= west && b.lon <= east : b.lon >= west || b.lon <= east));
  return { items: hit.slice(0, limit), total: hit.length, truncated: hit.length > limit };
}

export async function getTideStations(fetchImpl) {
  const raw = await fetchJson(TIDE_STATIONS, { source: 'NOAA Tides & Currents', fetchImpl, timeoutMs: 20000 });
  return (raw.stations || []).map((s) => ({ id: String(s.id), name: s.name, state: s.state || '', lat: Number(s.lat), lon: Number(s.lng) }))
    .filter((s) => /^\w{1,12}$/.test(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

export function nearestStation(stations, l, maxMiles = TIDE_RANGE_MILES) {
  let best = null;
  for (const s of stations) {
    const d = milesBetween(l, s);
    if (d <= maxMiles && (!best || d < best.miles)) best = { ...s, miles: Math.round(d) };
  }
  return best;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

export function tideUrl(id, units, now = Date.now()) {
  const p = new URLSearchParams({
    product: 'predictions', interval: 'hilo', datum: 'MLLW', time_zone: 'lst_ldt',
    units: units === 'metric' ? 'metric' : 'english', format: 'json', application: 'weather-scout',
    station: id, begin_date: ymd(new Date(now - 86_400_000)), range: '96',
  });
  return `${TIDE_DATA}?${p}`;
}

export function normalizeTides(raw) {
  return (raw.predictions || []).map((p) => ({
    time: String(p.t || '').replace(' ', 'T'),
    type: p.type === 'H' ? 'high' : 'low',
    height: r1(Number(p.v)),
  })).filter((p) => /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(p.time) && Number.isFinite(p.height));
}

// The station's clock is local; `nowLocal` is "YYYY-MM-DDTHH:MM" in the place's time zone.
export function upcomingTides(events, nowLocal, count = 4) {
  const next = events.filter((e) => e.time >= nowLocal);
  const prev = events.filter((e) => e.time < nowLocal).at(-1) || null;
  const coming = next[0] || null;
  let state = null;
  if (prev && coming) state = coming.type === 'high' ? 'rising' : 'falling';
  return { previous: prev, next: next.slice(0, count), state };
}

export async function getTides(l, stations, fetchImpl) {
  const station = nearestStation(stations, l);
  if (!station) return { station: null };
  const raw = await fetchJson(tideUrl(station.id, l.units), { source: 'NOAA Tides & Currents', fetchImpl, timeoutMs: 15000 });
  if (raw.error) throw new UpstreamError('NOAA Tides & Currents', 502, raw.error.message);
  return { station, unit: l.units === 'metric' ? 'm' : 'ft', events: normalizeTides(raw), link: `https://tidesandcurrents.noaa.gov/stationhome.html?id=${station.id}` };
}
