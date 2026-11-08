// Live air: real sensors near you, a smoke/haze map and the readings behind them.
//
//  - AirNow (EPA): official regulatory monitors, hourly. Free key (AIRNOW_API_KEY).
//  - PurpleAir: thousands of backyard sensors, every 10 minutes. Key
//    (PURPLEAIR_API_KEY); readings are run through EPA's correction first.
//  - Smoke & haze: Open-Meteo's air-quality model (CAMS) PM2.5 on a grid over
//    the map view, as an AQI tint. Free, no key.
// Without keys the sensor list is empty and the app keeps using the model AQI.
import { fetchJson } from './cache.js';
import { sharedBudget } from './providers/modelmaps.js';
import { pm25Aqi, purpleAirCorrect, aqiLevel, sensorConsensus } from '../../shared/aqi.js';
import { distanceMiles, boxAround } from '../../shared/lightning.js';
import { ptypeGrid } from '../../shared/stormcells.js';
import { snapBox } from './stormcells.js';

const MIN = 60_000;
export const AIRNOW_URL = 'https://www.airnowapi.org/aq/observation/latLong/current/';
export const AIRNOW_BOX_URL = 'https://www.airnowapi.org/aq/data/';
export const PURPLEAIR_URL = 'https://api.purpleair.com/v1/sensors';
const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const PA_FIELDS = 'name,latitude,longitude,pm2.5_10minute,humidity,last_seen,confidence';

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

export function airNowUrl({ lat, lon }, key, miles = 25) {
  const p = new URLSearchParams({ format: 'application/json', latitude: lat.toFixed(4), longitude: lon.toFixed(4), distance: String(miles), API_KEY: key });
  return `${AIRNOW_URL}?${p}`;
}

// AirNow's hourly data in a box (monitor by monitor), for the map.
export function airNowBoxUrl(box, key, now = Date.now()) {
  const hr = (ms) => new Date(ms).toISOString().slice(0, 13);
  const p = new URLSearchParams({
    startDate: hr(now - 2 * 3600_000), endDate: hr(now), parameters: 'PM25', BBOX: [box.west, box.south, box.east, box.north].map((n) => n.toFixed(3)).join(','),
    dataType: 'B', format: 'application/json', verbose: '1', monitorType: '0', includerawconcentrations: '0', API_KEY: key,
  });
  return `${AIRNOW_BOX_URL}?${p}`;
}

export function purpleAirUrl(box, maxAgeSec = 3600) {
  const p = new URLSearchParams({ fields: PA_FIELDS, location_type: '0', max_age: String(maxAgeSec), nwlat: box.north.toFixed(4), nwlng: box.west.toFixed(4), selat: box.south.toFixed(4), selng: box.east.toFixed(4) });
  return `${PURPLEAIR_URL}?${p}`;
}

// AirNow "current observation" list -> one reading per reporting area (PM2.5 first, else ozone).
export function parseAirNow(list, place) {
  const byArea = new Map();
  for (const o of Array.isArray(list) ? list : []) {
    if (o.AQI == null || o.AQI < 0) continue;
    const k = `${o.ReportingArea}|${o.StateCode}`;
    const prev = byArea.get(k);
    const rank = (x) => (x.ParameterName === 'PM2.5' ? 2 : x.ParameterName === 'O3' ? 1 : 0);
    if (!prev || rank(o) > rank(prev) || (rank(o) === rank(prev) && o.AQI > prev.AQI)) byArea.set(k, o);
  }
  return [...byArea.values()].map((o) => {
    const lat = Number(o.Latitude);
    const lon = Number(o.Longitude);
    const hour = String(o.HourObserved ?? 0).padStart(2, '0');
    return {
      id: `airnow-${o.ReportingArea}-${o.StateCode}`.replace(/\s+/g, '_'),
      source: 'airnow',
      official: true,
      name: `${o.ReportingArea}${o.StateCode ? `, ${o.StateCode}` : ''}`,
      lat: round(lat), lon: round(lon),
      miles: place ? Math.round(distanceMiles(place, { lat, lon }) * 10) / 10 : null,
      pollutant: o.ParameterName === 'O3' ? 'Ozone' : o.ParameterName,
      aqi: Math.round(o.AQI),
      level: aqiLevel(o.AQI)?.id || null,
      observed: o.DateObserved ? `${String(o.DateObserved).trim()} ${hour}:00 ${o.LocalTimeZone || ''}`.trim() : null,
    };
  });
}

