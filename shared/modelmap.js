// Forecast model maps (Models tab), shared by the server (which fetches a grid
// of points from Open-Meteo) and the web app (which paints the grid onto a
// keyless base map). Plain data and pure functions, no DOM.
import { inView } from './radarcoverage.js';

// Models that can be mapped. `windy` is the matching Windy model, when there is one.
export const MAP_MODELS = [
  { id: 'ecmwf_ifs025', name: 'ECMWF', windy: 'ecmwf', days: 5, longDays: 15, note: 'Europe. Often the best global model past 3 days.' },
  { id: 'gfs_seamless', name: 'GFS', windy: 'gfs', days: 5, longDays: 16, note: 'USA (NOAA). The main US global model.' },
  { id: 'icon_seamless', name: 'ICON', windy: 'icon', days: 5, longDays: 7, note: 'Germany (DWD). Strong on fronts and temperatures.' },
  { id: 'gem_seamless', name: 'GEM', days: 5, longDays: 10, note: 'Canada (ECCC). Good on winter storms.' },
  { id: 'gfs_hrrr', name: 'HRRR', days: 2, usOnly: true, domain: 'hrrr', note: 'USA (NOAA), 3 km. Storm detail for the next 2 days, US only.' },
  { id: 'ecmwf_aifs025_single', name: 'AIFS', days: 5, longDays: 15, ai: true, note: "ECMWF's AI model." },
];

// How far ahead to map. "long" is the two-week look the pros use for patterns:
// every 6 hours, as far as each model goes (ECMWF and AIFS 15 days, GFS 16,
// GEM 10, ICON 7). HRRR stops at 2 days, so it isn't offered there.
export const MAP_RANGES = [
  { id: 'short', name: 'Next 5 days', step: 3 },
  { id: 'long', name: '2 weeks', step: 6 },
];
export const rangeOf = (id) => MAP_RANGES.find((r) => r.id === id) || MAP_RANGES[0];
export const modelsFor = (range) => (range === 'long' ? MAP_MODELS.filter((m) => m.longDays) : MAP_MODELS);
/** Days a model is mapped for in a range. */
export const daysFor = (model, range) => (range === 'long' ? model.longDays || 0 : model.days);

// 176 points per map. Open-Meteo counts each point as one call (600 a minute
// for free), so two maps side by side stay well under the limit.
export const GRID_ROWS = 11;
export const GRID_COLS = 16;

// The lower 48 states, edge to edge (and HRRR's whole domain, near enough).
export const CONUS = { south: 23.5, north: 50, west: -126, east: -65.5 };
export const inConus = (lat, lon) => lat >= CONUS.south && lat <= CONUS.north && lon >= CONUS.west && lon <= CONUS.east;

// Canada, the lower 48 and Mexico down to Central America, for the "North America" area.
// The same 270-odd points as the whole-US map, just spread wider (about 4° apart).
export const NORTH_AMERICA = { south: 15, north: 60, west: -135, east: -55 };
// Places that get the North America map (and a map kept to North America): Alaska
// and Hawaii to Panama and the Caribbean, the same box as the radar map.
export const inNorthAmerica = (lat, lon) => inView(lat, lon);

// How much of the map to cover. `half` is half the height in degrees of latitude.
// "country" is the whole lower 48 for US places, and a wide area anywhere else.
// Its 275 points keep two maps side by side under Open-Meteo's 600 a minute.
export const MAP_AREAS = [
  { id: 'nearby', name: 'Nearby', half: 2.2 },
  { id: 'region', name: 'Region', half: 6 },
  { id: 'country', name: 'Whole US', wideName: 'Wide area', half: 13, rows: 11, cols: 25, aspect: 2 },
  { id: 'continent', name: 'North America', wideName: 'Continent', half: 22, rows: 13, cols: 21, aspect: 1.8 },
];

