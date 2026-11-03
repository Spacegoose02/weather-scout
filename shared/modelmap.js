// Forecast model maps (Models tab), shared by the server (which fetches a grid
// of points from Open-Meteo) and the web app (which paints the grid onto a
// keyless base map). Plain data and pure functions, no DOM.

// Models that can be mapped. `windy` is the matching Windy model, when there is one.
export const MAP_MODELS = [
  { id: 'ecmwf_ifs025', name: 'ECMWF', windy: 'ecmwf', days: 5, note: 'Europe. Often the best global model past 3 days.' },
  { id: 'gfs_seamless', name: 'GFS', windy: 'gfs', days: 5, note: 'USA (NOAA). The main US global model.' },
  { id: 'icon_seamless', name: 'ICON', windy: 'icon', days: 5, note: 'Germany (DWD). Strong on fronts and temperatures.' },
  { id: 'gem_seamless', name: 'GEM', days: 5, note: 'Canada (ECCC). Good on winter storms.' },
  { id: 'gfs_hrrr', name: 'HRRR', days: 2, usOnly: true, note: 'USA (NOAA), 3 km. Storm detail for the next 2 days, US only.' },
  { id: 'ecmwf_aifs025_single', name: 'AIFS', days: 5, ai: true, note: "ECMWF's AI model." },
];

// 176 points per map. Open-Meteo counts each point as one call (600 a minute
// for free), so two maps side by side stay well under the limit.
export const GRID_ROWS = 11;
export const GRID_COLS = 16;

// The lower 48 states, edge to edge (and HRRR's whole domain, near enough).
export const CONUS = { south: 23.5, north: 50, west: -126, east: -65.5 };
export const inConus = (lat, lon) => lat >= CONUS.south && lat <= CONUS.north && lon >= CONUS.west && lon <= CONUS.east;

// How much of the map to cover. `half` is half the height in degrees of latitude.
// "country" is the whole lower 48 for US places, and a wide area anywhere else.
// Its 275 points keep two maps side by side under Open-Meteo's 600 a minute.
export const MAP_AREAS = [
  { id: 'nearby', name: 'Nearby', half: 2.2 },
  { id: 'region', name: 'Region', half: 6 },
  { id: 'country', name: 'Whole US', wideName: 'Wide area', half: 13, rows: 11, cols: 25, aspect: 2 },
];

/** The area to start on: the whole country for US places, the region elsewhere. */
export const defaultArea = (lat, lon) => (inConus(lat, lon) ? 'country' : 'region');
export const STEP_HOURS = 3;

// Open-Meteo hourly variable for each field.
export const MAP_VARS = {
  temp: 'temperature_2m',
  precip: 'precipitation',
  wind: 'wind_speed_10m',
  windDir: 'wind_direction_10m',
  clouds: 'cloud_cover',
  pressure: 'pressure_msl',
};

// Map layers. `windy` is the matching Windy overlay, `kid` the one-line explainer.
export const MAP_FIELDS = [
  { id: 'temp', name: 'Temperature', emoji: '🌡️', windy: 'temp', kid: 'Warm air is orange and red, cold air is blue and purple.' },
  { id: 'precip', name: 'Rain & snow', emoji: '🌧️', windy: 'rain', kid: 'Where the model expects rain or snow in each 3 hours, like a radar of the future. Brighter colors mean more.' },
  { id: 'wind', name: 'Wind', emoji: '💨', windy: 'wind', kid: 'Arrows point where the wind is blowing to. Hotter colors mean stronger wind.' },
  { id: 'clouds', name: 'Clouds', emoji: '☁️', windy: 'clouds', kid: 'White means cloudy sky. Where you can see the map, the sky is clear.' },
  { id: 'pressure', name: 'Pressure', emoji: '🧭', windy: 'pressure', kid: 'The lines connect places with the same air pressure. L is low pressure, which often brings storms; H is high pressure, which brings calm.' },
];

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
    [0.05, [120, 220, 255, 0]], [0.2, [120, 220, 255, 170]], [1, [40, 130, 240, 210]], [2.5, [30, 190, 90, 225]],
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
export function legendFor(field, units) {
  const metric = units === 'metric';
  const L = {
    temp: metric ? { unit: '°C', ticks: [-20, -10, 0, 10, 20, 30, 40] } : { unit: '°F', ticks: [0, 20, 40, 60, 80, 100] },
    precip: metric ? { unit: 'mm in 3 h', ticks: [0.2, 1, 5, 10, 20, 40] } : { unit: 'in. in 3 h', ticks: [0.01, 0.05, 0.2, 0.5, 1] },
    wind: metric ? { unit: 'km/h', ticks: [0, 20, 40, 60, 80, 120] } : { unit: 'mph', ticks: [0, 10, 20, 30, 50, 75] },
    clouds: { unit: '% of sky', ticks: [0, 25, 50, 75, 100] },
    pressure: { unit: 'hPa (millibars)', ticks: [985, 1000, 1013, 1025, 1035] },
  }[field];
  const s = SCALES[field];
  // Stops are spaced evenly (rain's scale is far from linear) and ticks are
  // placed between the stops they fall in, so labels line up with the colors.
  const n = s.length - 1;
  const pos = (raw) => {
    const v = scaleValue(field, raw, units);
    if (v <= s[0][0]) return 0;
    for (let i = 1; i <= n; i++) if (v <= s[i][0]) return (i - 1 + (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0])) / n;
    return 1;
  };
  const gradient = `linear-gradient(to right, ${s.map(([, c], i) => `rgba(${c[0]},${c[1]},${c[2]},${(Math.max(c[3], 70) / 255).toFixed(2)}) ${((i / n) * 100).toFixed(1)}%`).join(', ')})`;
  return { unit: L.unit, gradient, ticks: L.ticks.map((v) => ({ v, at: pos(v) })) };
}

// Grid of points around a center: rows from north to south, columns west to east.
// The center is snapped so nearby lookups share one cached grid.
export function gridFor(lat, lon, areaId = 'region') {
  const area = MAP_AREAS.find((a) => a.id === areaId) || MAP_AREAS[1];
  const rows = area.rows || GRID_ROWS;
  const cols = area.cols || GRID_COLS;
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
 * paints soft shapes instead of diamonds. Falls back to bilinear next to
 * missing points and at the edges.
 */
export function sampleSmooth(values, rows, cols, r, c) {
  if (r < 0 || c < 0 || r > rows - 1 || c > cols - 1) return null;
  const r0 = Math.floor(r);
  const c0 = Math.floor(c);
  if (r0 < 1 || c0 < 1 || r0 > rows - 3 || c0 > cols - 3) return sampleGrid(values, rows, cols, r, c);
  const wr = cubic(r - r0);
  const wc = cubic(c - c0);
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const row = (r0 - 1 + i) * cols + c0 - 1;
    let line = 0;
    for (let j = 0; j < 4; j++) {
      const v = values[row + j];
      if (v == null) return sampleGrid(values, rows, cols, r, c);
      line += v * wc[j];
    }
    sum += line * wr[i];
  }
  return sum;
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
