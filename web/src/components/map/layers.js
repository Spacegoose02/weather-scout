// Which marker groups and overlays the Radar & Cams map shows. The choice is
// saved in preferences (your account when signed in, this device for guests).

export const LAYER_GROUPS = [
  {
    title: 'Weather',
    layers: [
      { id: 'radar', icon: '🌧️', label: 'Radar' },
      { id: 'satellite', icon: '🛰️', label: 'Satellite clouds' },
      { id: 'storms', icon: '🌀', label: 'Hurricanes & tropical storms' },
    ],
  },
  {
    title: 'Warnings & alerts',
    layers: [
      { id: 'warnings', icon: '🟥', label: 'Warnings', note: 'Act now: tornado, flood, severe storm' },
      { id: 'watches', icon: '🟧', label: 'Watches', note: 'Be ready: storms could form' },
      { id: 'advisories', icon: '🟨', label: 'Advisories & statements' },
    ],
  },
  {
    title: 'Ocean',
    layers: [
      { id: 'buoys', icon: '🛟', label: 'NOAA buoys', note: 'Waves and water temperature' },
      { id: 'tides', icon: '🌊', label: 'Tide stations', note: 'Zoom in to see them' },
    ],
  },
  {
    title: 'Radar sites',
    layers: [{ id: 'radarSites', icon: '📡', label: 'Radar site pins', note: 'Shown when the map is set to one radar' }],
  },
];

export const DEFAULT_LAYERS = {
  radar: true,
  satellite: false,
  storms: true,
  warnings: true,
  watches: true,
  advisories: true,
  buoys: true,
  tides: false,
  radarSites: true,
  cams: true,
  camsOff: [], // camera feed ids (one per state, mostly) that are switched off
};

const BOOL_KEYS = Object.keys(DEFAULT_LAYERS).filter((k) => typeof DEFAULT_LAYERS[k] === 'boolean');

// Saved preferences may be missing, from an older version, or hand-edited.
export function normalizeLayers(saved) {
  const out = { ...DEFAULT_LAYERS, camsOff: [] };
  if (!saved || typeof saved !== 'object') return out;
  for (const k of BOOL_KEYS) if (typeof saved[k] === 'boolean') out[k] = saved[k];
  if (Array.isArray(saved.camsOff)) out.camsOff = [...new Set(saved.camsOff.filter((x) => typeof x === 'string' && x))].slice(0, 100);
  return out;
}

export const isDefault = (layers) => JSON.stringify(normalizeLayers(layers)) === JSON.stringify(DEFAULT_LAYERS);

// Same split the server uses for its warning / watch / advisory counts.
export function alertKind(event = '') {
  if (/warning|emergency/i.test(event)) return 'warnings';
  if (/watch/i.test(event)) return 'watches';
  return 'advisories';
}

export const alertVisible = (layers, event) => !!layers[alertKind(event)];
export const anyAlerts = (layers) => layers.warnings || layers.watches || layers.advisories;

// Camera feeds sorted for the panel, labeled by state code when the feed has one.
export function cameraFeedRows(feeds = [], camsOff = []) {
  const off = new Set(camsOff);
  return feeds
    .map((f) => ({ id: f.id, label: f.region || f.name || f.id, name: f.name || f.id, count: f.count || 0, ok: f.ok !== false, on: !off.has(f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const toggleFeed = (camsOff, id, on) => (on ? camsOff.filter((x) => x !== id) : [...new Set([...camsOff, id])]);

// How many groups are on, for the button badge. Cameras count once.
export function layerCount(layers) {
  return BOOL_KEYS.filter((k) => layers[k]).length;
}
