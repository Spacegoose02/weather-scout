import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import './windy.css';
import { WINDY_LEVELS, WINDY_MODELS, WINDY_OVERLAYS, windyEmbedUrl, windyView } from '../../../shared/windy.js';

// Full-screen Windy map, opened from the Radar & Cams map. Uses the free Windy
// embed unless the server has a WINDY_MAP_KEY, then the Map Forecast API page.
export default function WindyView({ center, units = 'imperial', onClose }) {
  const [info, setInfo] = useState(null);
  const [sel, setSel] = useState({ overlay: 'wind', product: 'ecmwf', level: 'surface' });
  const frame = useRef(null);
  // The API page loads once at the starting view; later changes are posted to it.
  const [start] = useState(() => windyView({ ...center, ...sel }));

  useEffect(() => {
    api('/api/windy').then(setInfo).catch(() => setInfo({ mode: 'embed', overlays: WINDY_OVERLAYS, models: WINDY_MODELS, levels: WINDY_LEVELS }));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const view = windyView({ ...start, ...sel });
  useEffect(() => {
    if (info?.mode !== 'api') return;
    frame.current?.contentWindow?.postMessage({ type: 'windy-view', overlay: view.overlay, product: view.product, level: view.level }, window.location.origin);
  }, [info?.mode, view.overlay, view.product, view.level]);

  const src = !info ? null
    : info.mode === 'api' ? `/api/windy/map?${new URLSearchParams({ lat: start.lat, lon: start.lon, zoom: start.zoom, overlay: start.overlay, product: start.product, level: start.level })}`
      : windyEmbedUrl(view, units);
  const overlays = info?.overlays || WINDY_OVERLAYS;
  const layer = overlays.find((o) => o.id === view.overlay);
  const set = (k) => (e) => setSel({ ...sel, [k]: e.target.value });

  return (
    <div className="windy-sheet" role="dialog" aria-modal="true" aria-label="Windy wind and forecast map">
      <div className="windy-bar" role="toolbar" aria-label="Windy layers">
        <span className="radar-brand">🌬️ Windy</span>
        <div className="windy-layers">
          {overlays.map((o) => (
            <button key={o.id} className={o.id === view.overlay ? 'on' : ''} aria-pressed={o.id === view.overlay} onClick={() => setSel({ ...sel, overlay: o.id })} title={o.kid}>
              {o.emoji} {o.name}
            </button>
          ))}
        </div>
        <label className="radar-select">Model{' '}
          <select value={view.product} onChange={set('product')}>
            {(info?.models || WINDY_MODELS).map((m) => <option key={m.id} value={m.id} title={m.note}>{m.name}</option>)}
          </select>
        </label>
        <label className="radar-select">Height{' '}
          <select value={view.level} onChange={set('level')}>
            {(info?.levels || WINDY_LEVELS).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button className="radar-exit" onClick={onClose} aria-label="Close Windy map">✕</button>
      </div>
      {layer && <p className="windy-kid">{layer.emoji} {layer.kid}</p>}
      {src
        ? <iframe ref={frame} className="windy-frame" title="Windy map" src={src} allow="fullscreen" referrerPolicy="origin" />
        : <p className="hint windy-loading">Loading Windy…</p>}
      <p className="windy-credit">Maps and forecast models by <a href="https://www.windy.com" target="_blank" rel="noopener noreferrer">Windy.com</a></p>
    </div>
  );
}
