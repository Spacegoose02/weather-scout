// Drought & El Niño: this week's US Drought Monitor category at a place, and
// the state of El Niño / La Niña from NOAA's Climate Prediction Center (the
// official alert status, its one-line synopsis and the weekly Niño 3.4 sea
// temperature). All free, no key; both update weekly, so long caches.
import { fetchJson, UpstreamError } from './cache.js';

const HOUR = 3600_000;
export const USDM_URL = 'https://droughtmonitor.unl.edu/data/json/usdm_current.json';
export const ENSO_DISC_URL = 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml';
export const NINO_WEEKLY_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for';

export const DROUGHT = [
  { level: -1, code: 'None', label: 'No drought', color: '#2fa84f', kid: 'The ground has enough water right now.' },
  { level: 0, code: 'D0', label: 'Abnormally dry', color: '#ffff00', kid: 'It has been drier than usual. Plants may be a little thirsty.' },
  { level: 1, code: 'D1', label: 'Moderate drought', color: '#fcd37f', kid: 'Not enough rain lately. Lawns turn brown and streams get low.' },
  { level: 2, code: 'D2', label: 'Severe drought', color: '#ffaa00', kid: 'A long dry spell. Farmers worry about crops, and there may be water limits.' },
  { level: 3, code: 'D3', label: 'Extreme drought', color: '#e60000', kid: 'Very dry for a long time. Crops and forests suffer and fires start easily.' },
  { level: 4, code: 'D4', label: 'Exceptional drought', color: '#730000', kid: 'The worst kind of drought. Water is very scarce.' },
];

// Ray casting on one ring of [lon, lat] points.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon({ lat, lon }, geometry) {
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.some((rings) => rings.length && inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)));
}

const dmOf = (p = {}) => {
  const v = p.DM ?? p.dm ?? p.Dm ?? (typeof p.category === 'string' ? p.category.replace(/\D/g, '') : null);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : null;
};

// The worst drought category covering the place (categories nest: D2 sits inside D1).
export function droughtAt(geo, place) {
  let worst = -1;
  for (const f of geo?.features || []) {
    const dm = dmOf(f.properties);
    if (dm == null || dm <= worst) continue;
    if (inPolygon(place, f.geometry)) worst = dm;
  }
  return DROUGHT.find((d) => d.level === worst);
}

export function mapDate(geo) {
  const p = geo?.features?.[0]?.properties || {};
  const raw = String(p.ValidStart || p.MapDate || p.valid_start || geo?.MapDate || '');
  const m = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// The CPC ENSO discussion -> { status, synopsis, issued }.
export function parseEnsoDiscussion(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&ntilde;/g, 'ñ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const status = text.match(/ENSO Alert System Status:\s*([^.]+?)(?:\s{2,}|\.|Synopsis)/i)?.[1]?.trim() || null;
  const synopsis = text.match(/Synopsis:\s*([^.]+\.)/i)?.[1]?.trim() || null;
  const issued = text.match(/issued by\s+CLIMATE PREDICTION CENTER[^0-9]*?(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/i)?.[1] || null;
  return { status, synopsis, issued };
}

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

// The weekly SST file -> the last `weeks` Niño 3.4 anomalies (°C), oldest first.
export function parseNinoWeekly(text, weeks = 12) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(\d{2})([A-Z]{3})(\d{4})\s+(.*)$/);
    if (!m || MONTHS[m[2]] == null) continue;
    const nums = (m[4].match(/-?\d+\.\d/g) || []).map(Number);
    if (nums.length < 8) continue;
    out.push({ week: new Date(Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]))).toISOString().slice(0, 10), nino34: nums[5] });
  }
  return out.slice(-weeks);
}

