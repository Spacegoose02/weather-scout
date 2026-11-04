// Crowd reports, river flooding and wildfires: the pieces shared by the server
// (parsing, storing) and the web app (cards, map pins). Pure functions only.
import { distanceMiles, bearing, compassWord } from './lightning.js';

export { distanceMiles, bearing, compassWord };

// ---- crowd reports ---------------------------------------------------------------
// What a person can report. `kid` is the line shown to kids after they report.
export const REPORT_KINDS = [
  { id: 'sunny', emoji: '☀️', label: 'Sunny', kid: 'Sunshine spotted!' },
  { id: 'cloudy', emoji: '☁️', label: 'Cloudy', kid: 'Clouds logged!' },
  { id: 'drizzle', emoji: '🌦️', label: 'Drizzle', kid: 'Tiny drops, big report!' },
  { id: 'rain', emoji: '🌧️', label: 'Rain', kid: 'Rain reported. Splash safely!' },
  { id: 'heavyrain', emoji: '⛈️', label: 'Heavy rain', kid: 'Wow, a downpour! Stay inside if there is thunder.' },
  { id: 'thunder', emoji: '🌩️', label: 'Thunder or lightning', kid: 'When thunder roars, go indoors!' },
  { id: 'hail', emoji: '🧊', label: 'Hail', kid: 'Hail! Stay inside until it stops.', hail: true },
  { id: 'snow', emoji: '🌨️', label: 'Snow', kid: 'Snow reported. Mittens on!' },
  { id: 'sleet', emoji: '🧂', label: 'Sleet or freezing rain', kid: 'Icy! Walk like a penguin.' },
  { id: 'fog', emoji: '🌫️', label: 'Fog', kid: 'Foggy! Clouds came down to say hi.' },
  { id: 'wind', emoji: '💨', label: 'Strong wind', kid: 'Windy! Hold on to your hat.' },
  { id: 'flooding', emoji: '🌊', label: 'Flooding', kid: 'Thank you! Never walk or ride through flood water.' },
  { id: 'smoke', emoji: '🔥', label: 'Smoky or hazy', kid: 'Smoky air reported. Play inside today.' },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow', kid: 'A rainbow! The sun is behind you and rain is in front.' },
  { id: 'frost', emoji: '❄️', label: 'Frost or ice', kid: 'Frosty! Look for ice crystals on the grass.' },
];
export const REPORT_KIND = Object.fromEntries(REPORT_KINDS.map((k) => [k.id, k]));

// Hail sizes from the NWS spotter guide, in inches.
export const HAIL_SIZES = [
  { in: 0.25, label: 'Pea' },
  { in: 0.5, label: 'Marble' },
  { in: 0.75, label: 'Penny' },
  { in: 1, label: 'Quarter' },
  { in: 1.5, label: 'Ping pong ball' },
  { in: 1.75, label: 'Golf ball' },
  { in: 2.5, label: 'Tennis ball' },
  { in: 2.75, label: 'Baseball' },
];
export const hailLabel = (inches) => HAIL_SIZES.find((h) => h.in === inches)?.label || (inches ? `${inches} in` : '');

export const REPORT_HOURS = 24; // how long reports stay on the map and in the card
export const NOTE_MAX = 140;

// Clean a note for showing to everyone, kids included: one line, no links, short.
export function cleanNote(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX);
}

// National Weather Service local storm reports (from the Iowa Environmental
// Mesonet GeoJSON feed) -> the same shape as our own reports.
const LSR_KIND = [
  [/tornado|funnel|waterspout/i, 'tornado', '🌪️'],
  [/hail/i, 'hail', '🧊'],
  [/flash flood|flood/i, 'flooding', '🌊'],
  [/tstm wnd|wind|gust|downburst/i, 'wind', '💨'],
  [/heavy snow|snow|blizzard/i, 'snow', '🌨️'],
  [/sleet|freezing|ice storm|glaze/i, 'sleet', '🧂'],
  [/heavy rain|rain/i, 'heavyrain', '⛈️'],
  [/lightning/i, 'thunder', '🌩️'],
  [/fog/i, 'fog', '🌫️'],
  [/wildfire|fire|smoke/i, 'smoke', '🔥'],
];

