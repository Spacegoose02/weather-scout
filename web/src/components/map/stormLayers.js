// Storm tracks (NEXRAD storm cells with their next hour of travel) and the
// rain / snow / mix / ice tint for the Radar & Cams map.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../../api.js';
import { CELL_LEVELS, PTYPES, PTYPE_FROM_CODE, compassWord, ptypeInfo } from '../../../../shared/stormcells.js';

export const CELL_MIN_ZOOM = 5;
export const PTYPE_MIN_ZOOM = 4;

const el = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text ?? '', ...(className ? { className } : {}) });

const cellIcon = (c) => L.divIcon({
  className: `cell-pin ${c.level}`,
  html: `<span style="background:${CELL_LEVELS[c.level].color}"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function cellPopup(c) {
  const div = el('div', '', 'buoy-popup');
  const lvl = CELL_LEVELS[c.level];
  div.append(el('strong', `⛈️ ${lvl.label}`));
  const row = (k, v) => { const r = el('div', '', 'buoy-row'); r.append(el('span', k), el('b', v)); div.append(r); };
  if (c.heading != null) row('Moving', `${compassWord(c.heading)} at ${c.mph} mph`);
  if (c.dbz != null) row('Core', `${c.dbz} dBZ`);
  if (c.top != null) row('Tops', `${c.top},000 ft`);
  if (c.hailIn) row('Hail', `up to ${c.hailIn} in`);
  else if (c.posh != null && c.posh > 0) row('Severe hail', `${c.posh}% chance`);
  if (c.tvs || c.meso) div.append(el('p', c.tvs ? 'Tornado vortex signature: strong rotation close to the ground.' : 'Mesocyclone: the storm is rotating.', 'storm-kid'));
  div.append(el('div', `Radar ${c.radar || ''}${c.t ? ` · ${new Date(c.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}${c.track.length ? ' · dots every 15 min' : ''}`, 'cam-meta'));
  return div;
}

function drawCells(group, cells) {
  group.clearLayers();
  for (const c of cells) {
    const color = CELL_LEVELS[c.level].color;
    if (c.track.length) {
      L.polyline([[c.lat, c.lon], ...c.track.map((p) => [p.lat, p.lon])], { color, weight: 2, opacity: 0.9, dashArray: '4 4', interactive: false }).addTo(group);
      for (const p of c.track) L.circleMarker([p.lat, p.lon], { radius: 2.5, color, weight: 1, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(group);
    }
    L.marker([c.lat, c.lon], { icon: cellIcon(c), title: CELL_LEVELS[c.level].label, zIndexOffset: CELL_LEVELS[c.level].rank * 100 }).bindPopup(() => cellPopup(c), { maxWidth: 260 }).addTo(group);
  }
}

// The encoded grid -> a small image, stretched over the view and smoothed by the browser.
export function ptypeImage(g) {
  const canvas = document.createElement('canvas');
  canvas.width = g.cols;
  canvas.height = g.rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const t = PTYPE_FROM_CODE[g.cells[r * g.cols + c]];
      if (!t) continue;
      ctx.fillStyle = PTYPES[t].color;
      ctx.fillRect(c, r, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

export function useStormLayers(mapRef, show, deps) {
  const showRef = useRef(show);
  showRef.current = show;
  const [info, setInfo] = useState({ cells: '', ptype: '' });
  const [counts, setCounts] = useState(null);
  const reload = useRef(() => {});

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return undefined;
    let cancelled = false;
    let timer;
    if (!m.getPane('ptypePane')) {
      const pane = m.createPane('ptypePane');
      pane.style.zIndex = 250; // over the base map and radar tiles, under pins and warnings
      pane.style.pointerEvents = 'none';
    }
    const cellGroup = L.layerGroup().addTo(m);
    let overlay = null;
    const clearPtype = () => { overlay?.remove(); overlay = null; };
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = m.getBounds();
        const q = `south=${b.getSouth()}&west=${b.getWest()}&north=${b.getNorth()}&east=${b.getEast()}`;
        if (!showRef.current.cells || m.getZoom() < CELL_MIN_ZOOM) {
          cellGroup.clearLayers();
          setInfo((i) => ({ ...i, cells: showRef.current.cells ? 'Zoom in to see storm tracks' : '' }));
        } else {
          api(`/api/cells?${q}`).then((r) => {
            if (cancelled) return;
            drawCells(cellGroup, r.cells || []);
            const strong = (r.cells || []).filter((c) => c.level !== 'storm').length;
            setInfo((i) => ({ ...i, cells: r.cells?.length ? `${r.cells.length} storm cell${r.cells.length === 1 ? '' : 's'}${strong ? ` (${strong} strong)` : ''}` : '' }));
          }).catch(() => !cancelled && setInfo((i) => ({ ...i, cells: 'Storm tracks unavailable' })));
        }
        if (!showRef.current.ptype || m.getZoom() < PTYPE_MIN_ZOOM) {
          clearPtype();
          setCounts(null);
          setInfo((i) => ({ ...i, ptype: showRef.current.ptype ? 'Zoom in to see rain and snow' : '' }));
        } else {
          api(`/api/radar/ptype?${q}`).then((g) => {
            if (cancelled) return;
            clearPtype();
            const url = ptypeImage(g);
            if (url) overlay = L.imageOverlay(url, [[g.south, g.west], [g.north, g.east]], { pane: 'ptypePane', opacity: 0.42, className: 'ptype-overlay', interactive: false }).addTo(m);
            setCounts(g.counts);
            setInfo((i) => ({ ...i, ptype: ptypeInfo(g.counts) }));
          }).catch(() => !cancelled && setInfo((i) => ({ ...i, ptype: 'Rain/snow layer unavailable' })));
        }
      }, 450);
    };
    reload.current = load;
    m.on('moveend', load);
    load();
    const every = setInterval(load, 2 * 60_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(every);
      m.off('moveend', load);
      cellGroup.remove();
      clearPtype();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload.current(); }, [show.cells, show.ptype]);

  return { info: [show.cells && info.cells, show.ptype && info.ptype].filter(Boolean).join(' · '), counts: show.ptype ? counts : null };
}
