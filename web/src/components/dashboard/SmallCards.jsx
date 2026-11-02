import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../../api.js';
import { round, icon } from '../../format.js';
import { BASEMAPS } from '../WeatherMap.jsx';
import LiveCam from '../kid/LiveCam.jsx';
import Raccoon from '../Raccoon.jsx';
import RockyFace from '../RockyFace.jsx';
import SpeakButton from '../kid/SpeakButton.jsx';
import { rockySays } from '../KidMode.jsx';
import { openSafety } from '../../safety/useSafetyPlan.js';

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

// ---- radar ---------------------------------------------------------------------
// A small looping NEXRAD map. Tap through to the full-screen radar for products,
// sites and warnings.
export function RadarCard({ location, size, onOpen }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef([]);
  const [frames, setFrames] = useState([]);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
      .setView([location.lat, location.lon], size === 's' ? 6 : 7);
    map.current = m;
    L.tileLayer(...BASEMAPS[darkQuery()?.matches ? 'dark' : 'light']).addTo(m);
    L.circleMarker([location.lat, location.lon], { radius: 6, color: '#fff', weight: 3, fillColor: '#2f6fde', fillOpacity: 1 }).addTo(m);
    let live = true;
    const load = () => api('/api/radar').then((r) => {
      if (!live) return;
      layers.current.forEach((x) => x.remove());
      layers.current = r.frames.map((f, i) => L.tileLayer(f.url, { opacity: 0, maxNativeZoom: r.maxNativeZoom || 12, maxZoom: 18, zIndex: 10, attribution: i === 0 ? r.attribution : '' }).addTo(m));
      setFrames(r.frames);
      setFrame(r.frames.length - 1);
    }).catch(() => {});
    load();
    const refresh = setInterval(load, 5 * 60_000);
    // The card can change size while editing.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      live = false;
      clearInterval(refresh);
      ro.disconnect();
      m.remove();
    };
  }, [location.lat, location.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (frames.length < 2) return;
    // Loop, then rest on the latest frame for a beat.
    const id = setInterval(() => setFrame((f) => (f + 1) % (frames.length + 3)), 550);
    return () => clearInterval(id);
  }, [frames.length]);

  const shown = Math.min(frame, frames.length - 1);
  useEffect(() => {
    layers.current.forEach((layer, i) => layer.setOpacity(i === shown ? 0.75 : 0));
  }, [shown, frames.length]);

  const t = frames[shown]?.time;
  return (
    <section className="card dash-radar">
      <div className="card-title">
        <h2>📡 Radar</h2>
        <span className="hint">{t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Loading…'}</span>
      </div>
      <div ref={el} className="dash-radar-map" aria-label="Radar loop map" />
      <button className="link" onClick={onOpen}>Open full radar →</button>
    </section>
  );
}

