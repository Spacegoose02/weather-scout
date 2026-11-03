// Windy Webcams (https://api.windy.com/webcams): tens of thousands of public
// webcams around the world (beaches, mountains, towns, airports), shown on the
// Radar & Cams map next to the state road cameras, plus a "near me" list.
//
// Needs a Webcams API key, which is separate from the Windy Map Forecast key.
// It is a server key: it is set in Family & settings → App settings → Windy
// maps, kept in the data folder, and never sent to the browser.
//
// Windy's terms, and how this follows them:
//   - Image URLs carry a token that expires (10 minutes on the free plan, 24
//     hours on Pro). So the list is cached here for 5 minutes at most, and the
//     browser loads the pictures straight from Windy. Pictures are never
//     downloaded, proxied or stored by Weather Scout.
//   - Every webcam is credited to Windy with a link back to its page on
//     windy.com, and the map and list say "Webcams provided by Windy.com".
import { UpstreamError } from './cache.js';

export const WEBCAMS_API = 'https://api.windy.com/webcams/api/v3/webcams';
export const WEBCAMS_ATTRIBUTION = { text: 'Webcams provided by Windy.com', url: 'https://www.windy.com/webcams' };
// Image tokens last 10 minutes on the free plan; stay well inside that.
const LIST_TTL_MS = 5 * 60_000;
const INCLUDE = 'images,location,player,urls';
const MAP_LIMIT = 50; // Windy's most per request
const NEAR_LIMIT = 24;
const MAX_SPAN_DEG = 12; // a few states; zoomed out further, the map asks you to zoom in

