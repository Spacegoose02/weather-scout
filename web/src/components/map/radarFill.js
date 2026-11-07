import L from 'leaflet';
import { NEXRAD_EXTENT, maskRect } from '../../../../shared/radarcoverage.js';

// A radar tile layer with the NEXRAD box cut out of it, for Canada and Mexico:
// inside the box the US mosaic shows instead, so the two never stack up.
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
    const cut = maskRect(coords, this.options.mask, size.x);
    if (cut?.full) {
      setTimeout(() => done(null, tile), 0);
      return tile;
    }
    const img = new Image();
    img.onload = () => {
      const ctx = tile.getContext('2d');
      ctx.drawImage(img, 0, 0, size.x, size.y);
      if (cut) ctx.clearRect(cut.x, cut.y, cut.w, cut.h);
      done(null, tile);
    };
    img.onerror = () => done(null, tile); // no data: leave it blank
    img.src = L.Util.template(this._url, coords);
    return tile;
  },
});

export const fillLayer = (url, options = {}) => new Masked(url, { mask: NEXRAD_EXTENT, ...options });
