// Storm tracks and precipitation type, shared by the server and the web app.
//
// Storm cells come from the NEXRAD storm-tracking algorithm (SCIT), which every
// radar runs on each scan: where each storm core is, how strong it is, and which
// way and how fast it is moving. The Iowa Environmental Mesonet publishes the
// latest cells from every US radar as one GeoJSON file, with no key.
//
// Precipitation type (rain, snow, a mix or freezing rain) is the model blend's
// weather code on a grid (HRRR in the US), drawn under the radar so you can see
// where the rain/snow line is.
import { distanceMiles, bearing, compassWord } from './lightning.js';

export { distanceMiles, bearing, compassWord };

const KT_MPH = 1.15078;
const R_MILES = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const TRACK_MINUTES = [15, 30, 45, 60];
export const CELL_MAX_AGE_MIN = 30; // older scans are dropped
export const ETA_MAX_MIN = 90; // "heading your way" looks this far ahead

// Strongest first. `rank` sorts the list; `color` is the map pin.
export const CELL_LEVELS = {
  tornado: { rank: 4, label: 'Possible tornado', short: 'Rotation (TVS)', color: '#d62bd6', kid: 'This storm is spinning hard. Grown-ups will watch for a tornado warning.' },
  rotation: { rank: 3, label: 'Rotating storm', short: 'Rotation', color: '#e0322b', kid: 'This storm is spinning a little, like a slow top.' },
  hail: { rank: 2, label: 'Storm with hail', short: 'Hail', color: '#f08a24', kid: 'This storm may drop hail, little balls of ice.' },
  strong: { rank: 1, label: 'Strong storm', short: 'Strong', color: '#f2c12e', kid: 'A strong storm with heavy rain and maybe thunder.' },
  storm: { rank: 0, label: 'Storm', short: 'Storm', color: '#5aa9e6', kid: 'A rain shower or small storm.' },
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const flag = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  return !!s && s !== 'NONE' && s !== '0' && s !== 'NULL' && s !== 'FALSE';
};

// Where a point ends up after moving `miles` toward compass `heading`.
export function movePoint({ lat, lon }, heading, miles) {
  const d = miles / R_MILES;
  const h = rad(heading);
  const p1 = rad(lat);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(h));
  const l2 = rad(lon) + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: Math.round(deg(p2) * 1e4) / 1e4, lon: Math.round((((deg(l2) + 540) % 360) - 180) * 1e4) / 1e4 };
}

export function cellLevel(c) {
  if (c.tvs) return 'tornado';
  if (c.meso) return 'rotation';
  if ((c.posh ?? 0) >= 50 || (c.hailIn ?? 0) >= 1) return 'hail';
  if ((c.dbz ?? 0) >= 55) return 'strong';
  return 'storm';
}

const parseTime = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(' ', 'T');
  const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
};

// IEM nexrad_attr GeoJSON -> cells. Each radar sees nearby storms, so a storm
// between two radars shows up twice; the stronger, newer copy is kept.
export function parseCells(geo, { now = Date.now(), maxAgeMin = CELL_MAX_AGE_MIN, minDbz = 35 } = {}) {
  const out = [];
  for (const f of geo?.features || []) {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = parseTime(p.valid);
    if (t != null && now - t > maxAgeMin * 60_000) continue;
    const dbz = num(p.max_dbz);
    if (dbz != null && dbz < minDbz) continue;
    const from = num(p.drct);
    const kt = num(p.sknt);
    const c = {
      id: `${p.nexrad || 'X'}-${p.storm_id || out.length}`,
      radar: p.nexrad || null,
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      t,
      dbz,
      top: num(p.top), // echo top, thousands of feet
      vil: num(p.vil),
      poh: num(p.poh),
      posh: num(p.posh),
      hailIn: num(p.max_size) || null,
      tvs: flag(p.tvs),
      meso: flag(p.meso),
      // SCIT reports the direction the storm comes FROM; it moves the other way.
      heading: from != null && kt != null && kt > 0 ? (from + 180) % 360 : null,
      mph: kt != null ? Math.round(kt * KT_MPH) : null,
    };
    c.level = cellLevel(c);
    c.track = c.heading != null ? TRACK_MINUTES.map((m) => ({ min: m, ...movePoint(c, c.heading, (c.mph * m) / 60) })) : [];
    out.push(c);
  }
  // Strongest first, then drop near-duplicates (same storm, another radar).
  out.sort((a, b) => CELL_LEVELS[b.level].rank - CELL_LEVELS[a.level].rank || (b.dbz ?? 0) - (a.dbz ?? 0) || (b.t ?? 0) - (a.t ?? 0));
  const kept = [];
  for (const c of out) if (!kept.some((k) => distanceMiles(k, c) < 4)) kept.push(c);
  return kept;
}

// Will this cell pass over the place, and when? The path is a cone that widens
// with time, as storm motion forecasts do.
export function cellThreat(cell, place, { maxMin = ETA_MAX_MIN } = {}) {
  const miles = distanceMiles(place, cell);
  if (miles <= 4) return { miles: Math.round(miles), eta: 0, closest: Math.round(miles), overhead: true };
  if (cell.heading == null || !cell.mph) return null;
  const toPlace = bearing(cell, place);
  const off = rad(toPlace - cell.heading);
  const along = miles * Math.cos(off);
  const cross = Math.abs(miles * Math.sin(off));
  if (along <= 0) return null; // moving away
  const eta = Math.round((along / cell.mph) * 60);
  const width = 6 + along * 0.15;
  if (cross > width || eta > maxMin) return null;
  return { miles: Math.round(miles), eta, closest: Math.round(cross), overhead: false };
}