// ---- nearby cameras ----------------------------------------------------------------
const milesBetween = (a, b) => {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export function CamerasCard({ location, size, onOpen }) {
  const [cams, setCams] = useState(null);
  const [tick, setTick] = useState(0);
  const count = size === 'l' ? 4 : size === 'm' ? 2 : 1;

  useEffect(() => {
    let live = true;
    setCams(null);
    const box = { south: location.lat - 0.6, north: location.lat + 0.6, west: location.lon - 0.8, east: location.lon + 0.8 };
    api(`/api/cameras?south=${box.south}&west=${box.west}&north=${box.north}&east=${box.east}`)
      .then((r) => {
        if (!live) return;
        const list = (r.cameras || [])
          .filter((c) => c.imageUrl || c.video || c.embed)
          .map((c) => ({ ...c, miles: milesBetween(location, c) }))
          .sort((a, b) => a.miles - b.miles)
          .slice(0, 4);
        setCams(list);
      })
      .catch(() => live && setCams([]));
    return () => {
      live = false;
    };
  }, [location.lat, location.lon]);

  // Still pictures refresh every two minutes.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="card dash-cams">
      <div className="card-title">
        <h2>📷 Nearby cameras</h2>
        <button className="link" onClick={onOpen}>All cameras →</button>
      </div>
      {cams == null && <p className="hint">Looking for cameras…</p>}
      {cams?.length === 0 && <p className="hint">No road cameras within about 40 miles. Cameras come from state DOT feeds (Family & settings).</p>}
      <div className={`dash-cam-grid n${Math.min(count, cams?.length || 1)}`}>
        {(cams || []).slice(0, count).map((c) => (
          <figure key={c.id}>
            <LiveCam cam={{ ...c, imageUrl: c.imageUrl ? `${c.imageUrl}?t=${tick}` : null }} />
            <figcaption>{c.name} <span className="hint">· {c.miles < 1 ? 'under a mile' : `${Math.round(c.miles)} mi`}</span></figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ---- alerts ------------------------------------------------------------------------------
const SEV = { Extreme: 'extreme', Severe: 'severe', Moderate: 'moderate', Minor: 'minor' };

export function AlertsCard({ weather, kidMode, onAlerts }) {
  const list = weather.alerts || [];
  return (
    <section className="card dash-alerts">
      <div className="card-title">
        <h2>⚠️ Alerts</h2>
        <span className="row-actions">
          <button className="link" onClick={() => openSafety('plan')}>Safety plan</button>
          <button className="link" onClick={onAlerts}>Push alerts</button>
        </span>
      </div>
      {!weather.alertsAvailable && <p className="hint">The National Weather Service did not answer. Alerts will show again soon.</p>}
      {weather.alertsAvailable && list.length === 0 && <p className="dash-calm">✅ {kidMode ? 'No weather warnings. All calm!' : 'No watches, warnings or advisories here right now.'}</p>}
      <ul className="dash-alert-list">
        {list.map((a) => (
          <li key={a.id} className={`alert ${SEV[a.severity] || 'minor'}`}>
            <strong>{a.event}</strong>
            <span>{kidMode ? a.kid : a.headline}</span>
            {a.ends && <small>Until {new Date(a.ends).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Rocky ---------------------------------------------------------------------------------
const ITEM_WORDS = {
  raincoat: 'raincoat', boots: 'rain boots', beanie: 'beanie', mittens: 'mittens', 'winter-coat': 'winter coat',
  jacket: 'jacket', 'snow-boots': 'snow boots', sunglasses: 'sunglasses', 'sun-hat': 'sun hat', 't-shirt': 'T-shirt',
};

export function RockyCard({ weather, size, onKids }) {
  const { kid, forecast } = weather;
  const c = forecast.current;
  const said = rockySays(kid, c);
  const items = kid.raccoon.items || [];
  return (
    <section className={`card dash-rocky ${size}`}>
      <Raccoon items={items} mood={kid.raccoon.mood} size={size === 's' ? 130 : 170} />
      <div>
        <h2>Rocky says</h2>
        <p className="bubble">{said}</p>
        {items.length > 0 && <p className="hint">Wearing: {items.map((i) => ITEM_WORDS[i] || i).join(', ')}</p>}
        <div className="dash-row">
          <SpeakButton text={said} label="Hear Rocky" />
          <button className="link" onClick={onKids}>Kid Zone →</button>
        </div>
      </div>
    </section>
  );
}

// ---- Den-Duty ------------------------------------------------------------------------------
// The same kid-safe summary Den-Duty puts on kid boards and the family wall
// (it comes from /api/connect/summary there), so parents can see what the board says.
export function DenDutyCard({ weather, isAdmin, onAdmin }) {
  const { kid, forecast } = weather;
  const c = forecast.current;
  const today = forecast.daily[0] || {};
  return (
    <section className="card dash-denduty">
      <div className="card-title">
        <h2>🏠 Den-Duty board</h2>
        {isAdmin && <button className="link" onClick={onAdmin}>Connect</button>}
      </div>
      <div className="dd-head">
        <RockyFace />
        <span className="dd-temp">{icon(c.icon, c.isDay)} {round(c.temp)}°</span>
        <span className="hint">{round(today.high)}° / {round(today.low)}° · {today.precipChance ?? 0}% rain</span>
      </div>
      <p className={`dd-recess ${kid.playground.rating}`}>{kid.playground.emoji} Recess: {kid.playground.label}</p>
      {kid.checklist.length > 0 ? (
        <ul className="dd-list">{kid.checklist.map((i) => <li key={i.id}>{i.emoji} {i.label}</li>)}</ul>
      ) : <p className="hint">Nothing extra to pack today.</p>}
      {(weather.alerts || []).length > 0 && <p className="dd-alert">⚠️ {weather.alerts[0].kid}</p>}
    </section>
  );
}
