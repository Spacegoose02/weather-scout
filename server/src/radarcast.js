// Minute-by-minute radar rain for a place. Downloads the latest two US radar
// mosaics (NEXRAD base reflectivity, every 5 minutes, from the Iowa
// Environmental Mesonet, no key), cuts out a square around the place, measures
// how the rain moved between them and slides it forward an hour (see
// shared/radarcast.js). Outside the lower 48 or when the mosaics can't be
// reached it says so, and the app keeps the model's 15-minute nowcast.
import zlib from 'node:zlib';
import { UpstreamError } from './cache.js';
import { estimateMotion, extrapolate, nowcastText, motionVector, FRAME_GAP_MIN, STEP_MIN } from '../../shared/radarcast.js';

const MIN = 60_000;
export const ARCHIVE = 'https://mesonet.agron.iastate.edu/archive/data';
// The n0q mosaic: 0.005° pixels from 126°W, 50°N; pixel value v is (v / 2 - 32.5) dBZ, 0 = no data.
export const MOSAIC = { west: -126, north: 50, east: -65, south: 23, res: 0.005 };
export const valueToDbz = (v) => (v === 0 ? NaN : v * 0.5 - 32.5);
const BLOCK = 4; // average 4 x 4 pixels: 0.02° cells, about 1.4 miles
const HALF_DEG = 1.0; // the cut-out reaches about 70 miles each way

export const frameUrl = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return `${ARCHIVE}/${ymd}/GIS/uscomp/n0q_${stamp}.png`;
};

export const inCoverage = ({ lat, lon }) => lat > MOSAIC.south + 0.5 && lat < MOSAIC.north - 0.5 && lon > MOSAIC.west + 0.5 && lon < MOSAIC.east - 0.5;

// ---- a small PNG reader -------------------------------------------------------
// Only what the mosaic needs: 8-bit grey or palette, not interlaced. It inflates
// row by row and stops after the last row we want, so a 12,200 x 5,400 image is
// never held in memory at once.
export function pngHeader(buf) {
  const SIG = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== SIG) throw new Error('Not a PNG');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const depth = buf[24];
  const color = buf[25];
  const interlace = buf[28];
  return { w, h, depth, color, interlace };
}

function idat(buf) {
  const parts = [];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') parts.push(buf.subarray(i + 8, i + 8 + len));
    if (type === 'IEND') break;
    i += 12 + len;
  }
  return Buffer.concat(parts);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Rows [y0, y1) and columns [x0, x1) of the image's raw byte values.
export async function cropPng(buf, { x0, x1, y0, y1 }) {
  const hd = pngHeader(buf);
  if (hd.depth !== 8 || (hd.color !== 0 && hd.color !== 3) || hd.interlace) throw new Error(`Unsupported PNG (depth ${hd.depth}, color ${hd.color})`);
  const stride = hd.w + 1;
  const cw = x1 - x0;
  const out = new Uint8Array(cw * (y1 - y0));
  let prev = new Uint8Array(hd.w);
  let cur = new Uint8Array(hd.w);
  let row = 0;
  let pos = 0; // bytes of the current scanline filled (including the filter byte)
  let filter = 0;
  return new Promise((resolve, reject) => {
    const inf = zlib.createInflate();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      inf.destroy();
      resolve({ w: cw, h: y1 - y0, data: out });
    };
    inf.on('data', (chunk) => {
      if (done) return;
      let i = 0;
      while (i < chunk.length) {
        if (pos === 0) {
          filter = chunk[i++];
          pos = 1;
          continue;
        }
        const n = Math.min(stride - pos, chunk.length - i);
        for (let k = 0; k < n; k++) {
          const x = pos - 1 + k;
          const raw = chunk[i + k];
          const a = x > 0 ? cur[x - 1] : 0;
          const b = prev[x];
          const c = x > 0 ? prev[x - 1] : 0;
          cur[x] = (raw + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0)) & 0xff;
        }
        i += n;
        pos += n;
        if (pos === stride) {
          if (row >= y0 && row < y1) out.set(cur.subarray(x0, x1), (row - y0) * cw);
          row++;
          pos = 0;
          [prev, cur] = [cur, prev];
          if (row >= y1) return finish();
        }
      }
    });
    inf.on('end', finish);
    inf.on('error', (err) => (done ? null : reject(err)));
    inf.end(idat(buf));
  });
}

// Pixel values -> 0.02° cells of dBZ (the average of the wet pixels, NaN if none were measured).
export function blockGrid(crop, block = BLOCK) {
  const w = Math.floor(crop.w / block);
  const h = Math.floor(crop.h / block);
  const data = new Float32Array(w * h);
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      let sum = 0;
      let n = 0;
      let seen = 0;
      for (let j = 0; j < block; j++) {
        for (let i = 0; i < block; i++) {
          const v = crop.data[(gy * block + j) * crop.w + gx * block + i];
          if (v === 0) continue;
          seen++;
          sum += valueToDbz(v);
          n++;
        }
      }
      data[gy * w + gx] = seen ? sum / n : NaN;
    }
  }
  return { w, h, data };
}

