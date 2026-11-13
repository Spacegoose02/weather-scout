import L from 'leaflet';
import { fillLayer, nexradLayer, isN0q } from './radarFill.js';

/**
 * The layers for a radar loop: one per frame, plus the Canada/Mexico fill
 * paired with each frame. The frame shown first loads first; the rest of the
 * loop starts downloading once it is in (or after a few seconds), so the map
 * isn't waiting behind ten other frames' tiles.
 * Returns { radar, fill: { layers, byFrame }, remove }.
 */
export function radarLoop(m, list, meta = {}, { first = list.length - 1, idle = {}, withFill = true } = {}) {
  const radar = list.map((f, i) => (isN0q(f.url)
    ? nexradLayer(f.url, { ...idle, opacity: 0, className: 'radar-tiles', maxZoom: 18, zIndex: 10, attribution: i === 0 ? meta.attribution : '' })
    : L.tileLayer(f.url, { ...idle, opacity: 0, className: 'radar-tiles', maxNativeZoom: meta.maxNativeZoom || 12, maxZoom: 18, zIndex: 10, attribution: i === 0 ? meta.attribution : '' })));
  // Canada and Mexico, cut out where a US radar sees well and blended in past that.
  const made = new Map();
  const byFrame = list.map((f) => {
    if (!withFill || !f.fill || !meta.fill) return null;
    if (!made.has(f.fill)) {
      // Just over the US loop: past the US radars' range it has the fuller picture.
      made.set(f.fill, fillLayer(f.fill, { ...idle, opacity: 0, className: 'radar-tiles', maxNativeZoom: meta.fill.maxNativeZoom, maxZoom: 18, zIndex: 11, sites: meta.fill.sites, attribution: made.size === 0 ? meta.fill.attribution : '' }));
    }
    return made.get(f.fill);
  });
  const fills = [...made.values()];

  let removed = false;
  let timer;
  const lead = radar[first];
  const leadFill = byFrame[first];
  const rest = () => {
    clearTimeout(timer);
    if (removed) return;
    radar.forEach((l) => l !== lead && l.addTo(m));
    fills.forEach((l) => l !== leadFill && l.addTo(m));
  };
  if (lead) {
    lead.once('load', rest);
    lead.addTo(m);
    leadFill?.addTo(m);
    timer = setTimeout(rest, 4000);
  } else rest();

  return {
    radar,
    fill: { layers: fills, byFrame },
    remove() {
      removed = true;
      clearTimeout(timer);
      radar.forEach((l) => l.remove());
      fills.forEach((l) => l.remove());
    },
  };
}
