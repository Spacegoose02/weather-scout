import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { smokeOutlook } from '../../../../shared/hazards.js';

const acres = (n) => (n == null ? 'size unknown' : `${n.toLocaleString()} acres`);
const hour = (t) => (t ? new Date(`${t}Z`).toLocaleString([], { weekday: 'short', hour: 'numeric', timeZone: 'UTC' }) : '');

// Wildfires & smoke: active wildfires within 200 miles (and whether today's
// wind blows from them toward you) plus smoky-air hours in the air forecast.
export default function FireSmoke({ weather, location, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/fires/near?lat=${location.lat}&lon=${location.lon}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 15 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon]);

  const smoke = smokeOutlook(weather.air);
  const fires = d?.fires || [];
  const upwind = fires.filter((f) => f.upwind);
  const shown = size === 's' ? fires.slice(0, 2) : size === 'l' ? fires.slice(0, 8) : fires.slice(0, 4);
  const bad = smoke.badHours > 0;
  return (
    <section className={`card dash-fire ${size} ${bad || upwind.length ? 'alarm' : ''}`}>
      <div className="card-title"><h2>🔥 {kidMode ? 'Fires & smoky air' : 'Wildfires & smoke'}</h2></div>
      <p>
        {bad
          ? (kidMode
            ? `The air may get smoky or dusty${smoke.firstBad ? ` around ${hour(smoke.firstBad.time)}` : ''}. Play inside when it smells smoky, and take it easy if you have asthma.`
            : `Unhealthy air is forecast for ${smoke.badHours} of the next 48 hours (AQI up to ${smoke.worst.aqi}${smoke.likelySmoke ? ', mostly fine particles like smoke' : ''}). Keep windows closed and limit time outside then.`)
          : (kidMode ? 'The air looks clean for the next two days.' : 'No unhealthy air in the next 48 hours of the air quality forecast.')}
      </p>
      {upwind.length > 0 && (
        <p className="fire-upwind">💨 Today’s wind blows from {upwind[0].name} ({upwind[0].miles} mi {upwind[0].dir}), so its smoke may drift this way.</p>
      )}
      {err && <p className="hint">Wildfire list unavailable: {err}</p>}
      {d && !fires.length && <p className="hint">No active wildfires within 200 miles.</p>}
      {shown.length > 0 && (
        <ul className="fire-list">
          {shown.map((f) => (
            <li key={f.id}>
              <span aria-hidden>🔥</span>
              <span className="fire-name"><strong>{f.name}</strong>{f.state && <span className="hint"> {f.state}</span>}</span>
              <span className="fire-meta hint">{f.miles} mi {f.dir} · {acres(f.acres)}{f.contained != null ? ` · ${f.contained}% contained` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="source">Wildfires: National Interagency Fire Center (WFIGS). Air: Open-Meteo Air Quality (CAMS).</p>
    </section>
  );
}
