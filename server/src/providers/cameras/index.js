// Traffic / weather cameras from state DOT 511 systems and your own cameras.
// Feeds are configured in /data/cameras.json (see cameras.example.json). API keys
// are referenced by environment variable name so they never live in a file that
// could be committed or shared.
import fs from 'node:fs';
import { fetchJson } from '../../cache.js';

// Built-in feeds used when no cameras.json exists. All are public, no key:
//  - 511 Virginia: GeoJSON with a snapshot PNG and an HTTPS HLS stream per camera
//  - Maryland CHART (MD iMAP ArcGIS layer): live video player page per camera
//  - Kentucky (KYTC ArcGIS layer): snapshot JPG per camera
export const DEFAULT_FEEDS = [
  {
    id: 'va',
    name: '511 Virginia (VDOT)',
    region: 'VA',
    type: 'geojson',
    url: 'https://511.vdot.virginia.gov/services/511/map/layers/map/cams',
    fields: { id: 'id', name: 'description', image: 'image_url', video: 'https_url', road: 'route', direction: 'direction', active: 'active' },
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
];

export function defaultFeeds(setting = '') {
  const v = String(setting).trim().toLowerCase();
  if (/^(0|false|no|off|none)$/.test(v)) return [];
  if (!v || /^(1|true|yes|on|all)$/.test(v)) return DEFAULT_FEEDS;
  const wanted = new Set(v.split(/[\s,]+/));
  return DEFAULT_FEEDS.filter((f) => wanted.has(f.id));
}

const get = (obj, path) => (path ? String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj) : undefined);

function feedKey(feed, env) {
  if (feed.keyEnv) return env[feed.keyEnv] || '';
  return '';
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
        name: c.Name || c.Location || c.RoadwayName || 'Camera',
        road: c.RoadwayName || null,
        direction: c.DirectionOfTravel || null,
        lat: Number(c.Latitude),
        lon: Number(c.Longitude),
        image: image || null,
        video: (views ? views[0]?.VideoUrl : c.VideoUrl) || null,
        disabled: !!(c.Disabled || c.Blocked),
      };
    })
    .filter((c) => !c.disabled && c.image && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

// Generic GeoJSON FeatureCollection with configurable property names. Works for
// ArcGIS "f=geojson" layers and most open-data portals (including 511 Virginia).
export function parseGeoJson(raw, feed) {
  const f = feed.fields || {};
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return features
    .map((feat, i) => {
      const p = feat.properties || {};
      const [lon, lat] = feat.geometry?.coordinates || [];
      if (f.active && get(p, f.active) === false) return null;
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
    .filter((c) => c && (c.image || isHttps(c.embed)) && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');

// ArcGIS MapServer/FeatureServer layers cap results per request, so page through.
async function fetchArcgis(feed, fetchImpl) {
  const pageSize = feed.pageSize || 500;
  const all = [];
  for (let page = 0; page < 40; page++) {
    const u = new URL(`${feed.url.replace(/\/$/, '')}/query`);
    u.search = new URLSearchParams({
      where: feed.where || '1=1', outFields: '*', outSR: '4326', f: 'geojson',
      resultOffset: String(page * pageSize), resultRecordCount: String(pageSize),
    }).toString();
    const raw = await fetchJson(u.toString(), { source: feed.id, fetchImpl, timeoutMs: 20000 });
    const features = Array.isArray(raw?.features) ? raw.features : [];
    all.push(...features);
    const more = raw?.exceededTransferLimit ?? raw?.properties?.exceededTransferLimit;
    if (!more || !features.length) break;
  }
  return { type: 'FeatureCollection', features: all };
}

export function parseStatic(feed) {
  return (feed.cameras || [])
    .map((c, i) => ({ id: String(c.id ?? i), name: c.name || 'Camera', lat: Number(c.lat), lon: Number(c.lon), image: c.image, video: c.video || null, road: c.road || null }))
    .filter((c) => c.image && Number.isFinite(c.lat) && Number.isFinite(c.lon));
}

export class CameraService {
  constructor(cfg, cache, fetchImpl = fetch) {
    this.cfg = cfg;
    this.cache = cache;
    this.fetchImpl = fetchImpl;
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
    return defaultFeeds(env.CAMERAS_DEFAULT_FEEDS);
  }

  async loadFeed(feed) {
    const env = this.cfg.env;
    const ttl = (feed.refreshMinutes || 15) * 60_000;
    return this.cache.wrap(`cams:${feed.id}`, ttl, async () => {
      let cams = [];
      if (feed.type === 'static') {
        cams = parseStatic(feed);
      } else if (feed.type === 'ibi511') {
        const key = feedKey(feed, env);
        const path = feed.apiVersion === 2 ? '/api/v2/get/cameras' : '/api/getcameras';
        const url = `${feed.baseUrl.replace(/\/$/, '')}${path}?key=${encodeURIComponent(key)}&format=json`;
        cams = parseIbi511(await fetchJson(url, { source: feed.id, fetchImpl: this.fetchImpl, timeoutMs: 20000 }), feed);
      } else if (feed.type === 'geojson') {
        const url = new URL(feed.url);
        const key = feedKey(feed, env);
        const headers = {};
        if (key && feed.keyParam) url.searchParams.set(feed.keyParam, key);
        if (key && feed.keyHeader) headers[feed.keyHeader] = key;
        cams = parseGeoJson(await fetchJson(url.toString(), { source: feed.id, headers, fetchImpl: this.fetchImpl, timeoutMs: 20000 }), feed);
      } else if (feed.type === 'arcgis') {
        cams = parseGeoJson(await fetchArcgis(feed, this.fetchImpl), feed);
      } else {
        throw new Error(`Unknown camera feed type "${feed.type}"`);
      }
      return cams.map((c) => ({ ...c, id: `${feed.id}:${c.id}`, feed: feed.id, feedName: feed.name || feed.id, region: feed.region || null }));
    });
  }

  async all() {
    const feeds = this.feeds().filter((f) => f.enabled !== false);
    const results = await Promise.allSettled(feeds.map((f) => this.loadFeed(f)));
    const cameras = [];
    const status = [];
    results.forEach((r, i) => {
      const f = feeds[i];
      if (r.status === 'fulfilled') {
        cameras.push(...r.value);
        status.push({ id: f.id, name: f.name || f.id, ok: true, count: r.value.length });
      } else {
        status.push({ id: f.id, name: f.name || f.id, ok: false, error: r.reason?.message || 'failed' });
      }
    });
    return { cameras, feeds: status };
  }

  async inBounds({ south, west, north, east }, limit = 400) {
    const { cameras, feeds } = await this.all();
    const inside = cameras.filter((c) => c.lat >= south && c.lat <= north && c.lon >= west && c.lon <= east);
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