export function parseLsr(geo) {
  const out = [];
  for (const f of geo?.features || []) {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [p.lon, p.lat];
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) continue;
    const what = String(p.typetext || p.type || '');
    const hit = LSR_KIND.find(([re]) => re.test(what));
    const t = Date.parse(String(p.valid || p.utc_valid || '').replace(' ', 'T').replace(/(\d)$/, '$1Z'));
    if (!Number.isFinite(t)) continue;
    const mag = p.magnitude === '' || p.magnitude == null ? null : Number(p.magnitude);
    out.push({
      id: `lsr:${p.wfo || ''}:${t}:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}:${what}`,
      source: 'nws',
      kind: hit ? hit[1] : 'other',
      emoji: hit ? hit[2] : '📍',
      label: titleCase(what) || 'Storm report',
      magnitude: Number.isFinite(mag) ? mag : null,
      unit: p.unit || '',
      place: [p.city, p.state || p.st].filter(Boolean).join(', '),
      remark: String(p.remark || '').slice(0, 240),
      by: p.source ? titleCase(String(p.source)) : 'NWS',
      lat: Number(lat),
      lon: Number(lon),
      t,
    });
  }
  return out;
}

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bTstm\b/g, 'Thunderstorm').replace(/\bWnd\b/g, 'Wind').replace(/\bDmg\b/g, 'Damage');

// Reports near a place, newest first, with distance and direction.
export function reportsNear(reports, place, { miles = 25, now = Date.now(), hours = REPORT_HOURS } = {}) {
  const since = now - hours * 3600_000;
  return reports
    .filter((r) => r.t >= since)
    .map((r) => ({ ...r, miles: Math.round(distanceMiles(place, r) * 10) / 10, dir: compassWord(bearing(place, r)) }))
    .filter((r) => r.miles <= miles)
    .sort((a, b) => b.t - a.t);
}

// ---- rivers (NOAA National Water Prediction Service) ---------------------------------
export const FLOOD_LEVELS = {
  major: { rank: 5, label: 'Major flooding', color: '#b0008a', kid: 'The river is way out of its banks. Stay far away.' },
  moderate: { rank: 4, label: 'Moderate flooding', color: '#e0102b', kid: 'The river is flooding roads and yards.' },
  minor: { rank: 3, label: 'Minor flooding', color: '#f47b20', kid: 'The river is just over its banks.' },
  action: { rank: 2, label: 'Near flood stage', color: '#f5c400', kid: 'The river is high. Grown-ups are watching it.' },
  no_flooding: { rank: 1, label: 'Normal', color: '#2a9d5c', kid: 'The river is behaving.' },
};
export const floodLevel = (cat) => FLOOD_LEVELS[String(cat || '').toLowerCase()] || null;

export function parseGauges(raw) {
  const list = Array.isArray(raw) ? raw : raw?.gauges || [];
  return list.map((g) => {
    const obs = g.status?.observed || {};
    const fc = g.status?.forecast || {};
    const lat = Number(g.latitude);
    const lon = Number(g.longitude);
    if (!g.lid || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const stage = Number(obs.primary);
    const fcStage = Number(fc.primary);
    return {
      id: g.lid,
      name: g.name || g.lid,
      lat,
      lon,
      state: g.state?.abbreviation || '',
      stage: Number.isFinite(stage) && stage > -900 ? stage : null,
      unit: obs.primaryUnit || 'ft',
      flow: Number.isFinite(Number(obs.secondary)) && Number(obs.secondary) >= 0 ? Number(obs.secondary) : null,
      flowUnit: obs.secondaryUnit || '',
      category: floodLevel(obs.floodCategory) ? String(obs.floodCategory).toLowerCase() : null,
      observedAt: obs.validTime || null,
      forecast: Number.isFinite(fcStage) && fcStage > -900 ? { stage: fcStage, category: floodLevel(fc.floodCategory) ? String(fc.floodCategory).toLowerCase() : null, at: fc.validTime || null } : null,
      url: `https://water.noaa.gov/gauges/${String(g.lid).toLowerCase()}`,
    };
  }).filter(Boolean);
}

// The worst of now and the forecast, for sorting and the map pin color.
export function gaugeRank(g) {
  return Math.max(floodLevel(g.category)?.rank || 0, floodLevel(g.forecast?.category)?.rank || 0);
}

export function gaugesNear(gauges, place, { miles = 40 } = {}) {
  return gauges
    .map((g) => ({ ...g, miles: Math.round(distanceMiles(place, g) * 10) / 10, dir: compassWord(bearing(place, g)), rank: gaugeRank(g) }))
    .filter((g) => g.miles <= miles)
    .sort((a, b) => b.rank - a.rank || a.miles - b.miles);
}

// ---- Excessive Rainfall Outlook (NOAA Weather Prediction Center) ----------------------
export const ERO_LEVELS = [
  { id: 'none', rank: 0, label: 'No flood risk', chance: 'under 5%', kid: 'No flash floods expected.' },
  { id: 'marginal', rank: 1, label: 'Marginal', chance: 'at least 5%', kid: 'A small chance that heavy rain causes a flash flood.' },
  { id: 'slight', rank: 2, label: 'Slight', chance: 'at least 15%', kid: 'Heavy rain could flood some streets and creeks.' },
  { id: 'moderate', rank: 3, label: 'Moderate', chance: 'at least 40%', kid: 'Flash floods are likely around here. Stay away from creeks.' },
  { id: 'high', rank: 4, label: 'High', chance: 'at least 70%', kid: 'Dangerous flash floods are expected. Follow the grown-ups’ plan.' },
];

export function eroLevel(props) {
  const s = Object.values(props || {}).filter((v) => typeof v === 'string').join(' ');
  if (/\bhigh\b|\bHIGH\b/i.test(s)) return ERO_LEVELS[4];
  if (/\bmoderate\b|\bMDT\b/i.test(s)) return ERO_LEVELS[3];
  if (/\bslight\b|\bSLGT\b/i.test(s)) return ERO_LEVELS[2];
  if (/\bmarginal\b|\bMRGL\b/i.test(s)) return ERO_LEVELS[1];
  return null;
}

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function geometryContains(geom, lon, lat) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((rings) => rings.length && ringContains(rings[0], lon, lat) && !rings.slice(1).some((h) => ringContains(h, lon, lat)));
}

