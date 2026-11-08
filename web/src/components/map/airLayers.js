// Smoke & haze (model PM2.5 as an AQI tint), air sensor pins (EPA AirNow and
// PurpleAir, when the server has keys) and wildfire burned areas (the fire
// team's latest mapped edge) for the Radar & Cams map.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../../api.js';
import { aqiLevel, SMOKE_MIN_AQI } from '../../../../shared/aqi.js';

export const SMOKE_MIN_ZOOM = 4;
export const SENSOR_MIN_ZOOM = 8;
export const PERIMETER_MIN_ZOOM = 7;

const el = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text ?? '', ...(className ? { className } : {}) });

// The AQI grid -> a small image (clear where the air is Good), stretched over the view.
export function smokeImage(g) {
  const canvas = document.createElement('canvas');
  canvas.width = g.cols;
  canvas.height = g.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const v = g.aqi[r * g.cols + c];
      if (v < SMOKE_MIN_AQI) continue;
      ctx.fillStyle = aqiLevel(v).color;
      ctx.fillRect(c, r, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

// The footer words for the smoke layer.
export function smokeInfo(worst) {
  if (worst == null) return '';
  if (worst < SMOKE_MIN_AQI) return 'No smoke or haze in view';
  return `Smoke/haze up to ${aqiLevel(worst).label.toLowerCase()} in view`;
}

const sensorIcon = (s) => L.divIcon({
  className: `aq-pin ${s.official ? 'official' : ''}`,
  html: `<span style="background:${aqiLevel(s.aqi)?.color || '#888'}">${s.aqi}</span>`,
  iconSize: [28, 20],
  iconAnchor: [14, 10],
});

function sensorPopup(s) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `${s.official ? '🏛️' : '🟣'} ${s.name}`));
  const row = (k, v) => { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); };
  row('Air quality', `${s.aqi} · ${aqiLevel(s.aqi)?.label || ''}`);
  if (s.pm25 != null) row('PM2.5', `${s.pm25} µg/m³`);
  div.append(el('div', `${s.official ? 'EPA AirNow monitor (preliminary)' : 'PurpleAir sensor, EPA-corrected'}${s.observed ? ` · ${s.observed.includes('T') ? new Date(s.observed).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : s.observed}` : ''}`, 'cam-meta'));
  return div;
}