// The pixel window around a place (clamped to the mosaic).
export function windowFor({ lat, lon }) {
  const halfLon = Math.min(1.6, HALF_DEG / Math.cos((lat * Math.PI) / 180));
  const px = (deg) => Math.round(deg / MOSAIC.res);
  const cols = Math.round((MOSAIC.east - MOSAIC.west) / MOSAIC.res);
  const rows = Math.round((MOSAIC.north - MOSAIC.south) / MOSAIC.res);
  const snapTo = BLOCK;
  const x0 = Math.max(0, Math.floor(px(lon - halfLon - MOSAIC.west) / snapTo) * snapTo);
  const x1 = Math.min(cols, Math.ceil(px(lon + halfLon - MOSAIC.west) / snapTo) * snapTo);
  const y0 = Math.max(0, Math.floor(px(MOSAIC.north - (lat + HALF_DEG)) / snapTo) * snapTo);
  const y1 = Math.min(rows, Math.ceil(px(MOSAIC.north - (lat - HALF_DEG)) / snapTo) * snapTo);
  return { x0, x1, y0, y1 };
}

export class RadarNowcast {
  constructor(cache, fetchImpl, { log = console, now = () => Date.now() } = {}) {
    Object.assign(this, { cache, fetchImpl, log, now });
  }

  async png(t) {
    return this.cache.wrap(`n0q:${t}`, 15 * MIN, async () => {
      const res = await this.fetchImpl(frameUrl(t), { signal: AbortSignal.timeout(25000), headers: { accept: 'image/png' } });
      if (!res.ok) throw new UpstreamError('the radar mosaic', res.status);
      return Buffer.from(await res.arrayBuffer());
    });
  }

  // The newest mosaic that exists (they appear a few minutes after the scan).
  // Remembered for 2 minutes; after a failure, the next try waits 5 minutes.
  async latest() {
    if (this.failedUntil && this.now() < this.failedUntil) throw new UpstreamError('the radar mosaic', 503);
    return this.cache.wrap('n0q:latest', 2 * MIN, async () => {
      const step = 5 * MIN;
      const base = Math.floor(this.now() / step) * step;
      let lastErr;
      for (const back of [5, 10, 15]) {
        const t = base - back * MIN;
        try {
          await this.png(t);
          await this.png(t - FRAME_GAP_MIN * MIN);
          this.failedUntil = 0;
          return t;
        } catch (err) {
          lastErr = err;
        }
      }
      this.failedUntil = this.now() + 5 * MIN;
      throw lastErr;
    });
  }

  async grids(t, win) {
    const key = `n0qcrop:${t}:${win.x0},${win.y0},${win.x1},${win.y1}`;
    return this.cache.wrap(key, 15 * MIN, async () => blockGrid(await cropPng(await this.png(t), win)));
  }

  async forPlace(place) {
    if (!inCoverage(place)) return { available: false, reason: 'coverage', text: 'Radar rain timing covers the lower 48 US states.' };
    // Snap the window to a quarter degree so nearby places share the work.
    const snapped = { lat: Math.round(place.lat * 4) / 4, lon: Math.round(place.lon * 4) / 4 };
    const win = windowFor(snapped);
    const t = await this.latest();
    const [a, b] = await Promise.all([this.grids(t - FRAME_GAP_MIN * MIN, win), this.grids(t, win)]);
    const m = estimateMotion(a, b);
    const perMin = m ? { dx: m.dx / FRAME_GAP_MIN, dy: m.dy / FRAME_GAP_MIN } : null;
    // The place's cell in the grid.
    const cell = MOSAIC.res * BLOCK;
    const x = (place.lon - (MOSAIC.west + win.x0 * MOSAIC.res)) / cell - 0.5;
    const y = ((MOSAIC.north - win.y0 * MOSAIC.res) - place.lat) / cell - 0.5;
    const ageMin = Math.max(0, Math.round((this.now() - t) / MIN));
    const steps = extrapolate(b, x, y, perMin, { ageMin });
    const cellMiles = { x: cell * 69.17 * Math.cos((place.lat * Math.PI) / 180), y: cell * 69.17 };
    const wetCells = b.data.reduce((n, v) => n + (v >= 18 ? 1 : 0), 0);
    return {
      available: true,
      time: new Date(t).toISOString(),
      ageMin,
      step: STEP_MIN,
      motion: motionVector(perMin, cellMiles),
      rainNearby: wetCells > 0,
      steps: steps.map((s) => ({ ...s, mmh: s.rate, rate: s.rate == null ? null : place.units === 'metric' ? s.rate : Math.round((s.rate / 25.4) * 1000) / 1000 })),
      rateUnit: place.units === 'metric' ? 'mm/h' : 'in/h',
      text: nowcastText(steps),
    };
  }
}

export function registerRadarNowcast(app, { nowcast, latLonSchema, loc }) {
  app.get('/api/nowcast/radar', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    try {
      return { ...(await nowcast.forPlace(l)), source: 'NEXRAD radar mosaic via Iowa Environmental Mesonet, moved forward by Weather Scout' };
    } catch (err) {
      req.log.warn({ err: err.message }, 'radar nowcast failed');
      return { available: false, reason: 'error', text: 'Radar rain timing is not available right now; showing the forecast model instead.' };
    }
  });
}