// HRRR's grid: 1799 x 1059 points 3 km apart on a Lambert conformal map
// (true at 38.5°N, centered on 97.5°W), starting at 21.138°N 122.72°W.
// Open-Meteo refuses a whole request if any point is off this grid, and the
// lower 48 box's corners (Pacific Northwest, Baja, Nova Scotia) are.
const LCC = (() => {
  const R = 6371229;
  const rad = Math.PI / 180;
  const phi1 = 38.5 * rad;
  const n = Math.sin(phi1);
  const F = (Math.cos(phi1) * Math.tan(Math.PI / 4 + phi1 / 2) ** n) / n;
  const rho = (lat) => (R * F) / Math.tan(Math.PI / 4 + (lat * rad) / 2) ** n;
  const rho0 = rho(38.5);
  const xy = (lat, lon) => {
    const t = n * (lon + 97.5) * rad;
    const r = rho(lat);
    return [r * Math.sin(t), rho0 - r * Math.cos(t)];
  };
  return { xy, origin: xy(21.138, -122.72) };
})();

/** Is a point on HRRR's grid? `margin` keeps a few grid cells away from the edge. */
export function inHrrr(lat, lon, margin = 3) {
  const [x, y] = LCC.xy(lat, lon);
  const i = (x - LCC.origin[0]) / 3000;
  const j = (y - LCC.origin[1]) / 3000;
  return i >= margin && i <= 1798 - margin && j >= margin && j <= 1058 - margin;
}

/** Which grid points (by index, row by row) a model can answer for. */
export function pointsFor(model, grid) {
  const keep = [];
  grid.lats.forEach((lat, r) => grid.lons.forEach((lon, c) => {
    if (model.domain !== 'hrrr' || inHrrr(lat, lon)) keep.push(r * grid.lons.length + c);
  }));
  return keep;
}

/** The area to start on: the whole country for US places, the region elsewhere. */
export const defaultArea = (lat, lon) => (inConus(lat, lon) ? 'country' : 'region');
export const STEP_HOURS = 3;

// Open-Meteo hourly variable for each raw field. `snow` (snowfall) and the two
// heights are only read to work out the precipitation type and the
// 1000-500 mb thickness; the map gets `snow` (share of it falling as snow) and
// `thick` (decameters) instead.
export const MAP_VARS = {
  temp: 'temperature_2m',
  precip: 'precipitation',
  wind: 'wind_speed_10m',
  windDir: 'wind_direction_10m',
  clouds: 'cloud_cover',
  pressure: 'pressure_msl',
  snow: 'snowfall',
  z500: 'geopotential_height_500hPa',
  z1000: 'geopotential_height_1000hPa',
};
// Two weeks of six variables, so a whole-US map is still about one Open-Meteo
// call per point (more than 10 variables or 14 days costs extra).
export const LONG_VARS = ['temp', 'precip', 'pressure', 'snow', 'z500', 'z1000'];
export const varsFor = (range) => (range === 'long' ? LONG_VARS : Object.keys(MAP_VARS));
/** Fields the server sends for a range (raw heights become `thick`). */
export const fieldsFor = (range) => [...varsFor(range).filter((f) => f !== 'z500' && f !== 'z1000'), 'thick'];

/**
 * How many Open-Meteo calls one point costs: more than 10 variables or more
 * than 14 days counts extra (their fair-use weighting).
 */
export const callWeight = (vars, days) => Math.max(1, vars / 10) * Math.max(1, days / 14);

/**
 * Share of a step's precipitation that fell as snow (0 to 1), or null when dry.
 * Open-Meteo's snowfall is 7 times the water (0.7 cm per mm, 7 in. per inch).
 * Models without snowfall fall back on the thickness: below about 5,360 m it's
 * snow, above 5,440 m it's rain; and it's rain anyway when it's warm at the ground.
 */
export function snowShare({ precip, snowfall, thick, tempC }, units) {
  if (precip == null || precip <= (units === 'metric' ? 0.05 : 0.002)) return null;
  if (tempC != null && tempC >= 4) return 0;
  if (snowfall != null) {
    const water = snowfall / (units === 'metric' ? 0.7 : 7);
    return Math.round(Math.max(0, Math.min(1, water / precip)) * 100) / 100;
  }
  if (thick == null) return null;
  return Math.round(Math.max(0, Math.min(1, (544 - thick) / 8)) * 100) / 100;
}

/**
 * Rain, snow, sleet or freezing rain at a spot, from the snow share and the
 * ground temperature in °F. Freezing rain is rain falling on frozen ground.
 */
