// Trip forecast: the weather along a drive, at the time you will be at each
// point. The route comes from the public OSRM demo server (OpenStreetMap data,
// no key, light use only), and the weather from Open-Meteo for up to 12 points
// along the way in one request.
import { fetchJson } from './cache.js';
import { unitParams, unitLabels } from './providers/openmeteo.js';
import { describeCode } from './weathercodes.js';
import { distanceMiles } from '../../shared/lightning.js';

const MIN = 60_000;
export const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MAX_POINTS = 12;
const ICE_CODES = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export const routeUrl = (from, to) => `${OSRM_URL}/${from.lon.toFixed(5)},${from.lat.toFixed(5)};${to.lon.toFixed(5)},${to.lat.toFixed(5)}?overview=simplified&geometries=geojson&steps=false`;

// Points along the route: the start, one about every `stepMin` minutes of
// driving, and the end, each with its distance and minutes from the start.
export function samplePoints(route, { stepMin = 30, max = MAX_POINTS } = {}) {
  const coords = route?.geometry?.coordinates || [];
  if (coords.length < 2) throw Object.assign(new Error('No driving route found between those places.'), { statusCode: 422 });
  const legs = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][1], lon: coords[i - 1][0] };
    const b = { lat: coords[i][1], lon: coords[i][0] };
    const d = distanceMiles(a, b);
    legs.push({ a, b, d, at: total });
    total += d;
  }
  const minutes = route.duration / 60;
  const count = Math.min(max, Math.max(2, Math.ceil(minutes / stepMin) + 1));
  const out = [];
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    const leg = legs.find((l) => l.at + l.d >= target) || legs.at(-1);
    const f = leg.d ? Math.min(1, Math.max(0, (target - leg.at) / leg.d)) : 0;
    out.push({
      lat: Math.round((leg.a.lat + (leg.b.lat - leg.a.lat) * f) * 1e4) / 1e4,
      lon: Math.round((leg.a.lon + (leg.b.lon - leg.a.lon) * f) * 1e4) / 1e4,
      miles: Math.round(target),
      minutes: Math.round((minutes * k) / (count - 1)),
    });
  }
  return { points: out, miles: Math.round(route.distance / 1609.344), minutes: Math.round(minutes) };
}

export function tripWeatherUrl(points, units) {
  const p = new URLSearchParams({
    latitude: points.map((x) => x.lat).join(','),
    longitude: points.map((x) => x.lon).join(','),
    hourly: 'temperature_2m,precipitation,snowfall,weather_code,wind_gusts_10m,visibility',
    forecast_days: '3',
    timezone: 'GMT',
    timeformat: 'unixtime',
    ...unitParams(units),
  });
  return `${FORECAST_URL}?${p}`;
}

// What to watch for at one point, worst first.
export function pointHazard(w, units) {
  const imperial = units !== 'metric';
  const freeze = imperial ? 32 : 0;
  const gustHigh = imperial ? 45 : 70;
  const heavy = imperial ? 0.3 : 7.5;
  if (ICE_CODES.has(w.code) || ((w.precip || 0) > 0 && w.temp != null && w.temp <= freeze && !SNOW_CODES.has(w.code))) return { id: 'ice', label: 'Icy roads', rank: 5 };
  if ((w.snow || 0) > 0 || SNOW_CODES.has(w.code)) return { id: 'snow', label: (w.snow || 0) >= (imperial ? 0.5 : 1.2) ? 'Heavy snow' : 'Snow', rank: 4 };
  if (w.code >= 95) return { id: 'storm', label: 'Thunderstorms', rank: 4 };
  if (w.visibility != null && w.visibility < 1000) return { id: 'fog', label: 'Fog, low visibility', rank: 3 };
  if ((w.precip || 0) >= heavy) return { id: 'heavyrain', label: 'Heavy rain', rank: 3 };
  if (w.gust != null && w.gust >= gustHigh) return { id: 'wind', label: 'Strong gusts', rank: 2 };
  if ((w.precip || 0) > 0) return { id: 'rain', label: 'Rain', rank: 1 };
  return null;
}

