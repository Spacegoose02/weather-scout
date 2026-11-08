// The on/off layers of the Radar & Cams map, shared by the server (the admin's
// "Layers on by default" setting) and the web app (the Layers panel).
// Saved as a comma-separated list of the layers that start on, e.g.
// "radar,warnings,cams". Blank means the built-in defaults; "none" means all off.
export const MAP_LAYER_IDS = [
  'radar', 'satellite', 'lightning', 'cells', 'ptype', 'storms',
  'warnings', 'watches', 'advisories',
  'reports', 'fires', 'gauges', 'smoke', 'sensors',
  'buoys', 'tides',
  'radarSites',
  'cams', 'webcams',
];
const KNOWN = new Set(MAP_LAYER_IDS);

// "radar, Cams ,radar" -> ['radar', 'cams']. Blank -> null (built-in defaults).
// Unknown ids are dropped here; validLayerList() is the strict check for saving.
export function parseLayerList(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (s.toLowerCase() === 'none') return [];
  const byLower = new Map(MAP_LAYER_IDS.map((id) => [id.toLowerCase(), id]));
  return [...new Set(s.split(/[\s,]+/).map((x) => byLower.get(x.toLowerCase())).filter(Boolean))];
}

export function validLayerList(text) {
  const s = String(text ?? '').trim();
  if (!s || s.toLowerCase() === 'none') return true;
  const lower = new Set(MAP_LAYER_IDS.map((id) => id.toLowerCase()));
  return s.split(/[\s,]+/).filter(Boolean).every((x) => lower.has(x.toLowerCase()));
}

// The other way round, for the admin form: ['radar'] -> 'radar', [] -> 'none'.
export const layerListText = (ids) => (ids.length ? MAP_LAYER_IDS.filter((id) => ids.includes(id)).join(',') : 'none');
export const isLayerId = (id) => KNOWN.has(id);
