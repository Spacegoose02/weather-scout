// Traffic / weather cameras from state DOT 511 systems and your own cameras.
// Feeds are configured in /data/cameras.json (see cameras.example.json). API keys
// are referenced by environment variable name so they never live in a file that
// could be committed or shared.
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, UpstreamError } from '../../cache.js';

// Built-in feeds used when no cameras.json exists. All are public, no key:
//  - 511 Virginia: GeoJSON with a snapshot PNG and an HTTPS HLS stream per camera
//  - 511 South Carolina: same Iteris GeoJSON format as Virginia
//  - Maryland CHART (MD iMAP ArcGIS layer): live video player page per camera
//  - Kentucky (KYTC ArcGIS layer): snapshot JPG per camera
//  - Delaware (DelDOT, Delaware FirstMap ArcGIS layer): HTTPS HLS live video per camera
// Plus feeds that switch on once their free developer key is set:
//  - North Carolina (DriveNC, IBI 511 API v2): NC_DRIVENC_API_KEY
//  - New York (511NY, IBI 511 API v2): NY511_API_KEY
//  - Georgia (511GA, IBI 511 API v2): GA511_API_KEY
//  - Ohio (OHGO public API): OHGO_API_KEY
export const DEFAULT_FEEDS = [
  {
    id: 'va',
    name: '511 Virginia (VDOT)',
    region: 'VA',
    type: 'geojson',
    url: 'https://511.vdot.virginia.gov/services/511/map/layers/map/cams',
    fields: { id: 'id', name: 'description', image: 'image_url', video: 'https_url', road: 'route', direction: 'direction', active: 'active', problem: 'problem_stream' },
    refreshMinutes: 15,
  },
  {
    id: 'sc',
    name: '511 South Carolina (SCDOT)',
    region: 'SC',
    type: 'geojson',
    url: 'https://sc.cdn.iteris-atis.com/geojson/icons/metadata/icons.cameras.geojson',
    fields: { id: 'name', name: 'description', image: 'image_url', video: 'https_url', road: 'route', direction: 'direction', active: 'active', problem: 'problem_stream' },
    refreshMinutes: 15,
  },
  {
    id: 'md',
    name: 'Maryland CHART',
    region: 'MD',
    type: 'arcgis',
    url: 'https://geodata.md.gov/imap/rest/services/Transportation/MD_TrafficCameras/MapServer/0',
    fields: { id: 'feedID', name: 'location', embed: 'url' },
    refreshMinutes: 60,
  },
  {
    id: 'ky',
    name: 'Kentucky (KYTC)',
    region: 'KY',
    type: 'arcgis',
    url: 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_WebCams_WGS84WM/MapServer/0',
    fields: { id: 'OBJECTID', name: 'description', image: 'snapshot', road: 'highway', direction: 'direction' },
    refreshMinutes: 60,
  },
  {
    id: 'de',
    name: 'Delaware (DelDOT)',
    region: 'DE',
    type: 'arcgis',
    // DelDOT publishes its camera list (with live HLS links) on Delaware FirstMap.
    url: 'https://enterprise.firstmaptest.delaware.gov/arcgis/rest/services/Transportation/DE_TMC_Traffic_Feeds/FeatureServer/1',
    fields: { id: 'ID', name: 'TITLE', video: 'M3U8S', active: 'ENABLED' },
    pageSize: 1000,
    refreshMinutes: 60,
  },
  {
    id: 'nc',
    name: 'DriveNC (NCDOT)',
    region: 'NC',
    type: 'ibi511',
    apiVersion: 2,
    baseUrl: 'https://www.drivenc.gov',
    keyEnv: 'NC_DRIVENC_API_KEY',
    requiresKey: true,
    signup: 'https://www.drivenc.gov/developers/doc',
    refreshMinutes: 15, // DriveNC allows 10 calls a minute; one call every 15 minutes is plenty
  },
  {
    id: 'ny',
    name: '511NY (NYSDOT)',
    region: 'NY',
    type: 'ibi511',
    apiVersion: 2,
    baseUrl: 'https://511ny.org',
    keyEnv: 'NY511_API_KEY',
    requiresKey: true,
    signup: 'https://511ny.org/developers/doc',
    refreshMinutes: 15,
  },
  {
    id: 'ga',
    name: '511 Georgia (GDOT)',
    region: 'GA',
    type: 'ibi511',
    apiVersion: 2,
    baseUrl: 'https://511ga.org',
    keyEnv: 'GA511_API_KEY',
    requiresKey: true,
    signup: 'https://511ga.org/developers/doc',
    refreshMinutes: 15,
  },
  {
    id: 'oh',
    name: 'OHGO (ODOT)',
    region: 'OH',
    type: 'ohgo',
    baseUrl: 'https://publicapi.ohgo.com',
    keyEnv: 'OHGO_API_KEY',
    requiresKey: true,
    signup: 'https://publicapi.ohgo.com/docs/registration',
    refreshMinutes: 15,
  },
];

