import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../api.js';
import { limitToCoverage } from './map/limitView.js';
import { baseMap } from './basemap.js';
import WindyView from './WindyView.jsx';
import './modelmap.css';
import {
  MAP_AREAS, MAP_FIELDS, MAP_MODELS, colorAt, defaultArea, inConus, gridPos, legendFor, pressureCenters, sampleSmooth, scaleValue,
} from '../../../shared/modelmap.js';

// Forecast maps for the Models tab: one model (or two side by side) painted on a
// keyless base map, with a time slider that plays the forecast forward.
// The grid comes from /api/modelmap (Open-Meteo, no key). ECMWF, GFS and ICON
// can also open in Windy for the full animated map.

// About 30 pixels per grid cell; the browser smooths the rest.
const imgSize = (data) => [Math.min(720, data.cols * 30), Math.min(480, data.rows * 32)];
const PLAY_MS = 850;
// Painted frames kept per map, so playing the loop again doesn't repaint.
const KEEP_FRAMES = 18;

function useModelGrid(location, units, model, area) {
  const [state, setState] = useState({ data: null, error: '', loading: false, retryIn: 0 });
  useEffect(() => {
    if (!model) { setState({ data: null, error: '', loading: false, retryIn: 0 }); return undefined; }
    let live = true;
    let timer;
    setState((s) => ({ data: s.data?.model === model && s.data?.area === area ? s.data : null, error: '', loading: true, retryIn: 0 }));
    const load = (tries) => api(`/api/modelmap?lat=${location.lat}&lon=${location.lon}&units=${units}&model=${model}&area=${area}`)
      .then((data) => live && setState({ data, error: '', loading: false, retryIn: 0 }))
      .catch((e) => {
        if (!live) return;
        // The server is pacing Open-Meteo's free limit: wait our turn and ask again.
        if (e.retryAfter && tries < 4) {
          setState((s) => ({ ...s, loading: true, retryIn: e.retryAfter }));
          timer = setTimeout(() => load(tries + 1), e.retryAfter * 1000);
          return;
        }
        setState({ data: null, error: e.message, loading: false, retryIn: 0 });
      });
    load(0);
    return () => { live = false; clearTimeout(timer); };
  }, [location.lat, location.lon, units, model, area]);
  return state;
}

export function formatValue(field, v, units) {
  if (v == null) return '–';
  const metric = units === 'metric';
  switch (field) {
    case 'temp': return `${Math.round(v)}°${metric ? 'C' : 'F'}`;
    case 'precip': return v < (metric ? 0.1 : 0.005) ? 'Dry' : metric ? `${v.toFixed(1)} mm` : `${v.toFixed(2)} in.`;
    case 'wind': return `${Math.round(v)} ${metric ? 'km/h' : 'mph'}`;
    case 'clouds': return `${Math.round(v)}% cloudy`;
    case 'pressure': return `${Math.round(v)} hPa`;
    default: return String(v);
  }
}

