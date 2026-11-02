// Traffic / weather cameras from state DOT 511 systems and your own cameras.
// Feeds are configured in /data/cameras.json (see cameras.example.json). API keys
// are referenced by environment variable name so they never live in a file that
// could be committed or shared.
import fs from 'node:fs';
import { fetchJson } from '../../cache.js';

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
// ArcGIS "f=geojson" layers and most open-data portals (including VDOT SmarterRoads exports).
export function parseGeoJson(raw, feed) {
  const f = feed.fields || {};
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return features
    .map((feat, i) => {
      const p = feat.properties || {};
      const [lon, lat] = feat.geometry?.coordinates || [];
      return {
        id: String(get(p, f.id || 'id') ?? feat.id ?? i),
        name: get(p, f.name || 'name') || 'Camera',
        road: get(p, f.road) || null,
        direction: get(p, f.direction) || null,
        lat: Number(lat),
        lon: Number(lon),
        image: get(p, f.image || 'image_url') || null,
        video: get(p, f.video) || null,
      };
    })
    .filter((c) => c.image && Number.isFinite(c.lat) && Number.isFinite(c.lon));
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
    }
    return [];
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
    // Browsers and the image proxy never get the raw upstream URL list beyond what is visible.
    return {
      cameras: inside.slice(0, limit).map(({ image, video, ...c }) => ({ ...c, hasVideo: !!video, video })),
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