export function defaultFeeds(setting = '', env = {}) {
  const v = String(setting).trim().toLowerCase();
  if (/^(0|false|no|off|none)$/.test(v)) return [];
  const usable = DEFAULT_FEEDS.filter((f) => !f.requiresKey || env[f.keyEnv]);
  if (!v || /^(1|true|yes|on|all)$/.test(v)) return usable;
  const wanted = new Set(v.split(/[\s,]+/));
  return usable.filter((f) => wanted.has(f.id));
}

// Built-in feeds that would be on but are waiting for a free key, so the admin
// screen can say exactly which setting to fill in.
export function feedsNeedingKeys(setting = '', env = {}) {
  const v = String(setting).trim().toLowerCase();
  if (/^(0|false|no|off|none)$/.test(v)) return [];
  const all = !v || /^(1|true|yes|on|all)$/.test(v);
  const wanted = new Set(v.split(/[\s,]+/));
  return DEFAULT_FEEDS
    .filter((f) => f.requiresKey && !env[f.keyEnv] && (all || wanted.has(f.id)))
    .map(({ id, name, region, keyEnv, signup }) => ({ id, name, region, keyEnv, signup }));
}

const get = (obj, path) => (path ? String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj) : undefined);

function feedKey(feed, env) {
  if (feed.keyEnv) return env[feed.keyEnv] || '';
  return '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryable = (err) => (err instanceof UpstreamError ? [429, 500, 502, 503, 504].includes(err.status) : true);

// DOT servers have brief hiccups (503s, timeouts). Try a few times with a growing pause.
export async function fetchJsonRetry(url, opts, { tries = 3, baseDelayMs = 1500 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetchJson(url, opts);
    } catch (err) {
      last = err;
      if (!retryable(err) || i === tries - 1) break;
      await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw last;
}

// IBI Group / Castle Rock "511" developer API, used by many states
// (511NY, 511GA, 511WI, 511AZ, Idaho 511, 511 Alaska, ...):
//   {baseUrl}/api/getcameras?key=KEY&format=json        (v1)
//   {baseUrl}/api/v2/get/cameras?key=KEY&format=json    (v2, with Views[])
export function parseIbi511(list, feed) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => {
      const views = Array.isArray(c.Views) ? c.Views.filter((v) => !/disabled|offline/i.test(v.Status || '')) : null;
      const image = views ? views[0]?.Url : c.Url;
      return {
        id: String(c.ID ?? c.Id),
        name: c.Name || c.Location || c.RoadwayName || c.Roadway || 'Camera',
        road: c.RoadwayName || c.Roadway || null,
        direction: c.DirectionOfTravel || c.Direction || null,
        lat: Number(c.Latitude),
        lon: Number(c.Longitude),
        image: image || null,
        video: (views ? views[0]?.VideoUrl : c.VideoUrl) || null,
        disabled: !!(c.Disabled || c.Blocked),
      };
    })
    .filter((c) => !c.disabled && c.image && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

// OHGO (Ohio DOT) public API: /api/v1/cameras with CameraViews[] of snapshot URLs.
export function parseOhgo(raw) {
  const list = raw?.results ?? raw?.Results ?? (Array.isArray(raw) ? raw : []);
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => {
      const views = c.cameraViews ?? c.CameraViews ?? [];
      const v = views[0] || {};
      return {
        id: String(c.id ?? c.Id),
        name: c.location ?? c.Location ?? c.description ?? c.Description ?? 'Camera',
        road: v.mainRoute ?? v.MainRoute ?? null,
        direction: v.direction ?? v.Direction ?? null,
        lat: Number(c.latitude ?? c.Latitude),
        lon: Number(c.longitude ?? c.Longitude),
        image: v.largeUrl ?? v.LargeUrl ?? v.smallUrl ?? v.SmallUrl ?? null,
        video: null,
      };
    })
    .filter((c) => c.image && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

const isOff = (v) => v === false || v === 0 || /^(0|false|no|n)$/i.test(String(v ?? '').trim());

// Generic GeoJSON FeatureCollection with configurable property names. Works for
// ArcGIS "f=geojson" layers and most open-data portals (including 511 Virginia).
export function parseGeoJson(raw, feed) {
  const f = feed.fields || {};
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return features
    .map((feat, i) => {
      const p = feat.properties || {};
      const [lon, lat] = feat.geometry?.coordinates || [];
      if (f.active && isOff(get(p, f.active))) return null;
      if (f.problem && get(p, f.problem) === true) return null;
      return {
        id: String(get(p, f.id || 'id') ?? feat.id ?? i),
        name: get(p, f.name || 'name') || get(p, 'name') || 'Camera',
        road: get(p, f.road) || null,
        direction: get(p, f.direction) || null,
        lat: Number(lat),
        lon: Number(lon),
        image: get(p, f.image || 'image_url') || null,
        video: get(p, f.video) || null,
        embed: get(p, f.embed) || null,
      };
    })
    .filter((c) => c && (c.image || isHttps(c.embed) || isHttps(c.video)) && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');

// ArcGIS MapServer/FeatureServer layers cap results per request, so page through.
// Some servers fail on f=geojson but still answer f=json (Esri JSON), so fall back to that.
async function fetchArcgis(feed, fetchImpl, opts) {
  try {
    return await fetchArcgisPages(feed, fetchImpl, opts, 'geojson');
  } catch (err) {
    try {
      return await fetchArcgisPages(feed, fetchImpl, { ...opts, retry: { tries: 1 } }, 'json');
    } catch {
      throw err;
    }
  }
}

async function fetchArcgisPages(feed, fetchImpl, { headers, retry } = {}, format) {
  const pageSize = feed.pageSize || 500;
  const all = [];
  for (let page = 0; page < 40; page++) {
    const u = new URL(`${feed.url.replace(/\/$/, '')}/query`);
    u.search = new URLSearchParams({
      where: feed.where || '1=1', outFields: '*', outSR: '4326', f: format,
      resultOffset: String(page * pageSize), resultRecordCount: String(pageSize),
    }).toString();
    const raw = await fetchJsonRetry(u.toString(), { source: feed.id, fetchImpl, headers, timeoutMs: 20000 }, retry);
    if (raw?.error) throw new UpstreamError(feed.id, raw.error.code || 500, `${feed.id} answered: ${raw.error.message || 'error'}`);
    const features = format === 'json' ? esriToGeoJson(raw) : Array.isArray(raw?.features) ? raw.features : [];
    all.push(...features);
    const more = raw?.exceededTransferLimit ?? raw?.properties?.exceededTransferLimit;
    if (!more || !features.length) break;
  }
  return { type: 'FeatureCollection', features: all };
}

export function esriToGeoJson(raw) {
  return (Array.isArray(raw?.features) ? raw.features : [])
    .filter((f) => Number.isFinite(f.geometry?.x) && Number.isFinite(f.geometry?.y))
    .map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.geometry.x, f.geometry.y] }, properties: f.attributes || {} }));
}

