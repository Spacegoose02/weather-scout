import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './api.js';

const WeatherMap = lazy(() => import('./components/WeatherMap.jsx'));

// The radar map on its own, for showing inside another app (a family
// dashboard, a wall tablet) in an iframe:
//
//   /?embed=map                         the home location
//   /?embed=map&lat=37.38&lon=-80.11    somewhere else
//   &zoom=7                             closer or wider (3 to 12, default 8)
//   &light=1                            the light base map instead of dark
//
// It opens straight into the full-window radar with its toolbar (products,
// satellite, lightning, outlooks, Windy). Layers picked here are kept on this
// device, apart from the main app's.
export function embedParams(search = window.location.search) {
  const q = new URLSearchParams(search);
  if (q.get('embed') !== 'map') return null;
  const num = (k) => (q.get(k) === null || q.get(k) === '' ? NaN : Number(q.get(k)));
  const lat = num('lat');
  const lon = num('lon');
  const zoom = num('zoom');
  return {
    center: Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null,
    zoom: Number.isFinite(zoom) ? Math.min(12, Math.max(3, Math.round(zoom))) : 8,
    light: q.get('light') === '1',
  };
}

const LAYERS_KEY = 'ws-embed-map-layers';
const savedLayers = () => {
  try { return JSON.parse(localStorage.getItem(LAYERS_KEY)) || null; } catch { return null; }
};

export default function EmbedMap({ params }) {
  const [config, setConfig] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [layers, setLayers] = useState(savedLayers);
  const [error, setError] = useState('');
  const center = params.center || config?.defaultLocation || null;

  useEffect(() => {
    api('/api/config').then(setConfig).catch((e) => setError(e.message));
  }, []);

  // The place's alerts, for the warning outlines; refreshed every 2 minutes.
  useEffect(() => {
    if (!center) return undefined;
    let off = false;
    const load = () => api(`/api/alerts?lat=${center.lat}&lon=${center.lon}`).then((r) => !off && setAlerts(r.alerts || [])).catch(() => {});
    load();
    const timer = setInterval(load, 2 * 60_000);
    return () => { off = true; clearInterval(timer); };
  }, [center?.lat, center?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLayers = (next) => {
    setLayers(next);
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  if (error) return <p className="embed-note">🦝 Weather Scout's map couldn't load: {error}</p>;
  if (config?.auth?.required && !config.user) {
    return <p className="embed-note">🦝 Sign in to <a href="/" target="_blank" rel="noopener">Weather Scout</a> to see the radar here.</p>;
  }
  if (!config || !center) return <p className="embed-note">🦝 Loading the radar…</p>;
  return (
    <Suspense fallback={<p className="embed-note">🦝 Loading the radar…</p>}>
      <WeatherMap
        embed
        center={center}
        zoom={params.zoom}
        light={params.light}
        alerts={alerts}
        units={config.units || 'imperial'}
        layers={layers}
        onLayers={onLayers}
        signedIn={!!config.user}
        defaultLayers={config.map?.defaultLayers}
      />
    </Suspense>
  );
}
