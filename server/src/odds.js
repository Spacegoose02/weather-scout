// Forecast odds: the ECMWF (51 runs) and GFS (31 runs) ensembles from
// Open-Meteo, pooled into the chance of rain, a soaking, snow, a freeze, heat
// and strong gusts for each of the next 7 days. Free, no key.
import { fetchJson } from './cache.js';
import { unitParams, unitLabels } from './providers/openmeteo.js';
import { dailyOdds, oddsHighlights } from '../../shared/odds.js';

const MIN = 60_000;
export const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
export const ODDS_MODELS = ['ecmwf_ifs025', 'gfs_seamless'];

export function oddsUrl({ lat, lon, units }) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: 'temperature_2m,precipitation,snowfall,wind_gusts_10m',
    models: ODDS_MODELS.join(','),
    forecast_days: '7',
    timezone: 'auto',
    ...unitParams(units),
  });
  return `${ENSEMBLE_URL}?${p}`;
}

export function buildOdds(raw, units, now = Date.now()) {
  const off = raw?.utc_offset_seconds || 0;
  const fromTime = new Date(now + off * 1000).toISOString().slice(0, 16);
  const { members, days } = dailyOdds(raw?.hourly, { units, fromTime });
  if (!members || !days.length) throw Object.assign(new Error('The ensemble forecast is not available right now.'), { statusCode: 502 });
  return {
    members,
    models: 'ECMWF (51 runs) and GFS (31 runs)',
    units: unitLabels(units),
    days,
    highlights: oddsHighlights(days, { units }),
    utcOffsetSeconds: off,
  };
}

export function registerOdds(app, { cache, fetchImpl, latLonSchema, loc }) {
  app.get('/api/forecast/odds', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    // Ensembles update every 6 hours; an hour's cache is plenty.
    const raw = await cache.wrap(`odds:${l.lat.toFixed(2)},${l.lon.toFixed(2)},${l.units}`, 60 * MIN, () => fetchJson(oddsUrl(l), { source: 'Open-Meteo ensembles', fetchImpl, timeoutMs: 20000 }));
    return { ...buildOdds(raw, l.units), source: 'ECMWF and NOAA GFS ensembles via Open-Meteo' };
  });
}
