// Which marker groups and overlays the Radar & Cams map shows. The choice is
// saved in preferences (your account when signed in, this device for guests).
// Until someone picks their own, the map starts from the admin's "Layers on by
// default" (App settings, Windy maps & webcams), or DEFAULT_LAYERS when unset.
import { MAP_LAYER_IDS } from '../../../../shared/maplayers.js';

export const LAYER_GROUPS = [
  {
    title: 'Weather',
    layers: [
      { id: 'radar', icon: '🌧️', label: 'Radar' },
      { id: 'satellite', icon: '🛰️', label: 'Satellite clouds' },
      { id: 'lightning', icon: '⚡', label: 'Lightning', note: 'Strikes from the last 30 minutes' },
      { id: 'cells', icon: '⛈️', label: 'Storm tracks', note: 'Where each storm on the radar is heading in the next hour' },
      { id: 'ptype', icon: '🌨️', label: 'Rain, snow & ice', note: 'Tints where it is raining, snowing, mixing or freezing (model estimate)' },
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
    title: 'Hazards & reports',
    layers: [
      { id: 'reports', icon: '📣', label: 'Weather reports', note: 'Family reports and NWS storm reports, last 24 hours' },
      { id: 'fires', icon: '🔥', label: 'Wildfires', note: 'Active wildfires (NIFC)' },
      { id: 'gauges', icon: '📏', label: 'River gauges', note: 'Colored by flood stage. Zoom in to see them' },
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
  lightning: true,
  cells: true,
  ptype: false,
  storms: true,
  warnings: true,
  watches: true,
  advisories: true,
  buoys: true,
  reports: true,
  fires: true,
  gauges: false,
  tides: false,
  radarSites: true,
  cams: true,
  webcams: true, // Windy webcams; only shown when the server has a Webcams key
  camsOff: [], // camera feed ids (one per state, mostly) that are switched off
};

const BOOL_KEYS = Object.keys(DEFAULT_LAYERS).filter((k) => typeof DEFAULT_LAYERS[k] === 'boolean');
export { BOOL_KEYS as LAYER_KEYS };

// The admin's default ['radar', 'cams', ...] as a full layers object. null or
// not a list = the built-in defaults.
export function layerDefaults(onIds) {
  if (!Array.isArray(onIds)) return DEFAULT_LAYERS;
  const on = new Set(onIds);
  return { ...Object.fromEntries(BOOL_KEYS.map((k) => [k, on.has(k)])), camsOff: [] };
}

// Saved preferences may be missing, from an older version, or hand-edited.
// base: where anything not saved starts (the admin default, see layerDefaults).
export function normalizeLayers(saved, base = DEFAULT_LAYERS) {
  const out = { ...DEFAULT_LAYERS, ...base, camsOff: [] };
  if (!saved || typeof saved !== 'object') return out;
  for (const k of BOOL_KEYS) if (typeof saved[k] === 'boolean') out[k] = saved[k];
  if (Array.isArray(saved.camsOff)) out.camsOff = [...new Set(saved.camsOff.filter((x) => typeof x === 'string' && x))].slice(0, 100);
  return out;
}

export const isDefault = (layers, base = DEFAULT_LAYERS) => JSON.stringify(normalizeLayers(layers, base)) === JSON.stringify(normalizeLayers(base));

// The shared id list (used by the server to check the admin setting) must match.
export const layerIdsMatch = () => JSON.stringify([...BOOL_KEYS].sort()) === JSON.stringify([...MAP_LAYER_IDS].sort());

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

// How many groups are on, for the button badge. Cameras count once. Layers this
// server can't show (Windy webcams without a key) don't count.
export function layerCount(layers, { webcams = false } = {}) {
  return BOOL_KEYS.filter((k) => layers[k] && (k !== 'webcams' || webcams)).length;
}

// Distance for the near-me list, in the family's units.
export function distanceText(km, units = 'imperial') {
  if (km == null) return '';
  if (units === 'metric') return km < 1 ? 'under 1 km' : `${Math.round(km)} km`;
  const mi = km / 1.609344;
  return mi < 1 ? 'under 1 mile' : `${Math.round(mi)} mile${Math.round(mi) === 1 ? '' : 's'}`;
}
