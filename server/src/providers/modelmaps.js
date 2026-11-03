// Forecast model maps: a grid of points around the family's place, every 3 hours,
// for one model at a time. All from Open-Meteo (free, no key), in one request:
// Open-Meteo answers many coordinates at once with a list of forecasts.
import { UpstreamError, fetchJson } from '../cache.js';
import { unitParams } from './openmeteo.js';
import { MAP_MODELS, MAP_VARS, STEP_HOURS, gridFor, pointsFor } from '../../../shared/modelmap.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const HOUR = 3600_000;

// Open-Meteo's free tier counts every point as one call and allows 600 a minute.
// A whole-US map is 275 points, so a third map in the same minute waits its turn
// here instead of being refused.
export class PointBudget {
  constructor({ perMinute = 560, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    Object.assign(this, { perMinute, now, sleep, spent: [] });
  }

  async take(points) {
    for (;;) {
      const t = this.now();
      this.spent = this.spent.filter((x) => x.at > t - 60_000);
      const used = this.spent.reduce((s, x) => s + x.points, 0);
      if (!this.spent.length || used + points <= this.perMinute) {
        this.spent.push({ at: t, points });
        return;
      }
      await this.sleep(this.spent[0].at + 60_000 - t + 50);
    }
  }
}
const budget = new PointBudget();

export function modelMapUrl(model, grid, units, keep = pointsFor(model, grid)) {
  // The grid points the model covers, row by row (north to south, west to east).
  const cols = grid.lons.length;
  const latitude = keep.map((k) => grid.lats[Math.floor(k / cols)]);
  const longitude = keep.map((k) => grid.lons[k % cols]);
  const p = new URLSearchParams({
    latitude: latitude.join(','),
    longitude: longitude.join(','),
    hourly: Object.values(MAP_VARS).join(','),
    models: model.id,
    forecast_days: String(model.days + 1),
    timezone: 'GMT',
    timeformat: 'unixtime',
    cell_selection: 'nearest',
    ...unitParams(units),
  });
  return `${FORECAST_URL}?${p}`;
}

const round = (v, d) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const DIGITS = { temp: 1, precip: 3, wind: 0, windDir: 0, clouds: 0, pressure: 1 };

// Open-Meteo's list (one forecast per grid point) -> one flat grid per field per 3-hour step.
export function normalizeModelMap(raw, model, grid, units, now = Date.now()) {
  const points = Array.isArray(raw) ? raw : [raw];
  const n = grid.rows * grid.cols;
  if (points.length !== n) throw new Error(`Expected ${n} grid points, got ${points.length}`);
  const times = (points[0].hourly?.time || []).map((t) => t * 1000);
  const first = Math.floor(now / HOUR) * HOUR;
  const end = first + model.days * 24 * HOUR;
  // Steps every 3 hours, starting with the current hour.
  const steps = [];
  times.forEach((t, i) => {
    if (t >= first && t <= end && (t - first) % (STEP_HOURS * HOUR) === 0) steps.push(i);
  });

  const fields = Object.fromEntries(Object.keys(MAP_VARS).map((f) => [f, []]));
  let filled = 0;
  for (const i of steps) {
    for (const [f, v] of Object.entries(MAP_VARS)) {
      const row = new Array(n);
      for (let k = 0; k < n; k++) {
        const h = points[k].hourly || {};
        let x;
        if (f === 'precip') {
          // Total for the 3 hours ending at this step (the first step looks at the hour just gone).
          x = null;
          for (let j = Math.max(0, i - STEP_HOURS + 1); j <= i; j++) if (h[v]?.[j] != null) x = (x || 0) + h[v][j];
        } else x = h[v]?.[i] ?? null;
        row[k] = round(x, DIGITS[f]);
        if (f === 'temp' && x != null) filled++;
      }
      fields[f].push(row);
    }
  }
  const coverage = steps.length ? filled / (steps.length * n) : 0;
  return {
    model: model.id,
    name: model.name,
    note: model.note,
    area: grid.area,
    center: grid.center,
    rows: grid.rows,
    cols: grid.cols,
    lats: grid.lats,
    lons: grid.lons,
    step: STEP_HOURS,
    times: steps.map((i) => times[i]),
    coverage: Math.round(coverage * 100) / 100,
    units,
    fields,
  };
}

export async function getModelMap({ lat, lon, units, model: id, area }, fetchImpl, points = budget) {
  const model = MAP_MODELS.find((m) => m.id === id) || MAP_MODELS[0];
  const grid = gridFor(lat, lon, area);
  const noData = () => {
    const err = new Error(model.usOnly ? `${model.name} only covers the United States. Try another model.` : `${model.name} has no data for this area right now. Try another model.`);
    err.statusCode = 404;
    return err;
  };
  // Only ask for points the model covers (HRRR stops short of the lower 48 box's corners).
  const keep = pointsFor(model, grid);
  if (!keep.length) throw noData();
  let raw;
  await points.take(keep.length);
  try {
    raw = await fetchJson(modelMapUrl(model, grid, units, keep), { source: `Open-Meteo ${model.name} map`, fetchImpl, timeoutMs: 25000 });
  } catch (err) {
    // Open-Meteo answers 400 when a model has nothing for these points.
    if (err instanceof UpstreamError && err.status === 400) throw noData();
    throw err;
  }
  // Put the answers back on the full grid; points left out stay empty.
  const answers = Array.isArray(raw) ? raw : [raw];
  if (answers.length !== keep.length) throw new Error(`Expected ${keep.length} grid points, got ${answers.length}`);
  const full = Array.from({ length: grid.rows * grid.cols }, () => ({ hourly: {} }));
  keep.forEach((k, i) => { full[k] = answers[i]; });
  // Every point needs the time axis; borrow it from one that has it.
  const time = answers[0]?.hourly?.time;
  for (const p of full) if (!p.hourly.time) p.hourly = { ...p.hourly, time };
  const map = normalizeModelMap(full, model, grid, units);
  if (!map.times.length || map.coverage === 0) throw noData();
  return map;
}
