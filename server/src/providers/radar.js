import { fetchJson } from '../cache.js';
import { NEXRAD_EXTENT, RADAR_VIEW, pairFill } from '../../../shared/radarcoverage.js';

// Radar frames for a smooth, loopable map. The Iowa Environmental Mesonet serves
// NEXRAD base reflectivity composites as map tiles in 5-minute steps, with no key.
// The browser loads tiles directly from IEM, so this server only builds the list.
const IEM = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0';

const tile = (layer) => `${IEM}/${layer}/{z}/{x}/{y}.png`;

// IEM keeps the latest mosaic plus 5-minute offsets m05m..m55m.
function loop(base, now, count) {
  const step = 5 * 60_000;
  const latest = Math.floor(now / step) * step;
  const frames = [];
  for (let i = count - 1; i >= 0; i--) {
    const minutes = i * 5;
    const layer = minutes === 0 ? base : `${base}-m${String(minutes).padStart(2, '0')}m`;
    frames.push({ time: new Date(latest - minutes * 60_000).toISOString(), url: tile(layer) });
  }
  return frames;
}

// HRRR simulated reflectivity ("future radar"), one frame per hour of the latest run.
function future(now, hours = 12) {
  const base = Math.floor(now / 3_600_000) * 3_600_000;
  return Array.from({ length: hours + 1 }, (_, h) => ({
    time: new Date(base + h * 3_600_000).toISOString(),
    lead: h,
    url: tile(`hrrr::REFD-F${String(h * 60).padStart(4, '0')}-0`),
  }));
}

// One NEXRAD's latest scan of a Level III product, lowest tilt (0.5°).
const siteTile = (code) => tile(`ridge::{site}-${code}-0`);

// IEM only renders a single-site product when that radar sent it, and the
// "-0" (latest) tile is blank when it did not, so the map looked empty. IEM's
// radar.py says which products a radar has and lists every scan, which also
// gives us real frames to loop. Each product lists NWS codes best first.
export const SITE_CODES = {
  site: ['N0B', 'N0Q', 'N0R'],
  velocity: ['N0G', 'N0U', 'N0V'],
  srv: ['N0S'],
  cc: ['N0C'],
  zdr: ['N0X'],
  kdp: ['N0K'],
};
export const IEM_RADAR_JSON = 'https://mesonet.agron.iastate.edu/json/radar.py';
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const stamp = (ts) => ts.replace(/[^0-9]/g, '').slice(0, 12); // 2026-11-05T00:31:00Z -> 202611050031

// Which of our single-site products this radar has sent in the last two hours.
export async function siteProductCodes(site, fetchImpl, now = Date.now()) {
  const url = `${IEM_RADAR_JSON}?operation=products&radar=${site}&start=${iso(now - 2 * 3_600_000)}`;
  const raw = await fetchJson(url, { source: 'IEM', fetchImpl, timeoutMs: 15000 });
  const have = new Set((raw?.products || []).map((p) => String(p.id || '').toUpperCase()));
  const out = {};
  for (const [id, codes] of Object.entries(SITE_CODES)) {
    const code = codes.find((c) => have.has(c));
    if (code) out[id] = code;
  }
  return out;
}

// The last hour of one radar's scans of one product, oldest first, as tile frames.
export async function siteScans(site, code, fetchImpl, now = Date.now(), count = 12) {
  const url = `${IEM_RADAR_JSON}?operation=list&radar=${site}&product=${code}&start=${iso(now - 3_600_000)}&end=${iso(now + 300_000)}`;
  const raw = await fetchJson(url, { source: 'IEM', fetchImpl, timeoutMs: 15000 });
  const seen = new Set();
  const frames = [];
  for (const s of raw?.scans || []) {
    const t = Date.parse(s.ts);
    if (!Number.isFinite(t) || seen.has(stamp(s.ts))) continue;
    seen.add(stamp(s.ts));
    frames.push({ time: new Date(t).toISOString(), url: tile(`ridge::${site}-${code}-${stamp(s.ts)}`) });
  }
  frames.sort((a, b) => a.time.localeCompare(b.time));
  return frames.slice(-count);
}

