// Marine & beach: waves, swell and water temperature (Open-Meteo Marine, free,
// no key), the National Weather Service forecast for the nearest coastal or
// Great Lakes marine zone, and the marine and beach hazards in effect (small
// craft advisories, gale warnings, rip currents, high surf).
import { fetchJson } from './cache.js';
import { normalizeAlerts } from './providers/nws.js';
import { movePoint } from '../../shared/stormcells.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const NWS = 'https://api.weather.gov';
export const BEACH_EVENTS = /rip current|beach hazard|high surf|coastal flood|lakeshore flood|tsunami|storm surge|hurricane|tropical storm/i;

export function marineUrl({ lat, lon }, units) {
  const imperial = units !== 'metric';
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature',
    daily: 'wave_height_max,wave_direction_dominant,wave_period_max,swell_wave_height_max',
    timezone: 'auto',
    forecast_days: '5',
    length_unit: imperial ? 'imperial' : 'metric',
    temperature_unit: imperial ? 'fahrenheit' : 'celsius',
    cell_selection: 'sea',
  });
  return `${MARINE_URL}?${p}`;
}

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function normalizeMarine(raw) {
  const c = raw?.current || {};
  const d = raw?.daily || {};
  if (c.wave_height == null && !(d.wave_height_max || []).some((v) => v != null)) return null;
  return {
    now: {
      waveHeight: r1(c.wave_height),
      wavePeriod: r1(c.wave_period),
      waveFrom: c.wave_direction ?? null,
      swellHeight: r1(c.swell_wave_height),
      swellPeriod: r1(c.swell_wave_period),
      water: c.sea_surface_temperature == null ? null : Math.round(c.sea_surface_temperature),
    },
    days: (d.time || []).map((date, i) => ({
      date,
      waveMax: r1(d.wave_height_max?.[i]),
      periodMax: r1(d.wave_period_max?.[i]),
      swellMax: r1(d.swell_wave_height_max?.[i]),
      from: d.wave_direction_dominant?.[i] ?? null,
    })),
    point: { lat: raw.latitude ?? null, lon: raw.longitude ?? null },
  };
}

// How the water feels for a swim or a small boat, from wave height (ft or m).
export function seaWord(h, units = 'imperial') {
  if (h == null) return null;
  const ft = units === 'metric' ? h * 3.281 : h;
  if (ft < 1) return { id: 'calm', label: 'Calm', kid: 'Flat water, like a big pool.' };
  if (ft < 3) return { id: 'small', label: 'Small waves', kid: 'Little waves, fun to splash in.' };
  if (ft < 5) return { id: 'moderate', label: 'Choppy', kid: 'Bigger waves. Stay close to a grown-up.' };
  if (ft < 8) return { id: 'rough', label: 'Rough', kid: 'Big waves. Too rough for swimming.' };
  return { id: 'very-rough', label: 'Very rough', kid: 'Huge waves. Stay off the beach edge.' };
}

// Points to try for the nearest marine zone: the place, then rings out to ~25 miles.
export function probePoints(place) {
  const out = [{ lat: place.lat, lon: place.lon }];
  for (const miles of [6, 14, 25]) for (let h = 0; h < 360; h += 45) out.push(movePoint(place, h, miles));
  return out;
}

export function normalizeZoneForecast(raw) {
  return (raw?.properties?.periods || []).slice(0, 4).map((p) => ({ name: p.name, text: String(p.detailedForecast || '').slice(0, 600) }));
}

export class MarineService {
  constructor(cache, fetchImpl, { userAgent = 'WeatherScout', log = console } = {}) {
    Object.assign(this, { cache, fetchImpl, userAgent, log });
  }

  nws(url) {
    return fetchJson(url, { source: 'nws', fetchImpl: this.fetchImpl, timeoutMs: 10000, headers: { 'User-Agent': this.userAgent, Accept: 'application/geo+json' } });
  }

  // The nearest coastal (or Great Lakes) marine zone within ~25 miles, or null. A week's cache.
  async zone(place) {
    return this.cache.wrap(`mzone:${place.lat.toFixed(2)},${place.lon.toFixed(2)}`, 7 * DAY, async () => {
      for (const p of probePoints(place)) {
        const raw = await this.nws(`${NWS}/zones?type=coastal&point=${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).catch(() => null);
        const f = raw?.features?.[0];
        if (f) return { id: f.properties?.id || String(f.id).split('/').pop(), name: f.properties?.name || '', at: p };
      }
      return null;
    });
  }

  async waves(point, units) {
    const k = `marine:${point.lat.toFixed(2)},${point.lon.toFixed(2)},${units}`;
    return this.cache.wrap(k, 60 * MIN, async () => normalizeMarine(await fetchJson(marineUrl(point, units), { source: 'open-meteo-marine', fetchImpl: this.fetchImpl, timeoutMs: 12000 })));
  }

  async report(place, { landAlerts = [] } = {}) {
    const units = place.units;
    const soft = (p) => p.catch((err) => { this.log.warn?.({ err: err.message }, 'marine part failed'); return null; });
    const zone = await soft(this.zone(place));
    const [forecast, zoneAlerts, waves] = await Promise.all([
      zone ? soft(this.cache.wrap(`mzfc:${zone.id}`, 30 * MIN, async () => normalizeZoneForecast(await this.nws(`${NWS}/zones/coastal/${zone.id}/forecast`)))) : null,
      zone ? soft(this.cache.wrap(`mzal:${zone.id}`, 2 * MIN, async () => normalizeAlerts(await this.nws(`${NWS}/alerts/active?zone=${zone.id}`)))) : null,
      soft(this.waves(zone?.at || place, units)),
    ]);
    const beach = landAlerts.filter((a) => BEACH_EVENTS.test(a.event || ''));
    const hazards = [...(zoneAlerts || []), ...beach].filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i)
      .map((a) => ({ id: a.id, event: a.event, severity: a.severity, headline: a.headline, ends: a.ends }));
    if (!zone && !waves) return { available: false, text: 'No coast or Great Lake within about 25 miles.' };
    return {
      available: true,
      zone: zone ? { id: zone.id, name: zone.name } : null,
      forecast: forecast || [],
      waves,
      sea: seaWord(waves?.now?.waveHeight, units),
      hazards,
      rip: hazards.some((h) => /rip current/i.test(h.event)),
      units: units === 'metric' ? { height: 'm', temp: '°C' } : { height: 'ft', temp: '°F' },
    };
  }
}

export function registerMarine(app, { marine, alerts, settle, latLonSchema, loc }) {
  app.get('/api/marine', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    const al = await settle(alerts(l));
    return { ...(await marine.report(l, { landAlerts: al?.alerts || [] })), source: 'Waves: Open-Meteo Marine. Forecast and hazards: National Weather Service' };
  });
}