const timeLabel = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric' });
const aheadLabel = (ms, from) => {
  const h = Math.round((ms - from) / 3600_000);
  if (h <= 0) return 'now';
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} days`;
};

// Web Mercator helpers, so the painted grid lines up with the base map.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const unMercY = (y) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

// Gaussian-weighted average of the nearby grid points (0.45 cells wide): a lone
// shower paints as a soft round patch instead of a square-ish blob.
const SOFT = 1 / (2 * 0.45 * 0.45);
function sampleSoft(values, rows, cols, r, c) {
  const r0 = Math.floor(r);
  const c0 = Math.floor(c);
  let sum = 0;
  let wsum = 0;
  for (let i = r0 - 1; i <= r0 + 2; i++) {
    if (i < 0 || i >= rows) continue;
    const wr = Math.exp(-((i - r) ** 2) * SOFT);
    for (let j = c0 - 1; j <= c0 + 2; j++) {
      if (j < 0 || j >= cols) continue;
      const v = values[i * cols + j];
      if (v == null) continue;
      const w = wr * Math.exp(-((j - c) ** 2) * SOFT);
      sum += v * w;
      wsum += w;
    }
  }
  return wsum > 0.05 ? sum / wsum : null;
}

const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Paint one time step of one field into an ImageData the size of the overlay. */
export function paintField(data, field, idx, units) {
  const [IMG_W, IMG_H] = imgSize(data);
  const img = new ImageData(IMG_W, IMG_H);
  const values = data.fields[field]?.[idx];
  if (!values) return img;
  const { rows, cols, lats } = data;
  const yN = mercY(lats[0]);
  const yS = mercY(lats[rows - 1]);
  const grid = new Float32Array(IMG_W * IMG_H);
  const floor = field === 'precip' || field === 'clouds' || field === 'wind';
  // Showers and cloud patches come out round and soft; smooth fields stay exact.
  const soft = field === 'precip' || field === 'clouds';
  // Colors repeat a lot (most of a rain map is dry), so remember each one.
  const colors = new Map();
  for (let py = 0; py < IMG_H; py++) {
    const lat = unMercY(yN + ((yS - yN) * (py + 0.5)) / IMG_H);
    const r = ((lats[0] - lat) / (lats[0] - lats[rows - 1])) * (rows - 1);
    for (let px = 0; px < IMG_W; px++) {
      const c = ((px + 0.5) / IMG_W) * (cols - 1);
      let v = soft ? sampleSoft(values, rows, cols, r, c) : sampleSmooth(values, rows, cols, r, c);
      if (v != null && floor) v = Math.max(0, v);
      grid[py * IMG_W + px] = v == null ? NaN : v;
      if (v == null) continue;
      const key = Math.round(scaleValue(field, v, units) * 50); // steps of 0.02 mm, °F, mph...
      let rgba = colors.get(key);
      if (!rgba) { rgba = colorAt(field, key / 50); colors.set(key, rgba); }
      // Fade out over the last bit of the grid, so its edge isn't a hard line.
      const edge = smoothstep(Math.min(r, rows - 1 - r, c, cols - 1 - c) / 0.45);
      const o = (py * IMG_W + px) * 4;
      img.data[o] = rgba[0]; img.data[o + 1] = rgba[1]; img.data[o + 2] = rgba[2]; img.data[o + 3] = rgba[3] * edge;
    }
  }
  // Isobars every 4 hPa: a pixel sits on a line where the band changes next to it.
  if (field === 'pressure') {
    const band = (v) => Math.floor(v / 4);
    for (let py = 0; py < IMG_H - 1; py++) {
      for (let px = 0; px < IMG_W - 1; px++) {
        const v = grid[py * IMG_W + px];
        if (Number.isNaN(v)) continue;
        const right = grid[py * IMG_W + px + 1];
        const down = grid[(py + 1) * IMG_W + px];
        if ((!Number.isNaN(right) && band(right) !== band(v)) || (!Number.isNaN(down) && band(down) !== band(v))) {
          const o = (py * IMG_W + px) * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = 230;
        }
      }
    }
  }
  return img;
}

// An image overlay that shows a canvas, so a new time step is one putImageData
// instead of encoding a PNG and decoding it again.
const CanvasOverlay = L.ImageOverlay.extend({
  _initImage() {
    const el = this._url;
    this._image = el;
    L.DomUtil.addClass(el, 'leaflet-image-layer');
    if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
    if (this.options.className) L.DomUtil.addClass(el, this.options.className);
    el.onselectstart = L.Util.falseFn;
    el.onmousemove = L.Util.falseFn;
    if (this.options.zIndex) this._updateZIndex();
  },
});

function boundsOf(data) {
  const { lats, lons } = data;
  let east = lons[lons.length - 1];
  if (east < lons[0]) east += 360;
  return L.latLngBounds([lats[lats.length - 1], lons[0]], [lats[0], east]);
}

const latLonAt = (data, r, c) => {
  let lon = data.lons[0] + ((data.lons[data.lons.length - 1] - data.lons[0] + (data.lons[data.lons.length - 1] < data.lons[0] ? 360 : 0)) * c) / (data.cols - 1);
  if (lon > 180) lon -= 360;
  return [data.lats[0] + ((data.lats[data.rows - 1] - data.lats[0]) * r) / (data.rows - 1), lon];
};

function ModelPane({ state, modelId, field, time, units, location, sync, panes = 1 }) {
  const el = useRef(null);
  const map = useRef(null);
  const overlay = useRef(null);
  const marks = useRef(null);
  const arrows = useRef({ key: '', list: [] });
  const canvas = useRef(null);
  const frames = useRef({ data: null, list: new Map() });
  const fitted = useRef('');
  const { data, error, loading, retryIn } = state;
  const model = MAP_MODELS.find((m) => m.id === modelId);
  const idx = data ? data.times.indexOf(time) : -1;

  useEffect(() => {
    // Quarter zoom steps, so the grid can fill the map exactly.
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90 })
      .setView([location.lat, location.lon], 6);
    map.current = m;
    baseMap('dark').addTo(m);
    marks.current = L.layerGroup().addTo(m);
    L.circleMarker([location.lat, location.lon], { radius: 6, color: '#fff', weight: 3, fillColor: '#2f6fde', fillOpacity: 1, pane: 'markerPane' })
      .addTo(m).bindTooltip('You are here');
    canvas.current = document.createElement('canvas');
    // Keep side-by-side maps looking at the same place.
    const onMove = () => {
      if (sync.busy) return;
      sync.busy = true;
      for (const other of sync.maps) if (other !== m) other.setView(m.getCenter(), m.getZoom(), { animate: false });
      sync.busy = false;
    };
    sync.maps.add(m);
    m.on('move', onMove);
    // The map shrinks when a second one is added next to it.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    const first = [...sync.maps].find((x) => x !== m);
    if (first) m.setView(first.getCenter(), first.getZoom(), { animate: false });
    return () => { ro.disconnect(); sync.maps.delete(m); m.remove(); overlay.current = null; arrows.current = { key: '', list: [] }; };
  }, [location.lat, location.lon, sync]);

  // Keep the map on the grid, so there's forecast everywhere you look instead of
  // a patch on a big empty map. A wide map fills up with the grid; a tall phone
  // map shows all of it across.
  const viewKey = data ? `${data.area}:${data.center.lat},${data.center.lon}` : '';
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return undefined;
    const b = boundsOf(data);
    const size = m.getSize();
    return limitToCoverage(m, { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, { whole: size.x < size.y * 1.15 });
  }, [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the map to the grid the first time a new area arrives.
  useEffect(() => {
    if (!data || !map.current) return;
    // Refit when a second map is added or removed too, since each map got narrower or wider.
    const k = `${data.area}:${data.center.lat},${data.center.lon}:${panes}`;
    if (fitted.current === k) return;
    fitted.current = k;
    if (sync.maps.size > 1 && [...sync.maps][0] !== map.current) return; // the first map leads
    map.current.invalidateSize();
    // No animation: a second map copies this view right away and would cut an animation short.
    const m = map.current;
    m.setView(boundsOf(data).getCenter(), m.getMinZoom(), { animate: false });
  }, [data, sync, panes]);

  // Paint the field for this time step (or reuse it if it was painted already).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!data || idx < 0) {
      overlay.current?.remove();
      overlay.current = null;
      marks.current.clearLayers();
      arrows.current = { key: '', list: [] };
      return;
    }
    if (frames.current.data !== data) frames.current = { data, list: new Map() };
    const cache = frames.current.list;
    const frameKey = `${field}:${idx}:${units}`;
    let img = cache.get(frameKey);
    if (img) cache.delete(frameKey);
    else img = paintField(data, field, idx, units);
    cache.set(frameKey, img);
    if (cache.size > KEEP_FRAMES) cache.delete(cache.keys().next().value);
    const cv = canvas.current;
    if (cv.width !== img.width || cv.height !== img.height) { cv.width = img.width; cv.height = img.height; }
    cv.getContext('2d').putImageData(img, 0, 0);
    const b = boundsOf(data);
    if (!overlay.current) overlay.current = new CanvasOverlay(cv, b, { opacity: 0.85, className: 'mm-overlay', interactive: false, zIndex: 5 }).addTo(m);
    else if (!overlay.current.getBounds().equals(b)) overlay.current.setBounds(b);

    // Wind arrows: made once per map, then only turned for each time step.
    const arrowKey = field;
    if (arrows.current.key !== arrowKey || arrows.current.data !== data) {
      marks.current.clearLayers();
      const list = [];
      if (field === 'wind') {
        for (let r = 0; r < data.rows; r += 2) {
          for (let c = 0; c < data.cols; c += 2) {
            const mk = L.marker(latLonAt(data, r, c), {
              interactive: false, keyboard: false,
              icon: L.divIcon({ className: 'mm-arrow', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
            }).addTo(marks.current);
            list.push({ k: r * data.cols + c, mk });
          }
        }
      }
      arrows.current = { key: arrowKey, data, list };
    }
    if (field === 'wind') {
      const dirs = data.fields.windDir[idx];
      const speeds = data.fields.wind[idx];
      for (const { k, mk } of arrows.current.list) {
        const span = mk.getElement()?.firstChild;
        if (!span) continue;
        const d = dirs[k];
        const calm = d == null || (speeds[k] ?? 0) < (units === 'metric' ? 3 : 2);
        span.className = calm ? 'calm' : '';
        span.textContent = d == null ? '' : calm ? '·' : '↑';
        span.style.transform = calm ? '' : `rotate(${(d + 180) % 360}deg)`;
      }
    }
    if (field === 'pressure') {
      marks.current.clearLayers();
      for (const p of pressureCenters(data.fields.pressure[idx], data.rows, data.cols)) {
        L.marker(latLonAt(data, p.r, p.c), {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: `mm-hl ${p.kind === 'L' ? 'low' : 'high'}`, html: `<b>${p.kind}</b><small>${Math.round(p.v)}</small>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
        }).addTo(marks.current);
      }
    }
  }, [data, field, idx, units]);

  // Tap anywhere for the number there.
  useEffect(() => {
    const m = map.current;
    if (!m || !data || idx < 0) return undefined;
    const onClick = (e) => {
      const { r, c } = gridPos(data, e.latlng.lat, e.latlng.lng);
      const v = sampleSmooth(data.fields[field][idx], data.rows, data.cols, r, c);
      if (v == null) return;
      L.popup({ closeButton: false, className: 'mm-pop' }).setLatLng(e.latlng).setContent(`${model?.name}: <b>${formatValue(field, v, units)}</b>`).openOn(m);
    };
    m.on('click', onClick);
    return () => m.off('click', onClick);
  }, [data, field, idx, units, model?.name]);

  const here = data && idx >= 0 ? (() => {
    const { r, c } = gridPos(data, location.lat, location.lon);
    return sampleSmooth(data.fields[field][idx], data.rows, data.cols, r, c);
  })() : null;

  let note = '';
  if (error) note = error;
  else if (loading && !data && retryIn) note = `Lots of maps were asked for this minute. The ${model?.name} map is coming in about ${retryIn} s…`;
  else if (loading && !data) note = `Loading the ${model?.name} map…`;
  else if (data && idx < 0) note = time > data.times[data.times.length - 1] ? `${model?.name} doesn't forecast this far ahead.` : `No ${model?.name} map for this time.`;
  else if (data && data.coverage < 0.6) note = `${model?.name} only covers part of this map.`;

  return (
    <div className="mm-pane">
      <div className="mm-pane-head">
        <strong>{model?.name}{model?.ai ? ' 🤖' : ''}</strong>
        <span className="hint">{data && idx >= 0 ? <>At your place: <b>{formatValue(field, here, units)}</b></> : model?.note}</span>
      </div>
      <div className="mm-map-wrap">
        <div className="mm-map" ref={el} role="img" aria-label={`${model?.name} forecast map`} />
        {note && <p className={`mm-note ${error ? 'err' : ''}`} role={error ? 'alert' : 'status'}>{note}</p>}
      </div>
    </div>
  );
}