export function precipType(share, tempF) {
  if (share == null) return 'rain';
  if (share >= 0.7) return 'snow';
  if (share >= 0.3) return 'sleet';
  if (tempF != null && tempF <= 32) return 'frzr';
  return 'rain';
}

export const PRECIP_TYPES = [
  { id: 'rain', name: 'Rain', color: [70, 200, 90] },
  { id: 'snow', name: 'Snow', color: [110, 150, 255] },
  { id: 'sleet', name: 'Sleet', color: [250, 160, 60] },
  { id: 'frzr', name: 'Freezing rain', color: [240, 90, 190] },
];

/**
 * How much to trust a map this far ahead. Forecasts lose detail day by day:
 * after about a week a model's map shows the pattern (where storms and cold
 * air may be), not the exact weather at your house.
 */
export function leadConfidence(hoursAhead) {
  if (hoursAhead <= 72) return { id: 'good', label: 'Pretty sure', kid: 'The next 3 days are usually close to right.' };
  if (hoursAhead <= 168) return { id: 'fair', label: 'Good idea', kid: 'Days 4 to 7: the big picture is often right, the details can move.' };
  return { id: 'hint', label: 'Just a hint', kid: 'Past a week, maps are clues, not promises. Storms can shift hundreds of miles or vanish.' };
}

// Map layers. `windy` is the matching Windy overlay, `kid` the one-line explainer.
export const MAP_FIELDS = [
  { id: 'temp', name: 'Temperature', emoji: '🌡️', windy: 'temp', kid: 'Warm air is orange and red, cold air is blue and purple.' },
  { id: 'precip', name: 'Rain & snow', emoji: '🌧️', windy: 'rain', kid: 'Where the model expects rain or snow in each 3 hours, like a radar of the future. Brighter colors mean more.' },
  { id: 'wind', name: 'Wind', emoji: '💨', windy: 'wind', kid: 'Arrows point where the wind is blowing to. Hotter colors mean stronger wind.' },
  { id: 'clouds', name: 'Clouds', emoji: '☁️', windy: 'clouds', kid: 'White means cloudy sky. Where you can see the map, the sky is clear.' },
  { id: 'pressure', name: 'Pressure', emoji: '🧭', windy: 'pressure', kid: 'The lines connect places with the same air pressure. L is low pressure, which often brings storms; H is high pressure, which brings calm.' },
  {
    id: 'pattern', name: 'Storm pattern', emoji: '🗺️', windy: 'rain', long: true,
    kid: 'The map the pros use. Green is rain, blue is snow, orange is sleet and pink is freezing rain. White lines are air pressure (L marks a storm). The dashed lines show how cold the air is up high: the blue 540 line is the snow line, and north of it it is usually cold enough to snow.',
  },
];
// Layers offered on the 2-week maps (no wind or cloud there: too fine a detail that far out).
export const LONG_FIELDS = ['pattern', 'precip', 'temp', 'pressure'];
export const fieldsOffered = (range) => (range === 'long' ? MAP_FIELDS.filter((f) => LONG_FIELDS.includes(f.id)) : MAP_FIELDS);

const toF = (c) => (c * 9) / 5 + 32;
const toMm = (inch) => inch * 25.4;
const toMph = (kmh) => kmh / 1.609344;

