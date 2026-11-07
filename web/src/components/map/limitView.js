import L from 'leaflet';
import { RADAR_VIEW, inView } from '../../../../shared/radarcoverage.js';

export { inView };

// Keep the map on North America: no panning off to empty oceans, and no
// zooming out past the point where the covered area fills the screen.
export const viewBounds = (v = RADAR_VIEW) => L.latLngBounds([v.south, v.west], [v.north, v.east]);

// `whole` lets the whole box fit on screen (a thin margin may show) rather than
// filling the screen with part of it; for small boxes like one model's grid.
export function limitToCoverage(m, view = RADAR_VIEW, { whole = false } = {}) {
  const b = viewBounds(view);
  m.options.maxBoundsViscosity = 1;
  m.setMaxBounds(b);
  const fit = () => {
    const size = m.getSize();
    if (!size.x || !size.y) return;
    m.setMinZoom(Math.max(2, m.getBoundsZoom(b, !whole)));
  };
  fit();
  m.on('resize', fit);
  return () => {
    m.off('resize', fit);
    if (!m._mapPane) return; // the map is already gone
    m.setMaxBounds(null);
    m.setMinZoom(0);
  };
}
