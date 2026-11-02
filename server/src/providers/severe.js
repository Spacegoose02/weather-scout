// Nationwide severe weather for the full-screen radar, all public NOAA data:
// - every active NWS alert drawn as a polygon (warnings issued for a storm-based area)
// - SPC convective outlooks (Day 1-3)
// - the NEXRAD radar sites, for the single-site picker
import { fetchJson } from '../cache.js';
import { kidSummary } from './nws.js';

export const NWS_ACTIVE = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert,update';
export const SPC_OUTLOOK = (day) => `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.lyr.geojson`;
export const NEXRAD_SITES = 'https://mesonet.agron.iastate.edu/geojson/network/NEXRAD.geojson';
export const RIDGE_STATUS = 'https://mesonet.agron.iastate.edu/json/ridge_current.py?product=N0B';

// NWS map colors for the most common products (weather.gov/help-map).
const COLORS = [
  [/tornado warning/i, '#ff0000'], [/severe thunderstorm warning/i, '#ffa500'], [/flash flood warning/i, '#8b0000'],
  [/extreme wind warning/i, '#ff8c00'], [/special marine warning/i, '#ffa500'], [/hurricane warning/i, '#dc143c'],
  [/tropical storm warning/i, '#b22222'], [/storm surge warning/i, '#b524f7'], [/flood warning/i, '#00ff00'],
  [/tornado watch/i, '#ffff00'], [/severe thunderstorm watch/i, '#db7093'], [/flash flood watch|flood watch/i, '#2e8b57'],
  [/blizzard/i, '#ff4500'], [/ice storm/i, '#8b008b'], [/winter storm warning/i, '#ff69b4'], [/winter weather advisory/i, '#7b68ee'],
  [/red flag/i, '#ff1493'], [/excessive heat|extreme heat/i, '#c71585'], [/heat advisory/i, '#ff7f50'],
  [/high wind warning/i, '#daa520'], [/wind advisory/i, '#d2b48c'], [/dense fog/i, '#708090'], [/flood advisory/i, '#00ff7f'],
  [/special weather statement/i, '#ffe4b5'], [/gale/i, '#dda0dd'], [/small craft/i, '#d8bfd8'], [/freeze|frost/i, '#6495ed'],
];
export const alertColor = (event) => COLORS.find(([re]) => re.test(event || ''))?.[1] || '#c0c0c0';

// Higher draws on top and sorts first.
export function alertRank(event = '', severity = '') {
  if (/tornado warning/i.test(event)) return 100;
  if (/(severe thunderstorm|flash flood|extreme wind) warning/i.test(event)) return 90;
  if (/warning/i.test(event)) return 70 + (severity === 'Extreme' ? 10 : severity === 'Severe' ? 5 : 0);
  if (/watch/i.test(event)) return 50;
  if (/advisory/i.test(event)) return 30;
  return 10;
}

export function normalizeNational(raw) {
  const out = [];
  for (const f of raw?.features || []) {
    const p = f.properties || {};
    if (!f.geometry || !p.event) continue;
    out.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: String(p.id || f.id || ''),
        event: p.event,
        headline: p.headline || null,
        severity: p.severity || 'Unknown',
        area: (p.areaDesc || '').slice(0, 300),
        sender: p.senderName || null,
        ends: p.ends || p.expires || null,
        color: alertColor(p.event),
        rank: alertRank(p.event, p.severity),
        kid: kidSummary(p.event),
      },
    });
  }
  out.sort((a, b) => a.properties.rank - b.properties.rank); // lowest first, so warnings draw on top
  const counts = { warning: 0, watch: 0, advisory: 0 };
  for (const f of out) {
    const e = f.properties.event;
    if (/warning|emergency/i.test(e)) counts.warning++;
    else if (/watch/i.test(e)) counts.watch++;
    else counts.advisory++;
  }
  return { type: 'FeatureCollection', features: out, counts };
}

export async function getNationalAlerts({ userAgent, fetchImpl }) {
  const raw = await fetchJson(NWS_ACTIVE, { source: 'nws', fetchImpl, timeoutMs: 20000, headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' } });
  return { ...normalizeNational(raw), source: 'National Weather Service', fetchedAt: new Date().toISOString() };
}

const OUTLOOK_WORDS = {
  TSTM: ['General thunder', 'Ordinary thunderstorms are possible.'],
  MRGL: ['1 · Marginal', 'Isolated severe storms possible.'],
  SLGT: ['2 · Slight', 'Scattered severe storms possible.'],
  ENH: ['3 · Enhanced', 'Numerous severe storms possible.'],
  MDT: ['4 · Moderate', 'Widespread severe storms likely.'],
  HIGH: ['5 · High', 'A major severe weather outbreak is expected.'],
};
const HEX = /^#[0-9a-f]{3,8}$/i;

export function normalizeOutlook(raw, day) {
  const features = (raw?.features || []).filter((f) => f.geometry && OUTLOOK_WORDS[f.properties?.LABEL]).map((f) => {
    const p = f.properties;
    const [name, meaning] = OUTLOOK_WORDS[p.LABEL];
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        label: p.LABEL, name, meaning,
        fill: HEX.test(p.fill || '') ? p.fill : '#c1e9c1',
        stroke: HEX.test(p.stroke || '') ? p.stroke : '#55bb55',
        valid: p.VALID_ISO || p.VALID || null, expires: p.EXPIRE_ISO || p.EXPIRE || null,
      },
    };
  });
  return { type: 'FeatureCollection', day, features, source: 'NOAA Storm Prediction Center' };
}

export async function getOutlook(day, fetchImpl) {
  return normalizeOutlook(await fetchJson(SPC_OUTLOOK(day), { source: 'Storm Prediction Center', fetchImpl, timeoutMs: 15000 }), day);
}

export async function getNexradSites(fetchImpl, now = Date.now()) {
  const [geo, status] = await Promise.all([
    fetchJson(NEXRAD_SITES, { source: 'IEM', fetchImpl, timeoutMs: 15000 }),
    fetchJson(RIDGE_STATUS, { source: 'IEM', fetchImpl, timeoutMs: 15000 }).catch(() => null),
  ]);
  const valid = new Map((status?.meta || []).map((m) => [m.site, m.valid]));
  return (geo?.features || []).map((f) => {
    const id = String(f.properties?.sid || f.id || '').toUpperCase();
    const [lon, lat] = f.geometry?.coordinates || [];
    const v = valid.get(id);
    return { id, name: f.properties?.sname || id, lat, lon, latest: v || null, online: v ? now - Date.parse(v) < 30 * 60_000 : null };
  }).filter((s) => /^[A-Z0-9]{3,4}$/.test(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lon));
}
