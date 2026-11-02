import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';

window.L = L; // leaflet.markercluster is a classic plugin that extends the global L

const camIcon = L.divIcon({ className: 'cam-pin', html: '<span>📷</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
const ALERT_STYLE = { Extreme: '#b0003a', Severe: '#e2401c', Moderate: '#f0a202', Minor: '#e8c547' };
const CAMERA_MIN_ZOOM = 8;
const BUOY_MIN_ZOOM = 4;
const CAT_COLOR = ['#5ebaff', '#ffd23f', '#ff9f1c', '#f25c05', '#d62839', '#8f2d56'];
const stormIcon = (s) => L.divIcon({
  className: 'storm-pin',
  html: `<span style="--cat:${s.category ? CAT_COLOR[s.category] : CAT_COLOR[0]}">🌀</span><b>${s.category ? s.category : s.kind.startsWith('Tropical storm') ? 'TS' : 'TD'}</b>`,
  iconSize: [36, 36], iconAnchor: [18, 18],
});

export default function WeatherMap({ center, alerts, units = 'imperial' }) {
  const el = useRef(null);
  const map = useRef(null);
  const radar = useRef([]);
  const camLayer = useRef(null);
  const satLayer = useRef(null);
  const alertLayer = useRef(null);
  const stormLayer = useRef(null);
  const buoyLayer = useRef(null);
  const stormBounds = useRef(null);
  const [storms, setStorms] = useState(null);
  const [buoyInfo, setBuoyInfo] = useState('');
  const [frames, setFrames] = useState([]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [opacity, setOpacity] = useState(0.7);
  const [show, setShow] = useState({ radar: true, cams: true, alerts: true, satellite: false, storms: true, buoys: true });
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
      if (r.satellite) {
        satLayer.current = L.tileLayer.wms(r.satellite.wms, {
          layers: r.satellite.layers, format: 'image/png', transparent: true, opacity: 0.65, zIndex: 5, attribution: r.satellite.attribution,
        });
      }
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
    const markers = new Map();
    const loadCams = () => {
      clearTimeout(camTimer);
      camTimer = setTimeout(async () => {
        if (!camLayer.current) return;
        if (m.getZoom() < CAMERA_MIN_ZOOM) {
          camLayer.current.clearLayers();
          markers.clear();
          setCamInfo('Zoom in to see road cameras.');
          return;
        }
        const b = m.getBounds();
        try {
          const r = await api(`/api/cameras?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`);
          // Update markers in place so an open popup survives the map panning to fit it.
          const keep = new Set(r.cameras.map((c) => c.id));
          for (const [id, marker] of markers) {
            if (!keep.has(id) && !marker.isPopupOpen()) {
              camLayer.current.removeLayer(marker);
              markers.delete(id);
            }
          }
          const added = r.cameras.filter((c) => !markers.has(c.id)).map((c) => {
            const marker = L.marker([c.lat, c.lon], { icon: camIcon, title: c.name }).bindPopup(() => cameraPopup(c), { maxWidth: 380, minWidth: 280 });
            markers.set(c.id, marker);
            return marker;
          });
          camLayer.current.addLayers(added);
          if (!r.feeds.length) setCamInfo('No camera feeds are set up yet. An admin can add state 511 feeds in cameras.json.');
          else if (!r.total) setCamInfo('No cameras in this view.');
          else setCamInfo(`${r.total} camera${r.total === 1 ? '' : 's'} in view${r.truncated ? ' (zoom in for all)' : ''}.`);
        } catch (e) {
          setCamInfo(`Cameras unavailable: ${e.message}`);
        }
      }, 350);
    };
    m.on('moveend', loadCams);

    // Ocean buoys (NOAA NDBC), loaded for the current view.
    buoyLayer.current = L.layerGroup().addTo(m);
    let buoyTimer;
    const loadBuoys = () => {
      clearTimeout(buoyTimer);
      buoyTimer = setTimeout(async () => {
        if (!buoyLayer.current) return;
        if (m.getZoom() < BUOY_MIN_ZOOM) { buoyLayer.current.clearLayers(); setBuoyInfo(''); return; }
        const b = m.getBounds();
        try {
          const r = await api(`/api/buoys?south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}&units=${units}`);
          if (cancelled || !buoyLayer.current) return;
          buoyLayer.current.clearLayers();
          for (const x of r.buoys) {
            L.marker([x.lat, x.lon], { icon: buoyIcon(x), title: `Buoy ${x.id}` })
              .bindPopup(() => buoyPopup(x, r.units), { maxWidth: 260 })
              .addTo(buoyLayer.current);
          }
          setBuoyInfo(r.total ? `${r.total} buoy${r.total === 1 ? '' : 's'}` : '');
        } catch {
          setBuoyInfo('Buoys unavailable');
        }
      }, 400);
    };
    m.on('moveend', loadBuoys);
    loadBuoys();

    // Active tropical storms (NHC): cone, forecast track and current position.
    api('/api/tropics').then((t) => {
      if (cancelled) return;
      setStorms(t.storms);
      const g = L.layerGroup();
      const shapes = L.geoJSON(t.features, {
        style: (f) => (f.properties.kind === 'cone'
          ? { color: '#f25c05', weight: 1.5, fillColor: '#ffffff', fillOpacity: 0.35, dashArray: '4 3' }
          : { color: '#1d2433', weight: 2 }),
        filter: (f) => f.geometry.type !== 'Point' || f.properties.kind === 'track',
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#1d2433', weight: 1, fillColor: '#fff', fillOpacity: 1 }),
        onEachFeature: (f, layer) => f.properties.name && f.geometry.type === 'Point' && layer.bindTooltip(f.properties.name),
      }).addTo(g);
      const bounds = t.features.features.length ? shapes.getBounds() : L.latLngBounds([]);
      for (const s of t.storms) bounds.extend([s.lat, s.lon]);
      stormBounds.current = bounds.isValid() ? bounds : null;
      for (const s of t.storms) L.marker([s.lat, s.lon], { icon: stormIcon(s), title: s.name, zIndexOffset: 1000 }).bindPopup(() => stormPopup(s)).addTo(g);
      stormLayer.current = g;
      g.addTo(m);
    }).catch(() => setStorms([]));

    return () => {
      cancelled = true;
      clearTimeout(camTimer);
      clearTimeout(buoyTimer);
      m.remove();
      stormLayer.current = null;
      buoyLayer.current = null;
      radar.current = [];
      satLayer.current = null;
      camLayer.current = null;
    };
  }, [center.lat, center.lon, units]);

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
    if (!m || !satLayer.current) return;
    if (show.satellite) m.addLayer(satLayer.current);
    else m.removeLayer(satLayer.current);
  }, [show.satellite, frames.length]);

  useEffect(() => {
    const m = map.current;
    if (!m || !camLayer.current) return;
    if (show.cams) m.addLayer(camLayer.current);
    else m.removeLayer(camLayer.current);
  }, [show.cams]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [on, layer] of [[show.storms, stormLayer.current], [show.buoys, buoyLayer.current]]) {
      if (!layer) continue;
      if (on) m.addLayer(layer);
      else m.removeLayer(layer);
    }
  }, [show.storms, show.buoys, storms]);

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
        <label><input type="checkbox" checked={show.satellite} onChange={(e) => setShow({ ...show, satellite: e.target.checked })} /> Satellite</label>
        <label><input type="checkbox" checked={show.cams} onChange={(e) => setShow({ ...show, cams: e.target.checked })} /> Cameras</label>
        <label><input type="checkbox" checked={show.alerts} onChange={(e) => setShow({ ...show, alerts: e.target.checked })} /> Alerts</label>
        <label><input type="checkbox" checked={show.storms} onChange={(e) => setShow({ ...show, storms: e.target.checked })} /> Hurricanes</label>
        <label><input type="checkbox" checked={show.buoys} onChange={(e) => setShow({ ...show, buoys: e.target.checked })} /> Buoys</label>
        <label className="opacity">Opacity <input type="range" min={0.2} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
      </div>
      <div ref={el} className="map" role="application" aria-label="Radar and camera map" />
      <div className="map-foot">
        <span className="legend" aria-label="Radar colors from light to heavy"><i /> light <i /> moderate <i /> heavy <i /> intense</span>
        <span>
          {storms && (storms.length
            ? <button className="link" onClick={() => stormBounds.current && map.current?.flyToBounds(stormBounds.current.pad(0.1), { maxZoom: 6 })}>🌀 {storms.length} active storm{storms.length === 1 ? '' : 's'}</button>
            : 'No active tropical storms.')}
          {buoyInfo && ` · ${buoyInfo}`}
          {camInfo && ` · ${camInfo}`}
        </span>
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
  const stage = document.createElement('div');
  stage.className = 'cam-stage';
  const actions = document.createElement('div');
  actions.className = 'cam-actions';
  div.append(title, meta, stage, actions);

  const button = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = onClick;
    actions.append(b);
    return b;
  };
  const showMessage = (text) => stage.replaceChildren(Object.assign(document.createElement('p'), { textContent: text }));

  if (c.imageUrl) {
    const img = document.createElement('img');
    img.alt = `Camera view: ${c.name}`;
    const refresh = () => {
      stage.replaceChildren(img);
      img.src = `${c.imageUrl}?t=${Date.now()}`;
    };
    img.onerror = () => showMessage('This camera is not sending pictures right now.');
    refresh();
    button('🔄 Refresh', refresh);
  }

  if (c.video) button('▶ Live video', () => playHls(c, stage, showMessage));
  else if (c.embed) {
    // No still picture (Maryland): start the live player right inside the popup.
    const startLive = () => {
      const frame = Object.assign(document.createElement('iframe'), { src: c.embed, title: `Live camera: ${c.name}`, allowFullscreen: true });
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('allow', 'autoplay; fullscreen');
      stage.replaceChildren(frame);
    };
    if (!c.imageUrl) startLive();
    button(c.imageUrl ? '▶ Watch live' : '🔄 Reload', startLive);
    actions.append(Object.assign(document.createElement('a'), { href: c.embed, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open in new tab' }));
  }
  return div;
}

async function playHls(c, stage, showMessage) {
  const video = Object.assign(document.createElement('video'), { muted: true, autoplay: true, controls: true, playsInline: true });
  stage.replaceChildren(video);
  const fail = () => showMessage('Live video is not available for this camera right now.');
  video.onerror = fail;
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = c.video; // Safari / iOS play HLS natively
    return;
  }
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) return fail();
  const hls = new Hls({ maxBufferLength: 10 });
  hls.on(Hls.Events.ERROR, (_, data) => data.fatal && (hls.destroy(), fail()));
  hls.loadSource(c.video);
  hls.attachMedia(video);
  // Stop streaming when the popup closes and the element leaves the page.
  const watch = new MutationObserver(() => {
    if (!video.isConnected) {
      hls.destroy();
      watch.disconnect();
    }
  });
  watch.observe(document.body, { childList: true, subtree: true });
}