// AirNow box data -> monitors (one row per site, PM2.5).
export function parseAirNowBox(list) {
  const bySite = new Map();
  for (const o of Array.isArray(list) ? list : []) {
    if (o.AQI == null || o.AQI < 0 || !Number.isFinite(o.Latitude)) continue;
    const id = o.FullAQSCode || o.IntlAQSCode || `${o.Latitude},${o.Longitude}`;
    const prev = bySite.get(id);
    if (!prev || String(o.UTC) > String(prev.UTC)) bySite.set(id, o);
  }
  return [...bySite.entries()].map(([id, o]) => ({
    id: `airnow-${id}`, source: 'airnow', official: true, name: o.SiteName || 'EPA monitor', lat: round(o.Latitude), lon: round(o.Longitude),
    pollutant: 'PM2.5', pm25: o.Value ?? null, aqi: Math.round(o.AQI), level: aqiLevel(o.AQI)?.id || null, observed: o.UTC ? `${o.UTC}Z` : null,
  }));
}

// PurpleAir's columns-and-rows answer -> corrected sensors. Sensors that have
// not reported in the hour or whose two lasers disagree (low confidence) are dropped.
export function parsePurpleAir(raw, place, now = Date.now()) {
  const fields = raw?.fields || [];
  const at = (name) => fields.indexOf(name);
  const idx = { id: at('sensor_index'), name: at('name'), lat: at('latitude'), lon: at('longitude'), pm: at('pm2.5_10minute'), rh: at('humidity'), seen: at('last_seen'), conf: at('confidence') };
  const out = [];
  for (const row of raw?.data || []) {
    const lat = row[idx.lat];
    const lon = row[idx.lon];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const seen = idx.seen >= 0 ? row[idx.seen] * 1000 : now;
    if (now - seen > 70 * MIN) continue;
    if (idx.conf >= 0 && row[idx.conf] != null && row[idx.conf] < 50) continue;
    const pm = purpleAirCorrect(row[idx.pm], idx.rh >= 0 ? row[idx.rh] : null);
    const aqi = pm25Aqi(pm);
    if (aqi == null) continue;
    out.push({
      id: `pa-${row[idx.id]}`, source: 'purpleair', official: false, name: String(row[idx.name] || 'PurpleAir sensor').slice(0, 60),
      lat: round(lat), lon: round(lon), miles: place ? Math.round(distanceMiles(place, { lat, lon }) * 10) / 10 : null,
      pollutant: 'PM2.5', pm25: pm, aqi, level: aqiLevel(aqi)?.id || null, observed: new Date(seen).toISOString(),
    });
  }
  return out;
}

// One AQI per grid cell from Open-Meteo's PM2.5 (the 24-hour scale applied to
// the current hour, as most smoke maps do).
export function smokeUrl(grid) {
  const lat = [];
  const lon = [];
  for (const la of grid.lats) for (const lo of grid.lons) { lat.push(la); lon.push(lo); }
  const p = new URLSearchParams({ latitude: lat.join(','), longitude: lon.join(','), current: 'pm2_5', timezone: 'GMT', domains: 'auto' });
  return `${AQ_URL}?${p}`;
}

export function encodeSmoke(raw, grid) {
  const pts = Array.isArray(raw) ? raw : [raw];
  if (pts.length !== grid.rows * grid.cols) throw new Error(`Expected ${grid.rows * grid.cols} points, got ${pts.length}`);
  let time = null;
  const aqi = pts.map((p) => {
    time ||= p.current?.time || null;
    return pm25Aqi(p.current?.pm2_5) ?? 0;
  });
  return { aqi, time: time ? `${time}Z`.replace(/ZZ$/, 'Z') : null, worst: Math.max(0, ...aqi) };
}

export class AirSensorService {
  constructor(cache, fetchImpl, { keys = () => ({}), log = console, budget = sharedBudget } = {}) {
    Object.assign(this, { cache, fetchImpl, keys, log, budget });
  }

  status() {
    const k = this.keys();
    return { airnow: !!k.airnow, purpleair: !!k.purpleair };
  }

  async airNowNear(place) {
    const { airnow } = this.keys();
    if (!airnow) return [];
    const k = `airnow:${place.lat.toFixed(2)},${place.lon.toFixed(2)}:${airnow.slice(-4)}`;
    return this.cache.wrap(k, 20 * MIN, async () => parseAirNow(await fetchJson(airNowUrl(place, airnow), { source: 'AirNow', fetchImpl: this.fetchImpl, timeoutMs: 12000 }), place));
  }

