// SPC convective outlook helpers shared by the server (Junior Storm Chaser) and
// the web app (the grown-ups' Severe storm outlook card).

// The categorical risk levels, lowest to highest.
export const CAT_ORDER = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];
export const CAT_NAME = {
  NONE: 'No severe risk', TSTM: 'General thunder', MRGL: 'Marginal', SLGT: 'Slight', ENH: 'Enhanced', MDT: 'Moderate', HIGH: 'High',
};
export const catLevel = (label) => Math.max(0, CAT_ORDER.indexOf(label));
const rank = (label) => CAT_ORDER.indexOf(label);

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Point in a GeoJSON Polygon or MultiPolygon (holes respected).
export function inGeometry(geom, lat, lon) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((rings) => rings.length && inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)));
}

// The highest risk drawn anywhere, and the highest risk over one spot (when given).
export function outlookSummary(outlook, home) {
  let top = 'NONE';
  let here = 'NONE';
  for (const f of outlook?.features || []) {
    const label = f.properties?.label || f.properties?.LABEL;
    if (rank(label) < 0 || !f.geometry) continue;
    if (rank(label) > rank(top)) top = label;
    if (home && rank(label) > rank(here) && inGeometry(f.geometry, home.lat, home.lon)) here = label;
  }
  return { top, here: home ? here : null };
}
