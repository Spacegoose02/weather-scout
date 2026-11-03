// The lightning map layer: every strike from the last 30 minutes as a dot that
// starts white-hot and fades through yellow and orange to red. The newest few
// also get a little ⚡ that pops, so kids can see where it is striking now.
// It is an ordinary Leaflet layer, so any layer switcher can add or remove it.
import L from 'leaflet';
import { strikeStyle } from '../../../shared/lightning.js';

const MAX_BOLTS = 25;
const boltIcon = L.divIcon({ className: 'bolt-pin', html: '<span>⚡</span>', iconSize: [22, 22], iconAnchor: [11, 11] });

export const LightningLayer = L.LayerGroup.extend({
  initialize(options) {
    L.LayerGroup.prototype.initialize.call(this, [], options);
    this._renderer = L.canvas({ padding: 0.3 });
    this._strikes = [];
  },

  setStrikes(list, now = Date.now()) {
    this._strikes = list;
    this.restyle(now);
    return this;
  },

  // Redraw with current ages (called on a timer so strikes keep fading).
  restyle(now = Date.now()) {
    this.clearLayers();
    let bolts = 0;
    // Oldest first, so fresh strikes are drawn on top.
    for (let i = this._strikes.length - 1; i >= 0; i--) {
      const s = this._strikes[i];
      const ageMin = (now - s.t) / 60_000;
      const st = strikeStyle(ageMin);
      if (!st) continue;
      L.circleMarker([s.lat, s.lon], {
        renderer: this._renderer, radius: st.radius, color: st.ring, weight: 1, fillColor: st.color, fillOpacity: st.opacity, opacity: st.opacity, interactive: false,
      }).addTo(this);
    }
    for (const s of this._strikes) {
      if (bolts >= MAX_BOLTS || now - s.t > 2 * 60_000) break;
      L.marker([s.lat, s.lon], { icon: boltIcon, interactive: false, keyboard: false }).addTo(this);
      bolts += 1;
    }
    return this;
  },

  count() {
    return this._strikes.length;
  },
});

export const lightningLayer = (options) => new LightningLayer(options);
