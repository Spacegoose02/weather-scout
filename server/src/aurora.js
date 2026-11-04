// Northern (and southern) lights outlook from NOAA's Space Weather Prediction
// Center: the planetary K-index forecast (3-hour blocks for the next 3 days)
// and the OVATION aurora model (chance of aurora overhead, on a 1° grid).
// Free, no key. Which Kp reaches a place depends on its geomagnetic latitude,
// so the "how far south can it be seen" line here is an approximation of
// NOAA's view line, good to a few degrees.
import { fetchJson } from './cache.js';

export const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
export const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const SOURCE = 'NOAA Space Weather Prediction Center';

// Geomagnetic north pole (IGRF-14 dipole, 2025), used for a dipole approximation.
const POLE = { lat: 80.8, lon: -72.6 };
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function magneticLatitude(lat, lon) {
  const s = Math.sin(rad(lat)) * Math.sin(rad(POLE.lat)) + Math.cos(rad(lat)) * Math.cos(rad(POLE.lat)) * Math.cos(rad(lon - POLE.lon));
  return Math.round(deg(Math.asin(Math.max(-1, Math.min(1, s)))) * 10) / 10;
}

// About which Kp brings the aurora into view (low on the poleward horizon) at a
// geomagnetic latitude: Kp 5 around 54°, Kp 7 around 50°, Kp 9 around 46°.
export function kpNeeded(magLat) {
  const k = (64.5 - Math.abs(magLat)) / 2;
  return Math.round(Math.max(0, k) * 10) / 10;
}

// NOAA storm scale for a Kp value.
export function gScale(kp) {
  if (kp >= 9) return 'G5';
  if (kp >= 8) return 'G4';
  if (kp >= 7) return 'G3';
  if (kp >= 6) return 'G2';
  if (kp >= 5) return 'G1';
  return null;
}

// The Kp product has been an array of rows with a header row, and later an
// array of objects. Accept both. Times are UTC.
export function parseKp(raw) {
  if (!Array.isArray(raw)) return [];
  let rows = raw;
  if (Array.isArray(raw[0])) {
    const head = raw[0].map((h) => String(h).toLowerCase());
    rows = raw.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  }
  return rows
    .map((r) => {
      const t = Date.parse(`${String(r.time_tag || '').replace(' ', 'T').replace(/Z?$/, 'Z')}`);
      const kp = Number(r.kp ?? r.kp_index ?? r.estimated_kp);
      return { t, kp, kind: String(r.observed || r.type || 'predicted').toLowerCase() };
    })
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.kp));
}

// OVATION: { "Forecast Time": "...", coordinates: [[lon 0..359, lat -90..90, chance 0..100], ...] }.
export function parseOvation(raw) {
  const grid = new Map();
  for (const c of raw?.coordinates || []) {
    if (!Array.isArray(c) || c.length < 3) continue;
    grid.set(`${Math.round(c[0])},${Math.round(c[1])}`, Number(c[2]) || 0);
  }
  return { forecastTime: raw?.['Forecast Time'] || null, grid };
}

// Chance overhead at the place, and the best chance within 10° toward the pole
// (what may be seen low on the horizon).
export function ovationAt(ov, lat, lon) {
  if (!ov?.grid?.size) return null;
  const lo = ((Math.round(lon) % 360) + 360) % 360;
  const la = Math.round(lat);
  const at = (y) => ov.grid.get(`${lo},${y}`) ?? 0;
  const step = la >= 0 ? 1 : -1;
  let horizon = 0;
  for (let i = 1; i <= 10; i++) horizon = Math.max(horizon, at(la + i * step));
  return { overhead: at(la), horizon };
}

// "Tonight": from now (or 6 PM local, if that is later) to 6 AM local tomorrow.
export function nightWindow(now, offsetSec) {
  const local = new Date(now + offsetSec * 1000);
  const h = local.getUTCHours();
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetSec * 1000;
  if (h < 6) return { from: now, to: dayStart + 6 * 3600_000 };
  return { from: Math.max(now, dayStart + 18 * 3600_000), to: dayStart + 30 * 3600_000 };
}

const ONE = (n) => Math.round(n * 10) / 10;