function perimeterPopup(p) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `🔥 ${p.name}`));
  const row = (k, v) => { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); };
  if (p.acres != null) row('Burned', `${p.acres.toLocaleString()} acres`);
  if (p.contained != null) row('Contained', `${p.contained}%`);
  div.append(el('div', `Mapped fire edge (NIFC)${p.updated ? ` · ${new Date(p.updated).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}`, 'cam-meta'));
  return div;
}

// One pin per ~56 px patch of screen: official monitors first, then the worst
// reading, so a city full of sensors stays readable. `toPx` maps a sensor to pixels.
export function thinSensors(list, toPx, cell = 56) {
  const order = list.slice().sort((a, b) => (b.official - a.official) || (b.aqi - a.aqi));
  const taken = new Set();
  const out = [];
  for (const s of order) {
    const p = toPx(s);
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    if (taken.has(k)) continue;
    taken.add(k);
    out.push(s);
  }
  return out;
}

export function useAirLayers(mapRef, show, deps) {
  const showRef = useRef(show);
  showRef.current = show;
  const [info, setInfo] = useState({ smoke: '', sensors: '', perims: '' });
  const [worst, setWorst] = useState(null);
  const reload = useRef(() => {});

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return undefined;
    let cancelled = false;
    let timer;
    if (!m.getPane('smokePane')) {
      const pane = m.createPane('smokePane');
      pane.style.zIndex = 245; // just under the rain/snow tint
      pane.style.pointerEvents = 'none';
    }
    const sensorGroup = L.layerGroup().addTo(m);
    const perimGroup = L.layerGroup().addTo(m);
    let overlay = null;
    const clearSmoke = () => { overlay?.remove(); overlay = null; };
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = m.getBounds();
        const z = m.getZoom();
        const q = `south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`;
        const s = showRef.current;
        if (!s.smoke || z < SMOKE_MIN_ZOOM) {
          clearSmoke();
          setWorst(null);
          setInfo((i) => ({ ...i, smoke: s.smoke ? 'Zoom in to see smoke and haze' : '' }));
        } else {
          api(`/api/air/smoke?${q}`).then((g) => {
            if (cancelled) return;
            clearSmoke();
            const url = smokeImage(g);
            if (url) overlay = L.imageOverlay(url, [[g.south, g.west], [g.north, g.east]], { pane: 'smokePane', opacity: 0.45, className: 'smoke-overlay', interactive: false }).addTo(m);
            setWorst(g.worst);
            setInfo((i) => ({ ...i, smoke: smokeInfo(g.worst) }));
          }).catch(() => !cancelled && setInfo((i) => ({ ...i, smoke: 'Smoke layer unavailable' })));
        }
        if (!s.sensors || z < SENSOR_MIN_ZOOM) {
          sensorGroup.clearLayers();
          setInfo((i) => ({ ...i, sensors: s.sensors ? 'Zoom in to see air sensors' : '' }));
        } else {
          api(`/api/air/sensors/box?${q}`).then((r) => {
            if (cancelled) return;
            sensorGroup.clearLayers();
            const all = r.sensors || [];
            const list = thinSensors(all, (x) => m.latLngToContainerPoint([x.lat, x.lon])).sort((a, c) => a.official - c.official || a.aqi - c.aqi);
            for (const x of list) L.marker([x.lat, x.lon], { icon: sensorIcon(x), title: `${x.name}: AQI ${x.aqi}`, zIndexOffset: x.official ? 500 : x.aqi }).bindPopup(() => sensorPopup(x), { maxWidth: 260 }).addTo(sensorGroup);
            const none = !r.keys?.airnow && !r.keys?.purpleair;
            setInfo((i) => ({ ...i, sensors: none ? 'Air sensors need an AirNow or PurpleAir key (Family & settings)' : `${all.length} air sensor${all.length === 1 ? '' : 's'}${list.length < all.length ? ` (${list.length} shown, zoom in for more)` : ''}` }));
          }).catch(() => !cancelled && setInfo((i) => ({ ...i, sensors: 'Air sensors unavailable' })));
        }
        if (!s.fires || z < PERIMETER_MIN_ZOOM) {
          perimGroup.clearLayers();
          setInfo((i) => ({ ...i, perims: '' }));
        } else {
          api(`/api/fires/perimeters?${q}`).then((r) => {
            if (cancelled) return;
            perimGroup.clearLayers();
            for (const f of r.features || []) {
              L.geoJSON(f, { style: { color: '#e0322b', weight: 2, fillColor: '#ff6a2b', fillOpacity: 0.25 } }).bindPopup(() => perimeterPopup(f.properties), { maxWidth: 260 }).addTo(perimGroup);
            }
            setInfo((i) => ({ ...i, perims: r.features?.length ? `${r.features.length} burned area${r.features.length === 1 ? '' : 's'} mapped` : '' }));
          }).catch(() => !cancelled && setInfo((i) => ({ ...i, perims: '' })));
        }
      }, 500);
    };
    reload.current = load;
    m.on('moveend', load);
    load();
    const every = setInterval(load, 10 * 60_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(every);
      m.off('moveend', load);
      sensorGroup.remove();
      perimGroup.remove();
      clearSmoke();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload.current(); }, [show.smoke, show.sensors, show.fires]);

  return { info: [show.smoke && info.smoke, show.sensors && info.sensors, show.fires && info.perims].filter(Boolean).join(' · '), worst: show.smoke ? worst : null };
}
