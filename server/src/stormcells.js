// Storm tracks (NEXRAD storm cells via IEM) and the rain/snow/mix layer
// (Open-Meteo's current weather on a grid). Both are free and need no key.
import { fetchJson } from './cache.js';
import { sharedBudget } from './providers/modelmaps.js';
import { parseCells, cellsNear, precipType, ptypeGrid, PTYPE_CODE, ptypeCounts } from '../../shared/stormcells.js';
import { inBox } from '../../shared/lightning.js';

const MIN = 60_000;
export const CELLS_URL = 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const PTYPE_VARS = 'weather_code,precipitation,rain,showers,snowfall';

// Snap a view outward to half degrees so nearby views share one cached grid.
const half = (v, up) => (up ? Math.ceil(v * 2) / 2 : Math.floor(v * 2) / 2);
export function snapBox(b) {
  return {
    south: Math.max(-85, half(b.south, false)),
    north: Math.min(85, half(b.north, true)),
    west: Math.max(-180, half(b.west, false)),
    east: Math.min(180, half(b.east, true)),
  };
}

export function ptypeUrl(grid) {
  const lat = [];
  const lon = [];
  for (const la of grid.lats) for (const lo of grid.lons) { lat.push(la); lon.push(lo); }
  const p = new URLSearchParams({ latitude: lat.join(','), longitude: lon.join(','), current: PTYPE_VARS, timezone: 'GMT', cell_selection: 'nearest' });
  return `${FORECAST_URL}?${p}`;
}

// Open-Meteo's list of points -> one character per cell (r, s, m, i or .).
export function encodePtype(raw, grid) {
  const pts = Array.isArray(raw) ? raw : [raw];
  if (pts.length !== grid.rows * grid.cols) throw new Error(`Expected ${grid.rows * grid.cols} points, got ${pts.length}`);
  let time = null;
  const cells = pts.map((p) => {
    const c = p.current || {};
    time ||= c.time || null;
    const t = precipType({ code: c.weather_code, rain: c.rain, showers: c.showers, snow: c.snowfall, precip: c.precipitation });
    return t ? PTYPE_CODE[t] : '.';
  }).join('');
  return { cells, time: time ? `${time}Z`.replace(/ZZ$/, 'Z') : null };
}

export class StormCellService {
  constructor(cache, fetchImpl, { log = console, budget = sharedBudget } = {}) {
    Object.assign(this, { cache, fetchImpl, log, budget });
  }

  // Every US radar's latest cells, deduplicated (2 min cache: a radar scans every 4 to 6).
  async cells(now = Date.now()) {
    return this.cache.wrap('cells:all', 2 * MIN, async () => parseCells(await fetchJson(CELLS_URL, { source: 'iem-cells', fetchImpl: this.fetchImpl, timeoutMs: 15000 }), { now }));
  }

  async cellsInBox(box) {
    const all = await this.cells();
    return all.filter((c) => inBox(c, box));
  }

  async cellsNearPlace(place, miles = 100) {
    return cellsNear(await this.cells(), place, { miles });
  }

  // The first cell heading for the place within the next 90 minutes, or null
  // (used by personal push alerts). Errors mean "no news", not an alert.
  async approaching(place) {
    try {
      return (await this.cellsNearPlace(place, 120)).find((c) => c.threat) || null;
    } catch {
      return null;
    }
  }

  async ptype(box) {
    const s = snapBox(box);
    const key = `ptype:${s.south},${s.west},${s.north},${s.east}`;
    return this.cache.wrap(key, 10 * MIN, async () => {
      const grid = ptypeGrid(s);
      await this.budget.take(grid.rows * grid.cols);
      const raw = await fetchJson(ptypeUrl(grid), { source: 'open-meteo-ptype', fetchImpl: this.fetchImpl, timeoutMs: 20000 });
      const { cells, time } = encodePtype(raw, grid);
      return { south: s.south, north: s.north, west: s.west, east: s.east, rows: grid.rows, cols: grid.cols, cells, time, counts: ptypeCounts(cells) };
    });
  }
}

export function registerStormCells(app, { cells, latLonSchema, loc, boxSchema }) {
  const box = (q) => ({ south: q.south, north: q.north, west: Math.max(-180, q.west), east: Math.min(180, q.east) });
  const near = { ...latLonSchema.querystring.properties, miles: { type: 'number', minimum: 5, maximum: 300 } };
  const source = 'NEXRAD storm tracking via Iowa Environmental Mesonet';

  app.get('/api/cells', { schema: boxSchema }, async (req) => {
    const list = await cells.cellsInBox(box(req.query));
    return { cells: list.slice(0, 800), total: list.length, source };
  });
  app.get('/api/cells/near', { schema: { querystring: { ...latLonSchema.querystring, properties: near } } }, async (req) => {
    const miles = req.query.miles || 100;
    const list = await cells.cellsNearPlace(loc(req.query), miles);
    return { cells: list.slice(0, 20), total: list.length, miles, source };
  });
  app.get('/api/radar/ptype', { schema: boxSchema }, async (req) => ({ ...(await cells.ptype(box(req.query))), source: 'Open-Meteo model blend (HRRR in the US)' }));
}