// Color scales in one fixed unit each (°F, mm per 3 h, mph, %, hPa).
// Each stop is [value, [r, g, b, a]].
export const SCALES = {
  temp: [
    [-20, [110, 40, 160, 210]], [0, [80, 60, 200, 210]], [20, [40, 110, 230, 210]], [32, [90, 180, 240, 210]],
    [45, [40, 190, 170, 210]], [55, [80, 200, 90, 210]], [65, [190, 220, 60, 210]], [75, [250, 210, 50, 210]],
    [85, [250, 140, 30, 210]], [95, [230, 50, 40, 210]], [105, [160, 20, 60, 210]],
  ],
  precip: [
    [0.01, [120, 220, 255, 0]], [0.08, [120, 220, 255, 70]], [0.3, [110, 210, 255, 160]], [1, [40, 130, 240, 210]], [2.5, [30, 190, 90, 225]],
    [5, [250, 225, 40, 235]], [10, [250, 140, 20, 240]], [20, [230, 30, 30, 245]], [40, [210, 40, 210, 250]],
  ],
  wind: [
    [0, [40, 70, 160, 170]], [8, [40, 150, 190, 190]], [15, [50, 190, 120, 200]], [25, [220, 220, 60, 210]],
    [35, [250, 150, 30, 220]], [50, [230, 40, 40, 230]], [75, [200, 40, 200, 240]],
  ],
  clouds: [[0, [255, 255, 255, 0]], [20, [255, 255, 255, 20]], [100, [245, 248, 255, 215]]],
  pressure: [
    [980, [130, 50, 180, 150]], [995, [60, 100, 220, 140]], [1008, [80, 170, 200, 110]], [1013, [150, 150, 150, 70]],
    [1020, [230, 170, 70, 120]], [1035, [220, 80, 40, 150]],
  ],
};

/** Convert a value in the app's units to the unit its color scale uses. */
export function scaleValue(field, v, units) {
  if (v == null) return null;
  if (units !== 'metric') {
    if (field === 'precip') return toMm(v);
    return v;
  }
  if (field === 'temp') return toF(v);
  if (field === 'wind') return toMph(v);
  return v;
}

/** RGBA for a value on a scale (already converted with scaleValue). Null is transparent. */
export function colorAt(field, v) {
  if (v == null || Number.isNaN(v)) return [0, 0, 0, 0];
  const s = SCALES[field];
  if (v <= s[0][0]) return field === 'precip' ? [0, 0, 0, 0] : s[0][1];
  for (let i = 1; i < s.length; i++) {
    const [v1, c1] = s[i];
    if (v <= v1) {
      const [v0, c0] = s[i - 1];
      const t = (v - v0) / (v1 - v0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
    }
  }
  return s[s.length - 1][1];
}

/** Legend for a field in the app's units: CSS gradient and a few labeled values. */
export function legendFor(field, units, step = 3) {
  if (field === 'pattern') field = 'precip';
  const metric = units === 'metric';
  // Rain over 6 hours is colored as its 3-hour equivalent, and labeled per 6 hours.
  const per = step / 3;
  const L = {
    temp: metric ? { unit: '°C', ticks: [-20, -10, 0, 10, 20, 30, 40] } : { unit: '°F', ticks: [0, 20, 40, 60, 80, 100] },
    precip: metric ? { unit: `mm in ${step} h`, ticks: [0.2, 1, 5, 10, 20, 40].map((t) => t * per) } : { unit: `in. in ${step} h`, ticks: [0.01, 0.05, 0.2, 0.5, 1].map((t) => Math.round(t * per * 100) / 100) },
    wind: metric ? { unit: 'km/h', ticks: [0, 20, 40, 60, 80, 120] } : { unit: 'mph', ticks: [0, 10, 20, 30, 50, 75] },
    clouds: { unit: '% of sky', ticks: [0, 25, 50, 75, 100] },
    pressure: { unit: 'hPa (millibars)', ticks: [985, 1000, 1013, 1025, 1035] },
  }[field];
  const s = SCALES[field];
  // Stops are spaced evenly (rain's scale is far from linear) and ticks are
  // placed between the stops they fall in, so labels line up with the colors.
  const n = s.length - 1;
  const pos = (raw) => {
    const v = scaleValue(field, field === 'precip' ? raw / per : raw, units);
    if (v <= s[0][0]) return 0;
    for (let i = 1; i <= n; i++) if (v <= s[i][0]) return (i - 1 + (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0])) / n;
    return 1;
  };
  const gradient = `linear-gradient(to right, ${s.map(([, c], i) => `rgba(${c[0]},${c[1]},${c[2]},${(Math.max(c[3], 70) / 255).toFixed(2)}) ${((i / n) * 100).toFixed(1)}%`).join(', ')})`;
  return { unit: L.unit, gradient, ticks: L.ticks.map((v) => ({ v, at: pos(v) })) };
}