const round = (n, step) => Math.round(n / step) * step;
const toRad = (d) => (d * Math.PI) / 180;
export function km(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const https = (u) => (typeof u === 'string' && u.startsWith('https://') ? u : null);

// One Windy webcam, trimmed to what the map and the list use.
export function normalizeWebcam(w) {
  const loc = w?.location || {};
  const lat = Number(loc.latitude);
  const lon = Number(loc.longitude);
  if (!w?.webcamId || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cur = w.images?.current || {};
  const day = w.images?.daylight || {};
  const id = String(w.webcamId);
  return {
    id,
    title: String(w.title || 'Webcam').slice(0, 120),
    lat,
    lon,
    place: [loc.city, loc.region, loc.country].filter(Boolean).join(', '),
    thumb: https(cur.thumbnail) || https(cur.preview),
    preview: https(cur.preview) || https(cur.thumbnail),
    daylight: https(day.preview),
    player: https(w.player?.day) || https(w.player?.live),
    // Windy asks that every webcam links back to its page.
    link: https(w.urls?.detail) || `https://www.windy.com/webcams/${encodeURIComponent(id)}`,
    updated: w.lastUpdatedOn || null,
    active: w.status ? w.status === 'active' : true,
  };
}

export class WebcamService {
  constructor({ cfg, cache, fetchImpl }) {
    this.cfg = cfg;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
  }

  get key() {
    return this.cfg.windy?.webcamsKey || '';
  }

  get enabled() {
    return !!this.key;
  }

  async request(params, key = this.key) {
    const url = `${WEBCAMS_API}?${new URLSearchParams({ include: INCLUDE, lang: 'en', ...params })}`;
    const res = await this.fetchImpl(url, { headers: { 'x-windy-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new UpstreamError('Windy Webcams', res.status);
    const body = await res.json();
    const webcams = (body?.webcams || []).map(normalizeWebcam).filter(Boolean);
    return { total: Number(body?.total) || webcams.length, webcams };
  }

  // Webcams in the map view. Bounds are snapped to a grid so family members
  // looking at the same area share one request.
  async inBounds({ south, west, north, east }) {
    if (north - south > MAX_SPAN_DEG || east - west > MAX_SPAN_DEG) return { webcams: [], total: 0, zoomIn: true };
    const step = 0.05;
    const b = { n: Math.min(90, round(north, step) + step), s: Math.max(-90, round(south, step) - step), e: Math.min(180, round(east, step) + step), w: Math.max(-180, round(west, step) - step) };
    const key = `webcams:bbox:${b.n.toFixed(2)},${b.e.toFixed(2)},${b.s.toFixed(2)},${b.w.toFixed(2)}`;
    const r = await this.cache.wrap(key, LIST_TTL_MS, () => this.request({ bbox: [b.n, b.e, b.s, b.w].map((x) => x.toFixed(4)).join(','), limit: String(MAP_LIMIT) }));
    const webcams = r.webcams.filter((c) => c.lat >= south && c.lat <= north && c.lon >= west && c.lon <= east);
    return { webcams, total: webcams.length, truncated: r.total > r.webcams.length };
  }

  // The closest webcams to a place, nearest first.
  async near({ lat, lon, radiusKm = 80 }) {
    const at = { lat: round(lat, 0.01), lon: round(lon, 0.01) };
    const radius = Math.max(5, Math.min(250, Math.round(radiusKm)));
    const nearby = `${at.lat.toFixed(2)},${at.lon.toFixed(2)},${radius}`;
    const r = await this.cache.wrap(`webcams:near:${nearby}`, LIST_TTL_MS, () => this.request({ nearby, limit: String(NEAR_LIMIT) }));
    const webcams = r.webcams
      .map((c) => ({ ...c, km: Math.round(km({ lat, lon }, c) * 10) / 10 }))
      .sort((a, b) => a.km - b.km);
    return { webcams, total: webcams.length, radiusKm: radius };
  }
}

// The Test button in App settings, with the admin's unsaved key. Never throws.
export async function testWebcamsKey(draft, fetchImpl) {
  const key = draft.windy?.webcamsKey;
  if (!key) return { ok: false, message: 'Add the Windy Webcams key first.' };
  const svc = new WebcamService({ cfg: draft, cache: null, fetchImpl });
  const { lat, lon } = draft.defaultLocation;
  try {
    const r = await svc.request({ nearby: `${lat.toFixed(2)},${lon.toFixed(2)},100`, limit: '1' }, key);
    return { ok: true, message: r.total ? `Connected. ${r.total.toLocaleString('en-US')} webcams within 100 km of home.` : 'The key works, but Windy has no webcams within 100 km of home.' };
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      return { ok: false, message: 'Windy turned that key down. Check that it is a Webcams API key (not a Map Forecast key). New keys can take a few minutes to start working.' };
    }
    if (err instanceof UpstreamError && err.status === 429) return { ok: false, message: 'The key works, but it has hit its Windy limit for now. Try again later.' };
    return { ok: false, message: `Windy Webcams didn't answer: ${String(err.message || err).slice(0, 160)}` };
  }
}

const bboxSchema = {
  querystring: {
    type: 'object',
    required: ['south', 'west', 'north', 'east'],
    properties: {
      south: { type: 'number', minimum: -90, maximum: 90 },
      north: { type: 'number', minimum: -90, maximum: 90 },
      west: { type: 'number', minimum: -180, maximum: 180 },
      east: { type: 'number', minimum: -180, maximum: 180 },
    },
  },
};
const nearSchema = {
  querystring: {
    type: 'object',
    required: ['lat', 'lon'],
    properties: {
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lon: { type: 'number', minimum: -180, maximum: 180 },
      radius: { type: 'number', minimum: 5, maximum: 250 },
    },
  },
};

export function registerWebcams(app, { cfg, cache, fetchImpl }) {
  const webcams = new WebcamService({ cfg, cache, fetchImpl });
  const off = (reply) => reply.code(404).send({ error: 'Windy webcams are off. An admin can add a Windy Webcams key in Family & settings → App settings → Windy maps.' });
  const failed = (reply, err) => {
    if (err instanceof UpstreamError) return reply.code(502).send({ error: err.status === 429 ? 'Windy webcams are busy right now. Try again in a little while.' : 'Windy webcams are unavailable right now.' });
    throw err;
  };
  // The list holds image links that expire, so browsers must not keep it long.
  const noStore = (reply) => reply.header('cache-control', 'private, max-age=60');

  app.get('/api/webcams/info', async () => ({ enabled: webcams.enabled, attribution: WEBCAMS_ATTRIBUTION }));

  app.get('/api/webcams', { schema: bboxSchema }, async (req, reply) => {
    if (!webcams.enabled) return off(reply);
    try {
      noStore(reply);
      return { ...(await webcams.inBounds(req.query)), attribution: WEBCAMS_ATTRIBUTION };
    } catch (err) {
      return failed(reply, err);
    }
  });

  app.get('/api/webcams/near', { schema: nearSchema }, async (req, reply) => {
    if (!webcams.enabled) return off(reply);
    try {
      noStore(reply);
      return { ...(await webcams.near({ lat: req.query.lat, lon: req.query.lon, radiusKm: req.query.radius })), attribution: WEBCAMS_ATTRIBUTION };
    } catch (err) {
      return failed(reply, err);
    }
  });

  return webcams;
}