export default function ModelMap({ location, units }) {
  const [model, setModel] = useState(MAP_MODELS[0].id);
  const [compare, setCompare] = useState('');
  const [field, setField] = useState('precip');
  const [area, setArea] = useState(() => defaultArea(location.lat, location.lon));
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [windy, setWindy] = useState(false);
  const sync = useMemo(() => ({ maps: new Set(), busy: false }), []);
  const a = useModelGrid(location, units, model, area);
  const b = useModelGrid(location, units, compare, area);

  // The slider runs over whichever map reaches further (HRRR stops at 2 days).
  // Steps more than 90 minutes gone are left out (the server may share a map fetched a few hours ago).
  const times = useMemo(() => {
    const since = Date.now() - 90 * 60_000;
    const all = new Set([...(a.data?.times || []), ...(b.data?.times || [])].filter((t) => t >= since));
    return [...all].sort((x, y) => x - y);
  }, [a.data, b.data]);
  const last = Math.max(0, times.length - 1);
  const i = Math.min(step, last);
  const time = times[i];

  useEffect(() => {
    if (!playing || times.length < 2) return undefined;
    const t = setInterval(() => setStep((s) => (Math.min(s, last) + 1) % times.length), PLAY_MS);
    return () => clearInterval(t);
  }, [playing, times.length, last]);

  const f = MAP_FIELDS.find((x) => x.id === field);
  const legend = legendFor(field, units);
  const windyModel = MAP_MODELS.find((m) => m.id === model)?.windy;
  const others = MAP_MODELS.filter((m) => m.id !== model);

  return (
    <section className="card model-map">
      <div className="card-title">
        <h2>Forecast maps</h2>
        <span className="hint">Every 3 hours from Open-Meteo</span>
      </div>
      <p className="hint">
        See what each model expects across the whole area, not just at your house. Press play to watch the
        weather move, or put two models side by side to see where they disagree.
      </p>

      <div className="mm-controls">
        <div className="chips" role="group" aria-label="Weather model">
          {MAP_MODELS.map((m) => (
            <button key={m.id} className={`chip mm-chip ${m.id === model ? 'on' : ''}`} aria-pressed={m.id === model} title={m.note}
              onClick={() => { setModel(m.id); if (compare === m.id) setCompare(''); }}>
              {m.name}{m.ai ? ' 🤖' : ''}
            </button>
          ))}
        </div>
        <div className="mm-row">
          <label className="mm-select">Compare with{' '}
            <select value={compare} onChange={(e) => setCompare(e.target.value)}>
              <option value="">No second map</option>
              {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="mm-select">Area{' '}
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {MAP_AREAS.map((x) => <option key={x.id} value={x.id}>{x.wideName && !inConus(location.lat, location.lon) ? x.wideName : x.name}</option>)}
            </select>
          </label>
          {windyModel && (
            <button className="chip mm-windy" onClick={() => setWindy(true)} title="Animated map from Windy.com">🌬️ Open in Windy</button>
          )}
        </div>
        <div className="mm-fields" role="group" aria-label="What to show">
          {MAP_FIELDS.map((x) => (
            <button key={x.id} className={x.id === field ? 'on' : ''} aria-pressed={x.id === field} onClick={() => setField(x.id)}>
              {x.emoji} {x.name}
            </button>
          ))}
        </div>
      </div>

      <p className="mm-kid">{f.emoji} {f.kid}</p>

      <div className={`mm-maps ${compare ? 'two' : ''}`}>
        <ModelPane state={a} modelId={model} field={field} time={time} units={units} location={location} sync={sync} panes={compare ? 2 : 1} />
        {compare && <ModelPane key={compare} state={b} modelId={compare} field={field} time={time} units={units} location={location} sync={sync} />}
      </div>

      <div className="mm-legend" aria-label={`Color key, ${legend.unit}`}>
        <div className="mm-bar" style={{ background: legend.gradient }} />
        <div className="mm-ticks">
          {legend.ticks.map((t) => <span key={t.v} style={{ left: `${t.at * 100}%` }}>{t.v}</span>)}
        </div>
        <span className="mm-unit">{legend.unit}</span>
      </div>

      <div className="mm-time">
        <button className="mm-play" onClick={() => setPlaying(!playing)} disabled={times.length < 2} aria-label={playing ? 'Pause' : 'Play the forecast'}>
          {playing ? '⏸' : '▶'}
        </button>
        <input type="range" min={0} max={last} value={i} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
          aria-label="Forecast time" aria-valuetext={time ? timeLabel(time) : ''} disabled={!times.length} />
        <span className="mm-when">{time ? <><b>{timeLabel(time)}</b> <span className="hint">{aheadLabel(time, Date.now())}</span></> : '…'}</span>
      </div>

      {windy && (
        <WindyView
          center={{ lat: location.lat, lon: location.lon, zoom: area === 'nearby' ? 8 : area === 'country' ? 4 : area === 'continent' ? 3 : 6 }}
          initial={{ overlay: f.windy, product: windyModel }}
          units={units}
          onClose={() => setWindy(false)}
        />
      )}
    </section>
  );
}