// Everything the full-screen radar can show. Single-site products come from one
// NEXRAD, picked on the map: super-resolution reflectivity (N0B), Doppler
// velocity (N0U) and storm-relative velocity (N0S), and the dual-pol products
// correlation coefficient (N0C), differential reflectivity (N0X) and specific
// differential phase (N0K).
export function radarProducts(now = Date.now()) {
  return [
    { id: 'composite', name: 'Radar', note: 'All US NEXRAD radars stitched together, last hour', legend: 'dbz', frames: loop('nexrad-n0q-900913', now, 11) },
    { id: 'site', name: 'Reflectivity', note: 'One radar up close (super-resolution reflectivity). Tap a radar on the map to switch.', legend: 'dbz', site: true, template: siteTile('N0B') },
    { id: 'velocity', name: 'Velocity', note: 'Base velocity: wind toward (green) or away from (red) the radar. Spins and downbursts show here.', legend: 'vel', site: true, template: siteTile('N0U') },
    { id: 'srv', name: 'Storm-relative velocity', note: 'Velocity with the storm\'s own motion taken out, so rotation (mesocyclones) stands out.', legend: 'vel', site: true, template: siteTile('N0S') },
    { id: 'cc', name: 'Correlation coefficient', note: 'Dual-pol CC: how alike the targets are. A low-CC spot on a velocity couplet can mean tornado debris.', legend: 'cc', site: true, template: siteTile('N0C') },
    { id: 'zdr', name: 'Differential reflectivity (ZDR)', note: 'Dual-pol ZDR: flat targets (big raindrops) are high, round tumbling hail is near zero.', legend: 'zdr', site: true, template: siteTile('N0X') },
    { id: 'kdp', name: 'Specific differential phase (KDP)', note: 'Dual-pol KDP: how much liquid water is in the beam. High means very heavy rain, not hail.', legend: 'kdp', site: true, template: siteTile('N0K') },
    { id: 'echotops', name: 'Echo tops', note: 'How tall the storms are. Taller usually means stronger.', legend: 'eet', frames: loop('nexrad-eet-900913', now, 11) },
    { id: 'rain1h', name: 'Rain, 1 hour', note: 'Radar-estimated rain in the last hour (MRMS)', legend: 'rain1', frames: [{ time: null, url: tile('q2-n1p-900913') }] },
    { id: 'rain24h', name: 'Rain, 24 hours', note: 'Radar-estimated rain in the last 24 hours (MRMS)', legend: 'rain24', frames: [{ time: null, url: tile('q2-p24h-900913') }] },
    { id: 'future', name: 'Future radar', note: 'What the HRRR model expects radar to look like over the next 12 hours', legend: 'dbz', future: true, frames: future(now) },
  ];
}

export function radarFrames(now = Date.now(), count = 11) {
  return {
    frames: loop('nexrad-n0q-900913', now, count),
    products: radarProducts(now),
    attribution: 'NEXRAD radar via <a href="https://mesonet.agron.iastate.edu/">Iowa Environmental Mesonet</a>',
    maxNativeZoom: 12,
    coverage: 'United States',
    nexradExtent: NEXRAD_EXTENT,
    view: RADAR_VIEW,
    // Infrared satellite (clouds day and night) from NASA GIBS, as WMS so Leaflet
    // can ask for any zoom. GOES-East covers the Americas and the Atlantic.
    satellite: {
      wms: 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
      layers: 'GOES-East_ABI_Band13_Clean_Infrared',
      name: 'Infrared satellite (GOES-East)',
      attribution: 'Satellite: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> / NOAA GOES',
    },
  };
}

// Canada and Mexico. NEXRAD stops at the border, so the map looked empty past
// it. RainViewer stitches Environment Canada's radars and Mexico's (CONAGUA/SMN
// and a few state radars) into one free tile set: 10-minute frames for the last
// 2 hours, zoom 7 at most, one colour scheme ("Universal Blue", id 2), for
// personal and educational use with a credit link. Set WORLD_RADAR=off to hide it.
export const RAINVIEWER_JSON = 'https://api.rainviewer.com/public/weather-maps.json';
export const RAINVIEWER_MAX_ZOOM = 7;

export async function worldRadarFrames(fetchImpl) {
  const raw = await fetchJson(RAINVIEWER_JSON, { source: 'RainViewer', fetchImpl, timeoutMs: 6000 });
  const host = typeof raw?.host === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(raw.host) ? raw.host : null;
  if (!host) return [];
  return (raw?.radar?.past || [])
    .filter((f) => Number.isFinite(f?.time) && typeof f.path === 'string' && /^\/[A-Za-z0-9/_-]+$/.test(f.path))
    .map((f) => ({ time: new Date(f.time * 1000).toISOString(), url: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png` }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

// Where the US radars are (in and near the NEXRAD box), as [lat, lon], so the map
// can blend the Canada/Mexico layer in past their range instead of at a straight line.
// IEM lists radars by their 3-letter id (BUF, CBW), not the 4-letter call sign
// (KBUF), so take both; the box keeps out Alaska, Hawaii and Puerto Rico.
const RADAR_ID = /^(?:[A-Z]{3}|K[A-Z]{3})$/;
export function nexradPoints(sites = []) {
  const b = NEXRAD_EXTENT;
  return sites
    .filter((s) => RADAR_ID.test(String(s.id || '')) && s.lat >= b.south - 3 && s.lat <= b.north + 3 && s.lon >= b.west - 3 && s.lon <= b.east + 3)
    .map((s) => [Math.round(s.lat * 100) / 100, Math.round(s.lon * 100) / 100]);
}

// Give each live-radar frame the Canada/Mexico frame closest in time.
export function withWorldRadar(radar, fill, sites = []) {
  if (!fill?.length) return radar;
  const pair = (frames) => frames.map((f) => ({ ...f, fill: pairFill(f.time, fill)?.url || null }));
  return {
    ...radar,
    frames: pair(radar.frames),
    products: radar.products.map((p) => (p.id === 'composite'
      ? { ...p, note: 'US NEXRAD radars stitched together, plus Canada and Mexico (less detail up close), last hour', frames: pair(p.frames) }
      : p)),
    coverage: 'United States, Canada and Mexico',
    fill: {
      maxNativeZoom: RAINVIEWER_MAX_ZOOM,
      attribution: 'Canada &amp; Mexico radar by <a href="https://www.rainviewer.com/">RainViewer</a>',
      sites: nexradPoints(sites),
    },
  };
}