// The outlook for one place. `fc` (optional) is the normalized forecast, used for
// the UTC offset and tonight's cloud cover.
export function auroraOutlook({ lat, lon }, kpRows, ov, { now = Date.now(), fc = null } = {}) {
  const off = fc?.utcOffsetSeconds || 0;
  const mag = magneticLatitude(lat, lon);
  const needed = kpNeeded(mag);
  const south = mag < 0;
  const name = south ? 'southern lights' : 'northern lights';
  const look = south ? 'south' : 'north';
  const win = nightWindow(now, off);
  // A 3-hour Kp block that overlaps tonight counts.
  const tonight = kpRows.filter((r) => r.t + 3 * 3600_000 > win.from && r.t < win.to);
  const peak = tonight.reduce((a, r) => (a == null || r.kp > a.kp ? r : a), null);
  const nowRow = kpRows.filter((r) => r.t <= now).at(-1) || null;
  const next3 = kpRows.filter((r) => r.t + 3 * 3600_000 > now && r.t < now + 72 * 3600_000);
  const best3 = next3.reduce((a, r) => (a == null || r.kp > a.kp ? r : a), null);
  const kpTonight = peak ? ONE(peak.kp) : null;
  const margin = kpTonight == null ? null : kpTonight - needed;
  const ovHere = ovationAt(ov, lat, lon);

  let chance = 'unlikely';
  if (margin != null && margin >= 0.5) chance = 'likely';
  else if (margin != null && margin >= -0.7) chance = 'possible';
  if (ovHere && ovHere.overhead >= 20) chance = 'likely';
  else if (ovHere && ovHere.horizon >= 10 && chance === 'unlikely' && margin != null && margin >= -1.5) chance = 'possible';
  if (needed > 9) chance = 'unlikely';

  const nightHours = (fc?.hourly || []).filter((h) => h.epoch >= win.from && h.epoch < win.to && h.cloudCover != null);
  const cloudsTonight = nightHours.length ? Math.round(nightHours.reduce((s, h) => s + h.cloudCover, 0) / nightHours.length) : null;

  const storm = gScale(kpTonight ?? 0);
  const strength = kpTonight == null ? '' : `Kp ${kpTonight}${storm ? `, a ${storm} geomagnetic storm` : ''}`;
  let text;
  if (needed > 9) text = `The ${name} almost never reach this far from the magnetic pole. Even the biggest storms rarely make it here.`;
  else if (chance === 'likely') text = `Space weather is strong enough tonight (${strength}) for the ${name} to show up here. It usually takes Kp ${needed} at this spot.`;
  else if (chance === 'possible') text = `The ${name} might peek over the ${look}ern horizon tonight. The forecast says ${strength}, and this spot usually needs about Kp ${needed}.`;
  else text = `The ${name} are not expected this far ${south ? 'north' : 'south'} tonight${strength ? ` (${strength}; this spot needs about Kp ${needed})` : ''}.`;
  if (chance !== 'unlikely' && cloudsTonight != null && cloudsTonight >= 80) text += ' Clouds may hide it though.';

  const kid = chance === 'unlikely'
    ? `The Sun is calm-ish tonight, so the ${name} are staying far ${look}. Maybe another night!`
    : `The Sun threw extra energy at Earth! When it hits the air high up, the sky can glow green and pink. Look ${look} after dark, far from bright lights. A phone camera often sees the colors better than our eyes.`;

  return {
    magLat: mag,
    needed,
    kpNow: nowRow ? ONE(nowRow.kp) : null,
    kpTonight,
    storm,
    peakAt: peak ? new Date(peak.t).toISOString() : null,
    best3Days: best3 ? { kp: ONE(best3.kp), at: new Date(best3.t).toISOString(), storm: gScale(best3.kp) } : null,
    chance,
    look,
    name,
    text,
    kid,
    ovation: ovHere,
    cloudsTonight,
    source: SOURCE,
  };
}

export class AuroraService {
  constructor(cache, fetchImpl) {
    this.cache = cache;
    this.fetchImpl = fetchImpl;
  }

  kp() {
    return this.cache.wrap('aurora:kp', 30 * 60_000, async () => parseKp(await fetchJson(KP_URL, { source: 'swpc', fetchImpl: this.fetchImpl })));
  }

  async ovation() {
    try {
      return await this.cache.wrap('aurora:ovation', 30 * 60_000, async () => parseOvation(await fetchJson(OVATION_URL, { source: 'swpc', fetchImpl: this.fetchImpl })));
    } catch {
      return null; // the Kp forecast alone is enough
    }
  }

  async outlook(place, fc, now = Date.now()) {
    const [kp, ov] = await Promise.all([this.kp(), this.ovation()]);
    return auroraOutlook(place, kp, ov, { now, fc });
  }
}