  async purpleAirBox(box) {
    const { purpleair } = this.keys();
    if (!purpleair) return [];
    const s = snapBox(box);
    const k = `purpleair:${s.south},${s.west},${s.north},${s.east}:${purpleair.slice(-4)}`;
    return this.cache.wrap(k, 10 * MIN, async () => parsePurpleAir(await fetchJson(purpleAirUrl(s), { source: 'PurpleAir', fetchImpl: this.fetchImpl, timeoutMs: 15000, headers: { 'X-API-Key': purpleair } })));
  }

  async airNowBox(box) {
    const { airnow } = this.keys();
    if (!airnow) return [];
    const s = snapBox(box);
    const k = `airnowbox:${s.south},${s.west},${s.north},${s.east}:${airnow.slice(-4)}`;
    return this.cache.wrap(k, 30 * MIN, async () => parseAirNowBox(await fetchJson(airNowBoxUrl(s, airnow), { source: 'AirNow', fetchImpl: this.fetchImpl, timeoutMs: 15000 })));
  }

  // Sensors within ~15 miles, closest first, plus the consensus AQI.
  async near(place, { miles = 15 } = {}) {
    const st = this.status();
    if (!st.airnow && !st.purpleair) return { sensors: [], consensus: null, keys: st };
    const box = boxAround(place, miles);
    const errors = [];
    const soft = (p, name) => p.catch((err) => { errors.push(name); this.log.warn?.({ err: err.message }, `${name} failed`); return []; });
    const [an, pa] = await Promise.all([soft(this.airNowNear(place), 'AirNow'), soft(this.purpleAirBox(box), 'PurpleAir')]);
    const withMiles = (s) => ({ ...s, miles: s.miles ?? Math.round(distanceMiles(place, s) * 10) / 10 });
    const sensors = [...an, ...pa].map(withMiles).filter((s) => s.miles <= Math.max(miles, 25)).sort((a, b) => a.miles - b.miles);
    return { sensors: sensors.slice(0, 40), total: sensors.length, consensus: sensorConsensus(sensors, { miles: Math.min(miles, 10) }) || sensorConsensus(sensors, { miles: 25 }), keys: st, errors };
  }

  async inBox(box) {
    const st = this.status();
    if (!st.airnow && !st.purpleair) return { sensors: [], keys: st };
    const soft = (p) => p.catch((err) => { this.log.warn?.({ err: err.message }, 'air sensors failed'); return []; });
    const [an, pa] = await Promise.all([soft(this.airNowBox(box)), soft(this.purpleAirBox(box))]);
    const inside = (s) => s.lat >= box.south && s.lat <= box.north && s.lon >= box.west && s.lon <= box.east;
    const sensors = [...an, ...pa].filter(inside);
    return { sensors: sensors.slice(0, 1500), total: sensors.length, keys: st };
  }

  async smoke(box) {
    const s = snapBox(box);
    return this.cache.wrap(`smoke:${s.south},${s.west},${s.north},${s.east}`, 30 * MIN, async () => {
      const grid = ptypeGrid(s);
      await this.budget.take(grid.rows * grid.cols);
      const raw = await fetchJson(smokeUrl(grid), { source: 'open-meteo-air', fetchImpl: this.fetchImpl, timeoutMs: 20000 });
      return { south: s.south, north: s.north, west: s.west, east: s.east, rows: grid.rows, cols: grid.cols, ...encodeSmoke(raw, grid) };
    });
  }
}

export function registerAirSensors(app, { sensors, latLonSchema, loc, boxSchema }) {
  const box = (q) => ({ south: q.south, north: q.north, west: Math.max(-180, q.west), east: Math.min(180, q.east) });
  const credit = (k) => [k.airnow && 'EPA AirNow (preliminary data)', k.purpleair && 'PurpleAir (EPA-corrected)'].filter(Boolean).join(' and ') || null;
  app.get('/api/air/sensors', { schema: latLonSchema }, async (req) => {
    const r = await sensors.near(loc(req.query));
    return { ...r, source: credit(r.keys) };
  });
  app.get('/api/air/sensors/box', { schema: boxSchema }, async (req) => {
    const q = req.query;
    if ((q.north - q.south) > 6 || (q.east - q.west) > 9) return { sensors: [], total: 0, zoomIn: true, keys: sensors.status() };
    const r = await sensors.inBox(box(q));
    return { ...r, source: credit(r.keys) };
  });
  app.get('/api/air/smoke', { schema: boxSchema }, async (req) => ({ ...(await sensors.smoke(box(req.query))), source: 'Open-Meteo air quality (Copernicus CAMS model)' }));
}
