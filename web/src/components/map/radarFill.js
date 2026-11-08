import L from 'leaflet';
import { NEXRAD_EXTENT, maskRect, nexradReach } from '../../../../shared/radarcoverage.js';
import { recolorPixels } from './radarColors.js';

// The Canada/Mexico radar layer (RainViewer). It used to be cut out along the
// NEXRAD box's straight edge, which left a hard line through Maine and the
// Maritimes where the US radars can't see that far. Now it's cut out only where
// a US radar is close enough to see well (with a soft edge), so the two meet in
// a blend, and it's repainted in the same NWS colours as the US mosaic.

// RainViewer lets pages read its tile pixels (needed to repaint them). If that
// ever stops, show its tiles in their own colours rather than none at all.
let canRead = true;

const Masked = L.GridLayer.extend({
  initialize(url, options) {
    this._url = url;
    L.GridLayer.prototype.initialize.call(this, options);
  },
  createTile(coords, done) {
    const size = this.getTileSize();
    const tile = document.createElement('canvas');
    tile.width = size.x;
    tile.height = size.y;
    const { mask, sites } = this.options;
    const cut = maskRect(coords, mask, size.x);
    const reach = cut && sites?.length ? nexradReach(coords, sites, mask, size.x) : null;
    // Wholly inside the US radars' view: nothing of ours would show, so skip the download.
    if (cut && (reach ? reach.covered : cut.full)) {
      setTimeout(() => done(null, tile), 0);
      return tile;
    }
    const load = (cors) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ctx = tile.getContext('2d');
        ctx.drawImage(img, 0, 0, size.x, size.y);
        if (cors) {
          try {
            const px = ctx.getImageData(0, 0, size.x, size.y);
            recolorPixels(px.data);
            ctx.putImageData(px, 0, 0);
          } catch { canRead = false; }
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
      };
      img.onerror = () => {
        // Maybe the tile can't be read across sites: try once more as a plain picture.
        if (cors) { canRead = false; load(false); } else done(null, tile); // no data: leave it blank
      };
      img.src = L.Util.template(this._url, coords);
    };
    load(canRead);
    return tile;
  },
});

export const fillLayer = (url, options = {}) => new Masked(url, { mask: NEXRAD_EXTENT, ...options });
