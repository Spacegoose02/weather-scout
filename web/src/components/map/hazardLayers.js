// Map pins for v0.7 hazards: crowd and NWS storm reports, river gauges and
// wildfires. Each loads for the current view and redraws after the map moves.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../../api.js';
import { floodLevel, gaugeRank, hailLabel } from '../../../../shared/hazards.js';

export const REPORT_MIN_ZOOM = 5;
export const GAUGE_MIN_ZOOM = 7;
export const FIRE_MIN_ZOOM = 4;

const el = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text ?? '', ...(className ? { className } : {}) });
const link = (text, href) => Object.assign(el('a', text), { href, target: '_blank', rel: 'noopener noreferrer' });
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${Math.max(1, m)} min ago` : `${Math.round(m / 60)} hr ago`;
};

const reportIcon = (r) => L.divIcon({ className: `report-pin ${r.source}`, html: `<span>${r.emoji}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
const gaugeIcon = (g) => {
  const lvl = floodLevel(g.forecast && gaugeRank(g) > (floodLevel(g.category)?.rank || 0) ? g.forecast.category : g.category);
  return L.divIcon({ className: 'gauge-pin', html: `<span style="background:${lvl?.color || '#8a94a8'}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] });
};
const fireIcon = (f) => {
  const big = (f.acres || 0) >= 10000 ? 'big' : (f.acres || 0) >= 1000 ? 'mid' : '';
  return L.divIcon({ className: `fire-pin ${big}`, html: '<span>🔥</span>', iconSize: [24, 24], iconAnchor: [12, 12] });
};

function reportPopup(r) {
  const div = el('div', '', 'buoy-popup');
  const size = r.kind === 'hail' && r.magnitude ? ` (${hailLabel(r.magnitude) || `${r.magnitude} in`})` : r.magnitude ? ` (${r.magnitude} ${String(r.unit || '').toLowerCase()})` : '';
  div.append(el('strong', `${r.emoji} ${r.label}${size}`));
  div.append(el('div', `${r.source === 'family' ? `Reported by ${r.by}` : `${r.by || 'NWS'} report`}${r.place ? ` · ${r.place}` : ''} · ${ago(r.t)}`, 'cam-meta'));
  if (r.remark) div.append(el('p', r.remark, 'storm-kid'));
  return div;
}

function gaugePopup(g) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `🌊 ${g.name}`));
  const now = floodLevel(g.category);
  const row = (k, v) => { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); };
  if (g.stage != null) row('Now', `${g.stage.toFixed(1)} ${g.unit}${now ? ` · ${now.label}` : ''}`);
  if (g.flow != null) row('Flow', `${g.flow} ${g.flowUnit}`);
  if (g.forecast) row('Forecast', `${g.forecast.stage.toFixed(1)} ${g.unit}${floodLevel(g.forecast.category) ? ` · ${floodLevel(g.forecast.category).label}` : ''}`);
  div.append(link('River forecast page', g.url));
  return div;
}

function firePopup(f) {
  const div = el('div', '', 'buoy-popup');
  div.append(el('strong', `🔥 ${f.name}`));
  div.append(el('div', `${f.acres != null ? `${f.acres.toLocaleString()} acres` : 'Size unknown'}${f.contained != null ? ` · ${f.contained}% contained` : ''}`));
  if (f.started) div.append(el('div', `Started ${new Date(f.started).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, 'cam-meta'));
  return div;
}

const LAYERS = [
  { id: 'reports', url: '/api/reports', key: 'reports', min: REPORT_MIN_ZOOM, icon: reportIcon, popup: reportPopup, title: (r) => r.label, word: 'report' },
  { id: 'gauges', url: '/api/rivers', key: 'gauges', min: GAUGE_MIN_ZOOM, icon: gaugeIcon, popup: gaugePopup, title: (g) => g.name, word: 'river gauge' },
  { id: 'fires', url: '/api/fires', key: 'fires', min: FIRE_MIN_ZOOM, icon: fireIcon, popup: firePopup, title: (f) => f.name, word: 'wildfire' },
];

// Returns a short status line ("12 reports · 3 wildfires") for the map footer.
export function useHazardLayers(mapRef, show, deps) {
  const groups = useRef({});
  const showRef = useRef(show);
  showRef.current = show;
  const [info, setInfo] = useState({});
  const reload = useRef(() => {});

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return undefined;
    let cancelled = false;
    let timer;
    for (const l of LAYERS) groups.current[l.id] = L.layerGroup().addTo(m);
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = m.getBounds();
        const q = `south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`;
        for (const l of LAYERS) {
          const g = groups.current[l.id];
          if (!g) continue;
          if (!showRef.current[l.id]) { g.clearLayers(); setInfo((i) => ({ ...i, [l.id]: '' })); continue; }
          if (m.getZoom() < l.min) { g.clearLayers(); setInfo((i) => ({ ...i, [l.id]: l.id === 'gauges' ? 'Zoom in to see river gauges' : '' })); continue; }
          api(`${l.url}?${q}`).then((r) => {
            if (cancelled) return;
            g.clearLayers();
            const items = r[l.key] || [];
            for (const x of items) L.marker([x.lat, x.lon], { icon: l.icon(x), title: l.title(x) }).bindPopup(() => l.popup(x), { maxWidth: 260 }).addTo(g);
            setInfo((i) => ({ ...i, [l.id]: items.length ? `${items.length} ${l.word}${items.length === 1 ? '' : 's'}` : '' }));
          }).catch(() => setInfo((i) => ({ ...i, [l.id]: `${l.word[0].toUpperCase()}${l.word.slice(1)}s unavailable` })));
        }
      }, 450);
    };
    reload.current = load;
    m.on('moveend', load);
    load();
    const every = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(every);
      m.off('moveend', load);
      for (const l of LAYERS) groups.current[l.id]?.remove();
      groups.current = {};
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload.current(); }, [show.reports, show.gauges, show.fires]);

  return LAYERS.map((l) => (show[l.id] ? info[l.id] : '')).filter(Boolean).join(' · ');
}