// What the anomaly means: El Niño at +0.5 °C or more, La Niña at -0.5 or less.
export function ensoPhase(anom) {
  if (anom == null) return null;
  if (anom >= 1.5) return { id: 'elnino', label: 'Strong El Niño conditions', short: 'El Niño' };
  if (anom >= 0.5) return { id: 'elnino', label: 'El Niño conditions', short: 'El Niño' };
  if (anom <= -1.5) return { id: 'lanina', label: 'Strong La Niña conditions', short: 'La Niña' };
  if (anom <= -0.5) return { id: 'lanina', label: 'La Niña conditions', short: 'La Niña' };
  return { id: 'neutral', label: 'Neutral (neither)', short: 'Neutral' };
}

// A rough "what it usually means for your winter" for the lower 48. These are
// the classic NOAA winter patterns; any one winter can differ.
export function winterHint(phaseId, { lat, lon }) {
  const us = lat > 24 && lat < 50 && lon > -125 && lon < -66;
  if (!us || phaseId === 'neutral' || !phaseId) return null;
  const north = lat >= 40;
  const south = lat < 36;
  const west = lon < -104;
  if (phaseId === 'lanina') {
    if (south) return 'La Niña winters are usually warmer and drier than normal across the southern US.';
    if (north && !west) return 'La Niña winters are often colder and snowier than normal across the northern US and Great Lakes.';
    if (north && west) return 'La Niña winters usually bring more rain and mountain snow to the Pacific Northwest and northern Rockies.';
    return 'La Niña winters are mixed in the middle of the country, often with big temperature swings.';
  }
  if (south) return 'El Niño winters are usually cooler and wetter than normal across the southern US.';
  if (north) return 'El Niño winters are usually milder than normal across the northern US, with less snow.';
  return 'El Niño winters are often near normal in the middle of the country.';
}

export class ClimateService {
  constructor(cache, fetchImpl, { log = console } = {}) {
    Object.assign(this, { cache, fetchImpl, log });
  }

  async usdm() {
    return this.cache.wrap('usdm', 12 * HOUR, () => fetchJson(USDM_URL, { source: 'US Drought Monitor', fetchImpl: this.fetchImpl, timeoutMs: 30000 }));
  }

  async text(url, key) {
    return this.cache.wrap(key, 12 * HOUR, async () => {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new UpstreamError('the Climate Prediction Center', res.status);
      return res.text();
    });
  }

  async report(place) {
    const soft = (p, what) => p.catch((err) => { this.log.warn?.({ err: err.message }, `${what} failed`); return null; });
    const [usdm, disc, weekly] = await Promise.all([
      soft(this.usdm(), 'drought monitor'),
      soft(this.text(ENSO_DISC_URL, 'enso:disc'), 'ENSO discussion'),
      soft(this.text(NINO_WEEKLY_URL, 'enso:weekly'), 'Niño 3.4'),
    ]);
    const inUs = place.lat > 17 && place.lat < 72 && place.lon > -180 && place.lon < -64;
    const drought = usdm && inUs ? { ...droughtAt(usdm, place), mapDate: mapDate(usdm) } : null;
    const weeks = weekly ? parseNinoWeekly(weekly) : [];
    const latest = weeks.at(-1) || null;
    const phase = ensoPhase(latest?.nino34);
    const d = disc ? parseEnsoDiscussion(disc) : {};
    const statusPhase = /la ni/i.test(d.status || '') ? 'lanina' : /el ni/i.test(d.status || '') ? 'elnino' : d.status ? 'neutral' : phase?.id;
    return {
      drought,
      droughtAvailable: !!usdm,
      enso: weeks.length || d.status ? {
        status: d.status || null,
        synopsis: d.synopsis || null,
        issued: d.issued || null,
        nino34: latest?.nino34 ?? null,
        week: latest?.week ?? null,
        phase,
        weeks,
        winter: winterHint(statusPhase, place),
      } : null,
    };
  }
}

export function registerClimate(app, { climate, latLonSchema, loc }) {
  app.get('/api/climate', { schema: latLonSchema }, async (req) => ({
    ...(await climate.report(loc(req.query))),
    source: 'U.S. Drought Monitor (NDMC, USDA, NOAA) and NOAA Climate Prediction Center',
  }));
}