// Open-Meteo's list (one forecast per point) -> each point's weather at its arrival hour.
export function tripWeather(raw, points, depart, units) {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length !== points.length) throw new Error(`Expected ${points.length} points, got ${list.length}`);
  return points.map((p, i) => {
    const h = list[i].hourly || {};
    const eta = depart + p.minutes * MIN;
    const times = (h.time || []).map((t) => t * 1000);
    let k = times.findIndex((t) => t > eta - 30 * MIN);
    if (k < 0) k = times.length - 1;
    const w = {
      temp: h.temperature_2m?.[k] ?? null,
      precip: h.precipitation?.[k] ?? 0,
      snow: h.snowfall?.[k] ?? 0,
      code: h.weather_code?.[k] ?? null,
      gust: h.wind_gusts_10m?.[k] ?? null,
      visibility: h.visibility?.[k] ?? null,
    };
    const d = describeCode(w.code);
    return { ...p, eta, ...w, label: d.label, icon: d.icon, hazard: pointHazard(w, units) };
  });
}

export class TripService {
  constructor(cache, fetchImpl, { userAgent = 'WeatherScout' } = {}) {
    Object.assign(this, { cache, fetchImpl, userAgent });
  }

  async route(from, to) {
    const key = `route:${from.lat.toFixed(3)},${from.lon.toFixed(3)}:${to.lat.toFixed(3)},${to.lon.toFixed(3)}`;
    return this.cache.wrap(key, 60 * MIN, async () => {
      const r = await fetchJson(routeUrl(from, to), { source: 'OpenStreetMap routing (OSRM)', fetchImpl: this.fetchImpl, timeoutMs: 15000, headers: { 'user-agent': this.userAgent } });
      if (r.code !== 'Ok' || !r.routes?.length) throw Object.assign(new Error('No driving route found between those places.'), { statusCode: 422 });
      return r.routes[0];
    });
  }

  async trip({ from, to, depart = Date.now(), units = 'imperial' }) {
    if (distanceMiles(from, to) < 2) throw Object.assign(new Error('Those places are too close together for a trip forecast.'), { statusCode: 400 });
    const route = await this.route(from, to);
    const { points, miles, minutes } = samplePoints(route);
    if (minutes > 48 * 60) throw Object.assign(new Error('That drive is longer than the forecast covers.'), { statusCode: 400 });
    const raw = await this.cache.wrap(`trip:${points.map((p) => `${p.lat},${p.lon}`).join(';')}:${units}`, 30 * MIN, () => fetchJson(tripWeatherUrl(points, units), { source: 'open-meteo', fetchImpl: this.fetchImpl, timeoutMs: 15000 }));
    const stops = tripWeather(raw, points, depart, units);
    return {
      miles,
      minutes,
      depart,
      arrive: depart + minutes * MIN,
      units: unitLabels(units),
      stops,
      worst: stops.reduce((w, s) => (s.hazard && (!w || s.hazard.rank > w.hazard.rank) ? s : w), null),
      line: route.geometry.coordinates.map(([lo, la]) => [Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4]),
      source: 'Route: OpenStreetMap contributors via OSRM. Weather: Open-Meteo.',
    };
  }
}

export function registerTrip(app, { trips, defaultUnits = 'imperial' }) {
  const coord = { type: 'number' };
  app.get('/api/trip', {
    schema: {
      querystring: {
        type: 'object',
        required: ['fromLat', 'fromLon', 'toLat', 'toLon'],
        properties: {
          fromLat: { ...coord, minimum: -90, maximum: 90 },
          fromLon: { ...coord, minimum: -180, maximum: 180 },
          toLat: { ...coord, minimum: -90, maximum: 90 },
          toLon: { ...coord, minimum: -180, maximum: 180 },
          depart: { type: 'number' },
          units: { type: 'string', enum: ['imperial', 'metric'] },
        },
      },
    },
  }, async (req) => {
    const q = req.query;
    const now = Date.now();
    const depart = q.depart && q.depart > now - 60 * MIN && q.depart < now + 36 * 60 * MIN ? q.depart : now;
    return trips.trip({ from: { lat: q.fromLat, lon: q.fromLon }, to: { lat: q.toLat, lon: q.toLon }, depart, units: q.units || defaultUnits });
  });
}
