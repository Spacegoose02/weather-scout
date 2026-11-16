import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './styles.css';
import App from './App.jsx';
import EmbedMap, { embedParams } from './EmbedMap.jsx';
import { noteAndroidApp } from './androidApp.js';

noteAndroidApp();

// /?embed=map shows only the radar map, for other apps' iframes.
const embed = embedParams();
if (embed) document.documentElement.classList.add('embed-map');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {embed ? <EmbedMap params={embed} /> : <App />}
  </StrictMode>,
);

// Register the service worker up front (not only when alerts are turned on) so
// offline mode, the installed app's Windows 11 widget and the Android app work.
// It keeps the app and the last weather for when the connection drops (see public/sw.js).
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
