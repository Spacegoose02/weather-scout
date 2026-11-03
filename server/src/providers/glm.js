// NOAA GOES Geostationary Lightning Mapper (GLM): every flash the satellite
// sees across the Americas, in one small NetCDF file every 20 seconds. NOAA
// publishes them free on AWS (Open Data, no key). Positions are good to about
// 8 km, so this is great for "is there lightning around" and less for pinpointing.
import * as hdf5 from 'jsfive';

export const GLM_SATELLITES = {
  goes19: { bucket: 'noaa-goes19', label: 'GOES-19 (East)' },
  goes18: { bucket: 'noaa-goes18', label: 'GOES-18 (West)' },
};

// product_time is "seconds since 2000-01-01 12:00:00" (the J2000 epoch, in UTC).
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
// Used when the file's packing attributes cannot be read (they have been
// the same since GLM went live).
const TIME_SCALE = 0.0003814756;
const TIME_OFFSET = -5;

const pad = (n, w = 2) => String(n).padStart(w, '0');

function dayOfYear(d) {
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

// GLM-L2-LCFA/2026/307/01/ for 2026-11-03 01:xx UTC.
export function hourPrefix(ms) {
  const d = new Date(ms);
  return `GLM-L2-LCFA/${d.getUTCFullYear()}/${pad(dayOfYear(d), 3)}/${pad(d.getUTCHours())}/`;
}

// The scan start time in a file name: ..._s20263070100000_e... (year, day, h, m, s, tenths).
export function fileStart(key) {
  const m = /_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)_/.exec(key);
  if (!m) return null;
  const [, y, doy, h, mi, s, ds] = m.map(Number);
  return Date.UTC(y, 0, 1) + (doy - 1) * 86_400_000 + h * 3_600_000 + mi * 60_000 + s * 1000 + ds * 100;
}

// Keys from an S3 ListObjectsV2 reply.
export function parseListing(xml) {
  return [...String(xml).matchAll(/<Key>([^<]+\.nc)<\/Key>/g)].map((m) => m[1]);
}

const toArrayBuffer = (buf) => (buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

function attr(ds, name, fallback) {
  try {
    const v = ds.attrs?.[name];
    const n = Array.isArray(v) || ArrayBuffer.isView(v) ? v[0] : v;
    return Number.isFinite(Number(n)) && n !== null && n !== undefined ? Number(n) : fallback;
  } catch {
    return fallback;
  }
}

// Flashes in one GLM L2 file, as strikes { t, lat, lon, src: 'glm' }.
export function parseGlm(buffer, key = '') {
  const f = new hdf5.File(toArrayBuffer(buffer), key || 'glm.nc');
  const lat = f.get('flash_lat')?.value || [];
  const lon = f.get('flash_lon')?.value || [];
  const offDs = f.get('flash_time_offset_of_first_event');
  const off = offDs?.value || [];
  const quality = f.get('flash_quality_flag')?.value || [];
  let base = fileStart(key);
  try {
    const pt = Number(f.get('product_time')?.value?.[0] ?? f.get('product_time')?.value);
    if (Number.isFinite(pt) && pt > 0) base = J2000 + pt * 1000;
  } catch { /* fall back to the file name */ }
  if (base == null) throw new Error('GLM file has no start time');
  const scale = attr(offDs, 'scale_factor', TIME_SCALE);
  const add = attr(offDs, 'add_offset', TIME_OFFSET);
  const strikes = [];
  for (let i = 0; i < lat.length; i++) {
    if (quality.length && quality[i] !== 0) continue; // 0 = good quality
    const la = lat[i];
    const lo = lon[i];
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) continue;
    // Stored as unsigned 16-bit, which jsfive reads as signed.
    const raw = off[i] == null ? 0 : off[i] < 0 ? off[i] + 65536 : off[i];
    strikes.push({ t: Math.round(base + (raw * scale + add) * 1000), lat: Math.round(la * 1e4) / 1e4, lon: Math.round(lo * 1e4) / 1e4, src: 'glm' });
  }
  return strikes;
}

// Follows the newest GLM files and hands their flashes to onStrikes.
export class GlmFeed {
  constructor({ satellite = 'goes19', backfillMin = 10, maxFilesPerPoll = 40, fetchImpl = fetch, log = console, onStrikes = () => {}, parse = parseGlm } = {}) {
    const sat = GLM_SATELLITES[satellite] || GLM_SATELLITES.goes19;
    this.base = `https://${sat.bucket}.s3.amazonaws.com`;
    this.label = sat.label;
    this.backfillMs = backfillMin * 60_000;
    this.maxFiles = maxFilesPerPoll;
    this.fetch = fetchImpl;
    this.log = log;
    this.onStrikes = onStrikes;
    this.parse = parse;
    this.seen = new Set();
    this.lastStart = 0;
    this.lastOk = null;
    this.error = '';
  }

  async list(prefix) {
    const res = await this.fetch(`${this.base}/?list-type=2&prefix=${encodeURIComponent(prefix)}`);
    if (!res.ok) throw new Error(`GLM listing ${res.status}`);
    return parseListing(await res.text());
  }

  async poll(now = Date.now()) {
    try {
      const since = Math.max(this.lastStart, now - this.backfillMs);
      const prefixes = [...new Set([hourPrefix(since), hourPrefix(now)])];
      const keys = (await Promise.all(prefixes.map((p) => this.list(p)))).flat()
        .map((k) => ({ k, start: fileStart(k) }))
        .filter((x) => x.start != null && x.start >= since && !this.seen.has(x.k))
        .sort((a, b) => a.start - b.start)
        .slice(-this.maxFiles);
      let added = 0;
      for (const { k, start } of keys) {
        const res = await this.fetch(`${this.base}/${k}`);
        if (!res.ok) throw new Error(`GLM file ${res.status}`);
        const strikes = this.parse(Buffer.from(await res.arrayBuffer()), k);
        this.seen.add(k);
        this.lastStart = Math.max(this.lastStart, start + 1);
        added += strikes.length;
        this.onStrikes(strikes);
      }
      // Forget file names that have left the window.
      if (this.seen.size > 400) this.seen = new Set([...this.seen].filter((k) => fileStart(k) >= now - 2 * this.backfillMs));
      this.lastOk = now;
      this.error = '';
      return { files: keys.length, strikes: added };
    } catch (err) {
      this.error = err.message;
      this.log.warn?.({ err: err.message }, 'lightning: GLM update failed');
      return { files: 0, strikes: 0, error: err.message };
    }
  }
}
