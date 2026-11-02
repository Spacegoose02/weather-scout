// Windy layers, models and URLs, shared by the server (Map Forecast API page)
// and the web app (free embed). Plain data and pure functions, no DOM.

// Map layers. `kid` is the one-line explanation shown under the picker.
export const WINDY_OVERLAYS = [
  { id: 'wind', name: 'Wind', emoji: '💨', kid: 'The moving lines are the air itself. Faster lines mean stronger wind.' },
  { id: 'gust', name: 'Gusts', emoji: '🌬️', kid: 'Gusts are quick bursts of extra-strong wind, the kind that grabs your hat.' },
  { id: 'rain', name: 'Rain & thunder', emoji: '🌧️', kid: 'Where rain, snow and storms are expected. Brighter colors mean more.' },
  { id: 'temp', name: 'Temperature', emoji: '🌡️', kid: 'Warm air is red and orange, cold air is blue and purple.' },
  { id: 'clouds', name: 'Clouds', emoji: '☁️', kid: 'White areas are covered by clouds. Clear sky is dark.' },
  { id: 'pressure', name: 'Pressure', emoji: '🧭', kid: 'Air pressure. Low pressure (L) often brings storms, high pressure (H) brings calm.' },
  { id: 'rh', name: 'Humidity', emoji: '💧', kid: 'How much water vapor is in the air. Very humid air feels sticky.' },
  { id: 'cape', name: 'Storm energy', emoji: '⚡', kid: 'CAPE: the fuel for thunderstorms. Hot colors mean storms could grow tall.' },
  { id: 'waves', name: 'Waves', emoji: '🌊', kid: 'How tall the ocean waves are. Great for beach and boat days.' },
  { id: 'snowAccu', name: 'New snow', emoji: '❄️', kid: 'How much new snow could pile up.' },
];

// Forecast models. Windy's free embed shows ECMWF, GFS and ICON; the Map
// Forecast API shows whichever models the key's plan includes.
export const WINDY_MODELS = [
  { id: 'ecmwf', name: 'ECMWF', note: 'European model, usually the most accurate worldwide' },
  { id: 'gfs', name: 'GFS', note: 'American global model from NOAA' },
  { id: 'icon', name: 'ICON', note: 'German global model from DWD' },
];

// Heights in the sky. Surface is where we live; 850 hPa is about 5,000 ft.
export const WINDY_LEVELS = [
  { id: 'surface', name: 'Ground' },
  { id: '850h', name: '5,000 ft' },
  { id: '500h', name: '18,000 ft' },
  { id: '250h', name: '34,000 ft (jet stream)' },
];

const pick = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);
const clamp = (n, lo, hi, d) => (Number.isFinite(Number(n)) && n !== '' && n !== null ? Math.min(hi, Math.max(lo, Number(n))) : d);

// Normalize anything that came from a query string or the UI.
export function windyView({ lat, lon, zoom, overlay, product, level } = {}) {
  return {
    lat: Math.round(clamp(lat, -85, 85, 37.54) * 1e4) / 1e4,
    lon: Math.round(clamp(lon, -180, 180, -77.44) * 1e4) / 1e4,
    zoom: Math.round(clamp(zoom, 3, 11, 6)),
    overlay: pick(WINDY_OVERLAYS, overlay, 'wind'),
    product: pick(WINDY_MODELS, product, 'ecmwf'),
    level: pick(WINDY_LEVELS, level, 'surface'),
  };
}

// The free Windy embed (no key). Shows a forecast picker for the center point.
export function windyEmbedUrl(view, units = 'imperial') {
  const v = windyView(view);
  const metric = units === 'metric';
  const q = new URLSearchParams({
    type: 'map', location: 'coordinates',
    metricRain: metric ? 'mm' : 'in', metricTemp: metric ? '°C' : '°F', metricWind: metric ? 'km/h' : 'mph',
    zoom: String(v.zoom), overlay: v.overlay, product: v.product, level: v.level,
    lat: String(v.lat), lon: String(v.lon),
    detailLat: String(v.lat), detailLon: String(v.lon),
    marker: 'true', message: 'true', calendar: 'now', pressure: v.overlay === 'pressure' ? 'true' : '',
  });
  return `https://embed.windy.com/embed.html?${q}`;
}
