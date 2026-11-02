import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';

window.L = L; // leaflet.markercluster is a classic plugin that extends the global L

const camIcon = L.divIcon({ className: 'cam-pin', html: '<span>📷</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
const ALERT_STYLE = { Extreme: '#b0003a', Severe: '#e2401c', Moderate: '#f0a202', Minor: '#e8c547' };
const CAMERA_MIN_ZOOM = 8;

export default function WeatherMap({ center, alerts }) {
  const el = useRef(null);
  const map = useRef(null);
  const radar = useRef([]);
  const camLayer = useRef(null);
  const alertLayer = useRef(null);
  const [frames, setFrames] = useState([]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [opacity, setOpacity] = useState(0.7);
  const [show, setShow] = useState({ radar: true, cams: true, alerts: true });
  const [camInfo, setCamInfo] = useState('');

  // Map + radar setup
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], 8);
    map.current = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    L.circleMarker([center.lat, center.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#2f6fde', fillOpacity: 1 }).addTo(m).bindTooltip('You are here');

    let cancelled = false;
    api('/api/radar').then((r) => {
      if (cancelled) return;
      radar.current = r.frames.map((f, i) =>
        L.tileLayer(f.url, { opacity: 0, maxNativeZoom: r.maxNativeZoom, maxZoom: 18, zIndex: 10, attribution: i === 0 ? r.attribution : '' }).addTo(m),
      );
      setFrames(r.frames);
      setFrame(r.frames.length - 1);
    });

    import('leaflet.markercluster').then(() => {
      if (cancelled) return;
      camLayer.current = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false });
      m.addLayer(camLayer.current);
      loadCams();
    });

    let camTimer;
    const loadCams = () => {
      clearTimeout(camTimer);
      camTimer = setTimeout(async () => {
        if (!camLayer.current) return;
        if (m.getZoom() < CAMERA_MIN_ZOOM) {
          camLayer.current.clearLayers();
          setCamInfo('Zoom in to see road cameras.');
          return;
        }
        const b = m.getBounds();
        try {
          const r = await api(`/api/cameras?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`);
          camLayer.current.clearLayers();
          r.cameras.forEach((c) => camLayer.current.addLayer(L.marker([c.lat, c.lon], { icon: camIcon, title: c.name }).bindPopup(() => cameraPopup(c), { maxWidth: 360, minWidth: 260 })));
          if (!r.feeds.length) setCamInfo('No camera feeds are set up yet. An admin can add state 511 feeds in cameras.json.');
          else if (!r.total) setCamInfo('No cameras in this view.');
          else setCamInfo(`${r.total} camera${r.total === 1 ? '' : 's'} in view${r.truncated ? ' (zoom in for all)' : ''}.`);
        } catch (e) {
          setCamInfo(`Cameras unavailable: ${e.message}`);
        }
      }, 350);
    };
    m.on('moveend', loadCams);

    return () => {
      cancelled = true;
      clearTimeout(camTimer);
      m.remove();
      radar.current = [];
      camLayer.current = null;
    };
  }, [center.lat, center.lon]);

  // Radar animation
  useEffect(() => {
    if (!playing || !frames.length) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 600);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    radar.current.forEach((layer, i) => layer.setOpacity(show.radar && i === frame ? opacity : 0));
  }, [frame, opacity, show.radar, frames.length]);

  useEffect(() => {
    const m = map.current;
    if (!m || !camLayer.current) return;
    if (show.cams) m.addLayer(camLayer.current);
    else m.removeLayer(camLayer.current);
  }, [show.cams]);

  // Alert polygons
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    alertLayer.current?.remove();
    const features = alerts.filter((a) => a.geometry).map((a) => ({ type: 'Feature', geometry: a.geometry, properties: a }));
    if (!features.length || !show.alerts) return;
    alertLayer.current = L.geoJSON(features, {
      style: (f) => ({ color: ALERT_STYLE[f.properties.severity] || '#e8c547', weight: 2, fillOpacity: 0.15 }),
      onEachFeature: (f, layer) => layer.bindTooltip(f.properties.event),
    }).addTo(m);
  }, [alerts, show.alerts]);

  const t = frames[frame]?.time;
  return (
    <section className="card map-card">
      <div className="map-controls">
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause radar' : 'Play radar'}>{playing ? '❚❚' : '▶'}</button>
        <input
          type="range" min={0} max={Math.max(0, frames.length - 1)} value={frame}
          onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} aria-label="Radar time"
        />
        <span className="radar-time">{t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '…'}{frame === frames.length - 1 ? ' (latest)' : ''}</span>
        <label><input type="checkbox" checked={show.radar} onChange={(e) => setShow({ ...show, radar: e.target.checked })} /> Radar</label>
        <label><input type="checkbox" checked={show.cams} onChange={(e) => setShow({ ...show, cams: e.target.checked })} /> Cameras</label>
        <label><input type="checkbox" checked={show.alerts} onChange={(e) => setShow({ ...show, alerts: e.target.checked })} /> Alerts</label>
        <label className="opacity">Opacity <input type="range" min={0.2} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
      </div>
      <div ref={el} className="map" role="application" aria-label="Radar and camera map" />
      <div className="map-foot">
        <span className="legend" aria-label="Radar colors from light to heavy"><i /> light <i /> moderate <i /> heavy <i /> intense</span>
        <span>{camInfo}</span>
      </div>
    </section>
  );
}

function cameraPopup(c) {
  const div = document.createElement('div');
  div.className = 'cam-popup';
  const title = document.createElement('strong');
  title.textContent = c.name;
  const meta = document.createElement('div');
  meta.className = 'cam-meta';
  meta.textContent = [c.road, c.direction, c.feedName].filter(Boolean).join(' · ');
  const img = document.createElement('img');
  img.alt = `Camera view: ${c.name}`;
  img.loading = 'lazy';
  const refresh = () => { img.src = `${c.imageUrl}?t=${Date.now()}`; };
  img.onerror = () => { img.replaceWith(Object.assign(document.createElement('p'), { textContent: 'This camera is not sending pictures right now.' })); };
  refresh();
  const btn = document.createElement('button');
  btn.textContent = '🔄 Refresh';
  btn.onclick = refresh;
  div.append(title, meta, img, btn);
  if (c.video && /^https:/.test(c.video)) {
    const a = Object.assign(document.createElement('a'), { href: c.video, target: '_blank', rel: 'noopener noreferrer', textContent: '▶️ Live video' });
    div.append(' ', a);
  }
  return div;
}