export function parseStatic(feed) {
  return (feed.cameras || [])
    .map((c, i) => ({ id: String(c.id ?? i), name: c.name || 'Camera', lat: Number(c.lat), lon: Number(c.lon), image: c.image, video: c.video || null, road: c.road || null }))
    .filter((c) => c.image && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

// After a feed fails we keep showing its last good camera list (also saved to the
// data volume, so it survives restarts) and wait before asking the DOT again:
// 2 minutes, then 4, 8, ... up to 30.
const BACKOFF_MIN_MS = 2 * 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

export class CameraService {
  constructor(cfg, cache, fetchImpl = fetch, { retry } = {}) {
    this.cfg = cfg;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
    this.retry = retry;
    this.lastGood = new Map(); // feed id -> { cameras, at }
    this.failures = new Map(); // feed id -> { count, until, error }
    this.headers = { 'user-agent': cfg.nwsUserAgent || 'WeatherScout (self-hosted)', accept: 'application/json, application/geo+json;q=0.9, */*;q=0.5' };
    this.cacheDir = cfg.dataDir && cfg.dataDir !== ':memory:' ? path.join(cfg.dataDir, 'camera-cache') : null;
  }

  feeds() {
    const { camerasFile, env } = this.cfg;
    try {
      if (env.CAMERA_FEEDS_JSON) return JSON.parse(env.CAMERA_FEEDS_JSON).feeds || [];
      if (fs.existsSync(camerasFile)) return JSON.parse(fs.readFileSync(camerasFile, 'utf8')).feeds || [];
    } catch (err) {
      console.error(`[cameras] could not read camera config: ${err.message}`);
      return [];
    }
    return defaultFeeds(env.CAMERAS_DEFAULT_FEEDS, env);
  }

  // Built-in keyed feeds that are switched off only because their key is missing.
  needingKeys() {
    const { camerasFile, env } = this.cfg;
    if (env.CAMERA_FEEDS_JSON || fs.existsSync(camerasFile)) return [];
    return feedsNeedingKeys(env.CAMERAS_DEFAULT_FEEDS, env);
  }

  async fetchFeed(feed) {
    const env = this.cfg.env;
    const opts = { source: feed.id, fetchImpl: this.fetchImpl, headers: { ...this.headers }, timeoutMs: 20000 };
    let cams = [];
    if (feed.type === 'static') {
      cams = parseStatic(feed);
    } else if (feed.type === 'ibi511') {
      const key = feedKey(feed, env);
      const p = feed.apiVersion === 2 ? '/api/v2/get/cameras' : '/api/getcameras';
      const url = `${feed.baseUrl.replace(/\/$/, '')}${p}?key=${encodeURIComponent(key)}&format=json`;
      cams = parseIbi511(await fetchJsonRetry(url, opts, this.retry), feed);
    } else if (feed.type === 'ohgo') {
      const key = feedKey(feed, env);
      const url = `${(feed.baseUrl || 'https://publicapi.ohgo.com').replace(/\/$/, '')}/api/v1/cameras?page-all=true`;
      opts.headers.authorization = `APIKEY ${key}`;
      cams = parseOhgo(await fetchJsonRetry(url, opts, this.retry));
    } else if (feed.type === 'geojson') {
      const url = new URL(feed.url);
      const key = feedKey(feed, env);
      if (key && feed.keyParam) url.searchParams.set(feed.keyParam, key);
      if (key && feed.keyHeader) opts.headers[feed.keyHeader] = key;
      cams = parseGeoJson(await fetchJsonRetry(url.toString(), opts, this.retry), feed);
    } else if (feed.type === 'arcgis') {
      cams = parseGeoJson(await fetchArcgis(feed, this.fetchImpl, { headers: opts.headers, retry: this.retry }), feed);
    } else {
      throw new Error(`Unknown camera feed type "${feed.type}"`);
    }
    return cams.map((c) => ({ ...c, id: `${feed.id}:${c.id}`, feed: feed.id, feedName: feed.name || feed.id, region: feed.region || null }));
  }

  cacheFile(feed) {
    return this.cacheDir && path.join(this.cacheDir, `${String(feed.id).replace(/[^\w-]/g, '_')}.json`);
  }

  saved(feed) {
    if (this.lastGood.has(feed.id)) return this.lastGood.get(feed.id);
    const file = this.cacheFile(feed);
    try {
      const data = file && JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data?.cameras)) {
        this.lastGood.set(feed.id, data);
        return data;
      }
    } catch { /* nothing saved yet */ }
    return null;
  }

  remember(feed, cameras) {
    const entry = { cameras, at: new Date().toISOString() };
    this.lastGood.set(feed.id, entry);
    const file = this.cacheFile(feed);
    if (!file || feed.type === 'static') return;
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(entry));
      fs.renameSync(`${file}.tmp`, file);
    } catch (err) {
      console.error(`[cameras] could not save ${feed.id} cache: ${err.message}`);
    }
  }

  // Resolves to { cameras, stale, error, savedAt }. Only rejects when there is
  // nothing saved to fall back on.
  async loadFeed(feed) {
    const ttl = (feed.refreshMinutes || 15) * 60_000;
    return this.cache.wrap(`cams:${feed.id}`, ttl, async () => {
      const fail = this.failures.get(feed.id);
      const fallback = (error) => {
        const saved = this.saved(feed);
        if (!saved) throw Object.assign(new Error(error), { feedError: true });
        return { cameras: saved.cameras, stale: true, error, savedAt: saved.at };
      };
      if (fail && fail.until > Date.now()) return fallback(fail.error);
      try {
        const cameras = await this.fetchFeed(feed);
        this.failures.delete(feed.id);
        this.remember(feed, cameras);
        return { cameras, stale: false };
      } catch (err) {
        const count = (fail?.count || 0) + 1;
        const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (count - 1));
        this.failures.set(feed.id, { count, until: Date.now() + wait, error: err.message });
        console.warn(`[cameras] ${feed.id} failed (${err.message}); retrying in ${Math.round(wait / 60_000)} min`);
        // Don't let the cache hold a failure for the feed's full refresh time.
        setTimeout(() => this.cache.map.delete(`cams:${feed.id}`), wait).unref?.();
        return fallback(err.message);
      }
    });
  }

  async all() {
    const feeds = this.feeds().filter((f) => f.enabled !== false);
    const results = await Promise.allSettled(feeds.map((f) => this.loadFeed(f)));
    const cameras = [];
    const status = [];
    results.forEach((r, i) => {
      const f = feeds[i];
      const name = f.name || f.id;
      const region = f.region || null;
      if (r.status === 'fulfilled') {
        cameras.push(...r.value.cameras);
        status.push({ id: f.id, name, region, ok: !r.value.stale, stale: r.value.stale, count: r.value.cameras.length, ...(r.value.stale ? { error: r.value.error, savedAt: r.value.savedAt } : {}) });
      } else {
        status.push({ id: f.id, name, region, ok: false, error: r.reason?.message || 'failed' });
      }
    });
    return { cameras, feeds: status };
  }

  // `hide` is a list of feed ids the viewer switched off in the map's layer panel.
  async inBounds({ south, west, north, east, hide = [] }, limit = 400) {
    const { cameras, feeds } = await this.all();
    const off = new Set(hide);
    const inside = cameras.filter((c) => !off.has(c.feed) && c.lat >= south && c.lat <= north && c.lon >= west && c.lon <= east);
    // Snapshot URLs stay on the server (they go through the image proxy). Live video and
    // embedded players are only passed on when they are https, so they work on an https site.
    return {
      cameras: inside.slice(0, limit).map(({ image, video, embed, ...c }) => ({
        ...c,
        hasImage: !!image,
        video: isHttps(video) ? video : null,
        embed: isHttps(embed) ? embed : null,
      })),
      total: inside.length,
      truncated: inside.length > limit,
      feeds,
    };
  }

  async findById(id) {
    const { cameras } = await this.all();
    return cameras.find((c) => c.id === id) || null;
  }
}