// The highest risk area of the outlook that covers the place.
export function eroAt(geo, { lat, lon }) {
  let best = ERO_LEVELS[0];
  for (const f of geo?.features || []) {
    const lvl = eroLevel(f.properties);
    if (lvl && lvl.rank > best.rank && geometryContains(f.geometry, lon, lat)) best = lvl;
  }
  return best;
}

// ---- wildfires (NIFC WFIGS current incidents) ---------------------------------------
export function parseFires(geo) {
  const out = [];
  for (const f of geo?.features || []) {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (p.IncidentTypeCategory && p.IncidentTypeCategory !== 'WF') continue; // skip prescribed burns
    const acres = Number(p.IncidentSize ?? p.DailyAcres);
    const pct = Number(p.PercentContained);
    out.push({
      id: String(p.IrwinID || p.UniqueFireIdentifier || p.OBJECTID || `${lat},${lon}`),
      name: titleFire(p.IncidentName),
      lat,
      lon,
      acres: Number.isFinite(acres) ? Math.round(acres) : null,
      contained: Number.isFinite(pct) ? Math.round(pct) : null,
      started: Number.isFinite(Number(p.FireDiscoveryDateTime)) ? new Date(Number(p.FireDiscoveryDateTime)).toISOString() : null,
      state: String(p.POOState || '').replace(/^US-/, ''),
    });
  }
  return out;
}

const titleFire = (s) => {
  const n = String(s || 'Unnamed').trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return /fire$|complex$/i.test(n) ? n : `${n} Fire`;
};

// Fires near a place, biggest threat first. `windFrom` is where the wind blows
// from (degrees); a fire in that direction is upwind, so its smoke may drift here.
export function firesNear(fires, place, { miles = 200, windFrom = null } = {}) {
  return fires
    .map((f) => {
      const b = bearing(place, f);
      const off = windFrom == null ? 180 : Math.abs(((b - windFrom + 540) % 360) - 180);
      const d = distanceMiles(place, f);
      return { ...f, miles: Math.round(d), dir: compassWord(b), upwind: windFrom != null && off <= 45 && d <= 150 };
    })
    .filter((f) => f.miles <= miles)
    .sort((a, b) => Number(b.upwind) - Number(a.upwind) || a.miles - b.miles);
}

// "Smoky air" from the Air Quality forecast: hours where PM2.5 drives the AQI over 100.
export function smokeOutlook(air) {
  const hours = (air?.hourly || []).filter((h) => h.aqi != null);
  const bad = hours.filter((h) => h.aqi > 100);
  const worst = hours.reduce((a, h) => (a == null || h.aqi > a.aqi ? h : a), null);
  const pm = air?.main?.id === 'pm25';
  return { worst, badHours: bad.length, firstBad: bad[0] || null, likelySmoke: pm && (air?.aqi ?? 0) > 50 };
}
