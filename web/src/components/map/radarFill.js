import L from 'leaflet';
import { NEXRAD_EXTENT, maskRect, nexradReach } from '../../../../shared/radarcoverage.js';
import { decodeN0q, decodeUb, despeckle, upsample, paint } from './radarPixels.js';

// The radar map's two reflectivity layers, drawn the same way so North America
// looks like one map: the US NEXRAD mosaic (IEM) and the Canada/Mexico layer
// (RainViewer). Each tile is read back to dBZ, cleaned, smoothed past the
// source's real detail and painted in the NWS colours (see radarPixels.js).
//
// The Canada/Mexico layer is cut out only where a US radar is close enough to
// see well (with a soft edge), so the two meet in a blend, not at a line.

// The sources let pages read their pixels. If one ever stops, show its tiles
// as plain pictures rather than none at all.
const readable = new Map();

// Decoded source tiles, shared by every zoom drawn from them. Each is 64 KB.
const cache = new Map();
const CACHE_MAX = 240;

function source(url, decode, clean) {
  let p = cache.get(url);
  if (p) {
    cache.delete(url);
    cache.set(url, p); // most recently used last
    return p;
  }
  const host = url.split('/')[2];
  const load = (cors) => new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cors) return resolve({ img });
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 256;
        c.height = img.naturalHeight || 256;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let codes = decode(px);
        if (clean) codes = clean(codes, c.width, c.height);
        resolve({ codes, size: c.width });
      } catch {
        readable.set(host, false);
        resolve({ img });
      }
    };
    img.onerror = () => {
      // Maybe it can't be read across sites: try once more as a plain picture.
      if (cors) { readable.set(host, false); load(false).then(resolve); } else resolve(null);
    };
    img.src = url;
  });
  p = load(readable.get(host) !== false);
  p.then((r) => { if (!r) cache.delete(url); }); // don't keep a failed download
  cache.set(url, p);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return p;
}

const DbzLayer = L.GridLayer.extend({
  initialize(url, options) {
    this._url = url;
    L.GridLayer.prototype.initialize.call(this, options);
  },
  createTile(coords, done) {
    const size = this.getTileSize().x;
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const { mask, sites, dataZoom, decode, clean } = this.options;
    const cut = mask ? maskRect(coords, mask, size) : null;
    const reach = cut && sites?.length ? nexradReach(coords, sites, mask, size) : null;
    // Wholly inside the US radars' view: nothing of ours would show, so skip the download.
    if (cut && (reach ? reach.covered : cut.full)) {
      setTimeout(() => done(null, tile), 0);
      return tile;
    }
    // Past the source's real detail, draw from its last real zoom.
    const k = Math.max(0, coords.z - dataZoom);
    const src = { x: coords.x >> k, y: coords.y >> k, z: coords.z - k };
    const scale = 2 ** k;
    source(L.Util.template(this._url, src), decode, clean).then((r) => {
      if (!r) return done(null, tile);
      const ctx = tile.getContext('2d');
      const span = size / scale;
      const sx = (coords.x - src.x * scale) * span;
      const sy = (coords.y - src.y * scale) * span;
      if (r.codes) {
        const codes = k ? upsample(r.codes, r.size, sx * (r.size / size), sy * (r.size / size), span * (r.size / size)) : r.codes;
        const img = ctx.createImageData(size, size);
        paint(codes, img.data);
        ctx.putImageData(img, 0, 0);
      } else {
        const n = r.img.naturalWidth || size;
        ctx.drawImage(r.img, sx * (n / size), sy * (n / size), span * (n / size), span * (n / size), 0, 0, size, size);
      }
      if (reach) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cut.x, cut.y, cut.w, cut.h);
        ctx.clip();
        ctx.globalCompositeOperation = 'destination-out';
        for (const c of reach.circles) {
          const g = ctx.createRadialGradient(c.x, c.y, c.near, c.x, c.y, c.far);
          g.addColorStop(0, 'rgba(0,0,0,1)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.far, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (cut) ctx.clearRect(cut.x, cut.y, cut.w, cut.h);
      done(null, tile);
    });
    return tile;
  },
});

/** Canada/Mexico (RainViewer, real detail to zoom 7). */
export const fillLayer = (url, { maxNativeZoom = 7, ...options } = {}) => new DbzLayer(url, {
  mask: NEXRAD_EXTENT, decode: decodeUb, dataZoom: maxNativeZoom, ...options,
});

/** The US NEXRAD mosaic (IEM n0q, about 500 m pixels, so real detail to zoom 8). */
export const nexradLayer = (url, options = {}) => new DbzLayer(url, {
  mask: null, decode: decodeN0q, clean: despeckle, dataZoom: 8, ...options,
});

/** IEM n0q mosaic tiles are the ones we can read back to dBZ. */
export const isN0q = (url) => /\/nexrad-n0q-900913(-m\d\dm)?\//.test(url || '');