// Grid of points around a center: rows from north to south, columns west to east.
// The center is snapped so nearby lookups share one cached grid.
export function gridFor(lat, lon, areaId = 'region', range = 'short') {
  const area = MAP_AREAS.find((a) => a.id === areaId) || MAP_AREAS[1];
  // Two-week maps use about two thirds of the points each way (half as many in all): at that range
  // only the big pattern matters, and it keeps the Models tab (a 5-day map,
  // a 2-week map and Rocky's outlook) under Open-Meteo's 600 calls a minute.
  const thin = (n) => (range === 'long' ? Math.max(7, Math.round(n * 0.65) | 1) : n);
  const rows = thin(area.rows || GRID_ROWS);
  const cols = thin(area.cols || GRID_COLS);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const spread = (from, to, n) => Array.from({ length: n }, (_, i) => r3(from + ((to - from) * i) / (n - 1)));
  if (area.id === 'country' && inConus(lat, lon)) {
    // One fixed grid for every US place, so they all share one cached map.
    const center = { lat: (CONUS.north + CONUS.south) / 2, lon: (CONUS.west + CONUS.east) / 2 };
    return {
      area: area.id, center, rows, cols,
      lats: spread(CONUS.north, CONUS.south, rows), lons: spread(CONUS.west, CONUS.east, cols),
      latHalf: (CONUS.north - CONUS.south) / 2, lonHalf: (CONUS.east - CONUS.west) / 2,
    };
  }
  if (area.id === 'continent' && inNorthAmerica(lat, lon)) {
    const box = NORTH_AMERICA;
    return {
      area: area.id, center: { lat: (box.north + box.south) / 2, lon: (box.west + box.east) / 2 }, rows, cols,
      lats: spread(box.north, box.south, rows), lons: spread(box.west, box.east, cols),
      latHalf: (box.north - box.south) / 2, lonHalf: (box.east - box.west) / 2,
    };
  }
  const snap = area.half > 3 ? 0.5 : 0.25;
  const cLat = Math.max(-80 + area.half, Math.min(80 - area.half, Math.round(lat / snap) * snap));
  const cLon = Math.round(lon / snap) * snap;
  const latHalf = area.half;
  // Wider than tall, and stretched for the shrinking of longitude toward the poles.
  const lonHalf = Math.min(170, (area.half * (area.aspect || 1.6)) / Math.max(0.3, Math.cos((cLat * Math.PI) / 180)));
  const lats = spread(cLat + latHalf, cLat - latHalf, rows);
  const lons = Array.from({ length: cols }, (_, j) => r3(((cLon - lonHalf + (2 * lonHalf * j) / (cols - 1) + 540) % 360) - 180));
  return { area: area.id, center: { lat: cLat, lon: cLon }, rows, cols, lats, lons, latHalf, lonHalf };
}

/**
 * Value at a fractional grid position (row r, column c) by bilinear interpolation.
 * `values` is one time step, flattened row by row. Missing corners are skipped.
 */
export function sampleGrid(values, rows, cols, r, c) {
  if (r < 0 || c < 0 || r > rows - 1 || c > cols - 1) return null;
  const r0 = Math.min(rows - 2, Math.floor(r));
  const c0 = Math.min(cols - 2, Math.floor(c));
  const fr = r - r0;
  const fc = c - c0;
  let sum = 0;
  let wsum = 0;
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const v = values[(r0 + dr) * cols + c0 + dc];
    if (v == null) continue;
    const w = (dr ? fr : 1 - fr) * (dc ? fc : 1 - fc);
    sum += v * w;
    wsum += w;
  }
  return wsum > 0.25 ? sum / wsum : null;
}

// Catmull-Rom weights for a fractional offset t (0..1) across 4 neighbors.
const cubic = (t) => [
  ((-t + 2) * t - 1) * t / 2,
  ((3 * t - 5) * t * t + 2) / 2,
  ((-3 * t + 4) * t + 1) * t / 2,
  (t - 1) * t * t / 2,
];

/**
 * Smooth (bicubic) value at a fractional grid position, so a coarse grid
 * paints soft shapes instead of diamonds. The edges reuse the edge points, so
 * there's no kink a cell in from the border, and the result stays between the
 * four nearest points: plain bicubic overshoots next to a shower, which painted
 * dark rings and holes in the rain. Falls back to bilinear next to missing points.
 */