function buoyIcon(b) {
  const label = b.waveHeight != null ? `${Math.round(b.waveHeight)}` : '';
  return L.divIcon({ className: 'buoy-pin', html: `<span>${label}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
}

const el = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text ?? '', ...(className ? { className } : {}) });

function buoyPopup(b, units) {
  const imp = units !== 'metric';
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `NOAA buoy ${b.id}`));
  const rows = [
    ['🌊 Waves', b.waveHeight != null ? `${b.waveHeight} ${imp ? 'ft' : 'm'}${b.wavePeriod ? ` every ${b.wavePeriod} s` : ''}` : null],
    ['🌡️ Water', b.waterTemp != null ? `${Math.round(b.waterTemp)}°` : null],
    ['🌬️ Wind', b.wind != null ? `${b.wind}${b.gust ? `, gusts ${b.gust}` : ''} ${imp ? 'mph' : 'km/h'}` : null],
    ['☁️ Air', b.airTemp != null ? `${Math.round(b.airTemp)}°` : null],
  ].filter(([, v]) => v);
  for (const [k, v] of rows) { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); }
  if (b.time) div.append(el('div', `Reported ${new Date(b.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, 'cam-meta'));
  const a = el('a', 'Station page');
  a.href = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(b.id)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  div.append(a);
  return div;
}

function stormPopup(s) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `${s.kind} ${s.name}`));
  if (s.category) div.append(el('div', `Category ${s.category}`, 'cam-meta'));
  const rows = [
    ['🌬️ Winds', s.windMph != null ? `${s.windMph} mph` : null],
    ['🧭 Moving', s.movement ? `${s.movement.dir} at ${s.movement.mph} mph` : null],
    ['📉 Pressure', s.pressure ? `${s.pressure} mb` : null],
  ].filter(([, v]) => v);
  for (const [k, v] of rows) { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); }
  div.append(el('p', s.kid, 'storm-kid'));
  if (s.advisoryUrl) {
    const a = el('a', 'Latest NHC advisory');
    a.href = s.advisoryUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    div.append(a);
  }
  return div;
}
