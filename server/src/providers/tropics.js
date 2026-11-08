// Hurricane tracker: active tropical storms from the National Hurricane Center
// (no key). The storm list comes from CurrentStorms.json, and each storm's
// forecast cone and track come from the KMZ files NHC links from it.
import zlib from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { UpstreamError, fetchJson } from '../cache.js';

export const STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
const NHC = /^https:\/\/www\.nhc\.noaa\.gov\//;
const MAX_KMZ = 5 * 1024 * 1024;
const KT_TO_MPH = 1.15078;

const KINDS = {
  TD: 'Tropical depression', TS: 'Tropical storm', HU: 'Hurricane', MH: 'Major hurricane',
  STD: 'Subtropical depression', STS: 'Subtropical storm', PTC: 'Potential tropical cyclone',
  PC: 'Post-tropical cyclone', TY: 'Typhoon', PTY: 'Post-tropical cyclone',
};

// Saffir-Simpson category from sustained wind in knots (0 = below hurricane strength).
export function category(kt) {
  if (kt >= 137) return 5;
  if (kt >= 113) return 4;
  if (kt >= 96) return 3;
  if (kt >= 83) return 2;
  if (kt >= 64) return 1;
  return 0;
}

const BASINS = { AT: 'Atlantic', EP: 'Eastern Pacific', CP: 'Central Pacific' };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const safeUrl = (u) => (typeof u === 'string' && NHC.test(u) ? u : null);

function kidLine(s) {
  if (s.category >= 3) return `${s.name} is a major hurricane. Its winds can knock down trees and damage houses. If it's coming your way, grown-ups will have a plan.`;
  if (s.category >= 1) return `${s.name} is a hurricane: a giant spinning storm over warm ocean water, with winds over 74 mph.`;
  if (/storm/i.test(s.kind)) return `${s.name} is a tropical storm. It has strong winds and lots of rain, and it could grow into a hurricane.`;
  return `${s.name} is a tropical system: a cluster of storms starting to spin over the ocean.`;
}

export function normalizeStorm(raw) {
  const kt = num(raw.intensity);
  const cat = kt == null ? 0 : category(kt);
  const code = String(raw.classification || '').toUpperCase();
  const kind = code === 'HU' && cat >= 3 ? KINDS.MH : KINDS[code] || 'Tropical system';
  const dir = num(raw.movementDir);
  const s = {
    id: String(raw.id || '').toLowerCase(),
    bin: raw.binNumber || null,
    basin: BASINS[String(raw.binNumber || '').slice(0, 2)] || null,
    name: raw.name || 'Unnamed',
    kind,
    category: cat,
    windKt: kt,
    windMph: kt == null ? null : Math.round((kt * KT_TO_MPH) / 5) * 5,
    pressure: num(raw.pressure),
    lat: num(raw.latitudeNumeric),
    lon: num(raw.longitudeNumeric),
    movement: dir == null ? null : { dir: COMPASS[Math.round(dir / 22.5) % 16], mph: num(raw.movementSpeed) },
    updated: raw.lastUpdate || null,
    advisoryUrl: safeUrl(raw.publicAdvisory?.url),
    // Text products for surge heights and wind odds (see server/src/hurricane.js).
    windOddsUrl: safeUrl(raw.windSpeedProbabilities?.url),
    coneKmz: safeUrl(raw.trackCone?.kmzFile),
    trackKmz: safeUrl(raw.forecastTrack?.kmzFile),
  };
  s.kid = kidLine(s);
  return s;
}

// ---- KMZ (a zip holding one KML file) -------------------------------------
export function unzipFirst(buf, match = /\.kml$/i) {
  const b = Buffer.from(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const entries = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10);
    const size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!match.test(name)) continue;
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(start, start + size);
    if (method === 0) return data.toString('utf8');
    if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 20 * 1024 * 1024 }).toString('utf8');
    throw new Error(`Unsupported zip method ${method}`);
  }
  throw new Error('No KML in KMZ');
}

const kml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, isArray: (name) => ['Placemark', 'Folder', 'Document', 'Polygon', 'LineString', 'Point', 'innerBoundaryIs'].includes(name) });
const coordList = (s) => String(s || '').trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((c) => c.length >= 2 && c.every(Number.isFinite)).map(([lon, lat]) => [lon, lat]);

function geometries(g) {
  const out = [];
  if (!g || typeof g !== 'object') return out;
  for (const poly of g.Polygon || []) {
    const outer = coordList(poly.outerBoundaryIs?.LinearRing?.coordinates);
    if (outer.length >= 4) out.push({ type: 'Polygon', coordinates: [outer, ...(poly.innerBoundaryIs || []).map((r) => coordList(r.LinearRing?.coordinates)).filter((r) => r.length >= 4)] });
  }
  for (const line of g.LineString || []) {
    const c = coordList(line.coordinates);
    if (c.length >= 2) out.push({ type: 'LineString', coordinates: c });
  }
  for (const pt of g.Point || []) {
    const c = coordList(pt.coordinates)[0];
    if (c) out.push({ type: 'Point', coordinates: c });
  }
  if (g.MultiGeometry) out.push(...geometries(g.MultiGeometry));
  return out;
}

export function kmlToFeatures(text, props = {}) {
  const doc = kml.parse(text);
  const features = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const pm of node.Placemark || []) {
      const name = typeof pm.name === 'string' ? pm.name.slice(0, 120) : '';
      for (const geometry of geometries(pm)) features.push({ type: 'Feature', geometry, properties: { ...props, name } });
    }
    for (const k of ['Document', 'Folder']) for (const child of node[k] || []) walk(child);
  };
  walk(doc.kml || doc);
  return features;
}

async function fetchKmz(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new UpstreamError('National Hurricane Center', res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_KMZ) throw new Error('KMZ too large');
  return unzipFirst(buf);
}

export async function getStorms(fetchImpl, { log } = {}) {
  const raw = await fetchJson(STORMS_URL, { source: 'National Hurricane Center', fetchImpl, timeoutMs: 15000 });
  const storms = (raw.activeStorms || []).map(normalizeStorm).filter((s) => s.lat != null && s.lon != null);
  const features = [];
  await Promise.all(storms.map(async (s) => {
    for (const [kind, url] of [['cone', s.coneKmz], ['track', s.trackKmz]]) {
      if (!url) continue;
      try {
        features.push(...kmlToFeatures(await fetchKmz(url, fetchImpl), { storm: s.id, kind }));
      } catch (err) {
        log?.warn?.({ err: err.message, storm: s.id, kind }, 'tropics: could not load KMZ');
      }
    }
  }));
  for (const s of storms) {
    delete s.coneKmz;
    delete s.trackKmz;
  }
  return { storms, features: { type: 'FeatureCollection', features }, source: 'National Hurricane Center', fetchedAt: new Date().toISOString() };
}

// Great-circle distance in miles, for "Ernesto is 640 miles from you".
export function milesBetween(a, b) {
  const R = 3958.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