export function sampleSmooth(values, rows, cols, r, c) {
  if (r < 0 || c < 0 || r > rows - 1 || c > cols - 1) return null;
  if (rows < 2 || cols < 2) return sampleGrid(values, rows, cols, r, c);
  const r0 = Math.min(rows - 2, Math.floor(r));
  const c0 = Math.min(cols - 2, Math.floor(c));
  const wr = cubic(r - r0);
  const wc = cubic(c - c0);
  const at = (i, j) => values[Math.max(0, Math.min(rows - 1, i)) * cols + Math.max(0, Math.min(cols - 1, j))];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    let line = 0;
    for (let j = 0; j < 4; j++) {
      const v = at(r0 - 1 + i, c0 - 1 + j);
      if (v == null) return sampleGrid(values, rows, cols, r, c);
      line += v * wc[j];
    }
    sum += line * wr[i];
  }
  const near = [at(r0, c0), at(r0, c0 + 1), at(r0 + 1, c0), at(r0 + 1, c0 + 1)];
  return Math.max(Math.min(...near), Math.min(Math.max(...near), sum));
}

/** Grid position of a lat/lon, given the grid's corner points. */
export function gridPos(grid, lat, lon) {
  const { lats, lons } = grid;
  const north = lats[0];
  const south = lats[lats.length - 1];
  const west = lons[0];
  let east = lons[lons.length - 1];
  let x = lon;
  if (east < west) { east += 360; if (x < west) x += 360; }
  return {
    r: ((north - lat) / (north - south)) * (lats.length - 1),
    c: ((x - west) / (east - west)) * (lons.length - 1),
  };
}

/** Highs and lows of a pressure field: grid points lower (or higher) than all neighbors within 2 cells. */
export function pressureCenters(values, rows, cols) {
  const out = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const v = values[r * cols + c];
      if (v == null) continue;
      let isLow = true;
      let isHigh = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue;
          const n = values[(r + dr) * cols + c + dc];
          if (r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= cols || n == null) continue;
          if (n <= v) isLow = false;
          if (n >= v) isHigh = false;
        }
      }
      if (isLow && v < 1012) out.push({ r, c, kind: 'L', v });
      if (isHigh && v > 1014) out.push({ r, c, kind: 'H', v });
    }
  }
  return out;
}

// Storm pattern colors: light to dark by how heavy it is (mm per 3 hours), one hue per type.
const PATTERN = {
  rain: [[0.08, [160, 230, 160]], [1, [80, 200, 95]], [5, [25, 150, 65]], [20, [10, 100, 45]]],
  snow: [[0.08, [190, 210, 255]], [1, [115, 155, 255]], [5, [90, 85, 225]], [20, [125, 45, 175]]],
  sleet: [[0.08, [255, 215, 160]], [1, [250, 165, 65]], [5, [230, 115, 30]], [20, [185, 75, 20]]],
  frzr: [[0.08, [255, 185, 232]], [1, [240, 95, 195]], [5, [210, 40, 145]], [20, [150, 20, 95]]],
};

/** RGBA for precipitation of a type, `v` already in mm per 3 hours. Fades in like the rain map. */
export function patternColor(type, v) {
  const alpha = colorAt('precip', v)[3];
  if (!alpha) return [0, 0, 0, 0];
  const s = PATTERN[type] || PATTERN.rain;
  let rgb = s[s.length - 1][1];
  if (v <= s[0][0]) rgb = s[0][1];
  else {
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i][0]) {
        const t = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
        rgb = s[i - 1][1].map((c, k) => Math.round(c + (s[i][1][k] - c) * t));
        break;
      }
    }
  }
  return [...rgb, Math.max(alpha, 150)];
}

/** Distance in miles between two places (for "a storm 200 miles south of you"). */
export function milesApart(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass word for where `b` is from `a` ("south", "northeast"...). */
export function directionWord(a, b) {
  const y = b.lat - a.lat;
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const deg = (Math.atan2(x, y) * 180) / Math.PI;
  const words = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return words[Math.round(((deg + 360) % 360) / 45) % 8];
}