// Cells within `miles`, each with its distance, direction and (when it is
// heading this way) an arrival time. Storms coming this way sort first.
export function cellsNear(cells, place, { miles = 100 } = {}) {
  return cells
    .map((c) => {
      const d = distanceMiles(place, c);
      return { ...c, miles: Math.round(d), dir: compassWord(bearing(place, c)), moving: c.heading != null ? compassWord(c.heading) : null, threat: cellThreat(c, place) };
    })
    .filter((c) => c.miles <= miles)
    .sort((a, b) => (!!b.threat - !!a.threat) || (a.threat && b.threat ? a.threat.eta - b.threat.eta : 0) || CELL_LEVELS[b.level].rank - CELL_LEVELS[a.level].rank || a.miles - b.miles);
}

// One line about a cell, for the card, the map popup and push alerts.
export function cellSummary(c, { kid = false } = {}) {
  const lvl = CELL_LEVELS[c.level] || CELL_LEVELS.storm;
  if (kid) return lvl.kid;
  const bits = [];
  if (c.tvs) bits.push('tornado vortex signature');
  else if (c.meso) bits.push('rotation');
  if (c.hailIn) bits.push(`hail up to ${c.hailIn} in`);
  else if ((c.posh ?? 0) >= 50) bits.push(`${c.posh}% chance of severe hail`);
  if (c.dbz != null) bits.push(`${c.dbz} dBZ`);
  if (c.top != null) bits.push(`tops ${c.top}k ft`);
  return bits.join(', ');
}

export const etaText = (min) => (min <= 0 ? 'now' : min < 60 ? `in about ${Math.max(5, Math.round(min / 5) * 5)} min` : `in about ${Math.round((min / 60) * 2) / 2} hr`);

// ---- precipitation type ----

export const PTYPES = {
  rain: { label: 'Rain', short: 'rain', color: '#2fa84f', kid: 'Rain' },
  snow: { label: 'Snow', short: 'snow', color: '#3d7dff', kid: 'Snow' },
  mix: { label: 'Rain and snow mix', short: 'mix', color: '#e25bb0', kid: 'Slushy mix' },
  ice: { label: 'Freezing rain or sleet', short: 'ice', color: '#9b45d9', kid: 'Ice' },
};
export const PTYPE_CODE = { rain: 'r', snow: 's', mix: 'm', ice: 'i' };
export const PTYPE_FROM_CODE = { r: 'rain', s: 'snow', m: 'mix', i: 'ice' };

const ICE_CODES = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

// One grid point's current weather -> 'rain' | 'snow' | 'mix' | 'ice' | null.
export function precipType({ code, rain = 0, showers = 0, snow = 0, precip = 0 } = {}) {
  const liquid = (rain || 0) + (showers || 0);
  if (ICE_CODES.has(code)) return 'ice';
  if (SNOW_CODES.has(code)) return liquid > 0 ? 'mix' : 'snow';
  if (RAIN_CODES.has(code)) return (snow || 0) > 0 ? 'mix' : 'rain';
  if ((precip || 0) <= 0 && liquid <= 0 && (snow || 0) <= 0) return null;
  if ((snow || 0) > 0 && liquid > 0) return 'mix';
  return (snow || 0) > 0 ? 'snow' : 'rain';
}

// A grid over a map view: rows north to south, columns west to east, sized so a
// cell is about square and the whole grid stays within `maxPoints`.
export function ptypeGrid(box, { maxPoints = 192 } = {}) {
  const h = box.north - box.south;
  const w = box.east - box.west;
  const aspect = (w * Math.cos(rad((box.north + box.south) / 2))) / h;
  let rows = Math.max(3, Math.round(Math.sqrt(maxPoints / Math.max(0.2, aspect))));
  let cols = Math.max(3, Math.round(rows * aspect));
  while (rows * cols > maxPoints) { if (cols > rows) cols--; else rows--; }
  const dLat = h / rows;
  const dLon = w / cols;
  const lats = Array.from({ length: rows }, (_, r) => Math.round((box.north - dLat * (r + 0.5)) * 1000) / 1000);
  const lons = Array.from({ length: cols }, (_, c) => Math.round((box.west + dLon * (c + 0.5)) * 1000) / 1000);
  return { ...box, rows, cols, lats, lons, dLat, dLon };
}

// Count of each type in an encoded grid string, for the legend ("snow north of I-80").
export function ptypeCounts(cells = '') {
  const out = { rain: 0, snow: 0, mix: 0, ice: 0 };
  for (const ch of cells) if (PTYPE_FROM_CODE[ch]) out[PTYPE_FROM_CODE[ch]]++;
  return out;
}

// Footer line for the rain/snow layer, e.g. "Snow and mix in view".
export function ptypeInfo(counts) {
  const present = Object.keys(PTYPES).filter((k) => counts?.[k] > 0);
  if (!present.length) return 'No rain or snow in view';
  const words = present.map((k) => PTYPES[k].short);
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0];
  return `${list[0].toUpperCase()}${list.slice(1)} in view`;
}
