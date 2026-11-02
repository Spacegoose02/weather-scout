import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { round, compass } from '../../format.js';
import './stations.css';

// The family's own weather station (Ecowitt, Ambient Weather, Tempest...), shown
// under the forecast's current conditions. Renders nothing when no station reports.
const ago = (s) => (s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);

export default function StationStrip({ units, kidMode }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api(`/api/stations?units=${units}`).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [units]);

  const st = data?.stations?.find((s) => s.id === data.primary);
  if (!st) return null;
  const c = st.current;
  const u = data.units;
  return (
    <div className="station-strip" aria-label={`${st.name} readings`}>
      <div className="station-head">
        <strong>🏡 {kidMode ? 'Our backyard station says' : st.name}</strong>
        <span className="hint">{st.sourceLabel} · {ago(st.ageSeconds)}</span>
      </div>
      <div className="station-vals">
        {c.temp != null && <span className="station-temp">{round(c.temp)}{u.temp}</span>}
        {c.humidity != null && <span>💧 {round(c.humidity)}%</span>}
        {c.windSpeed != null && <span>💨 {round(c.windSpeed)} {u.wind} {compass(c.windDir)}{c.windGust > c.windSpeed + 5 ? `, gusts ${round(c.windGust)}` : ''}</span>}
        {c.rainToday != null && <span>🌧️ {c.rainToday} {u.precip} today</span>}
        {c.uv != null && <span>☀️ UV {round(c.uv)}</span>}
        {c.lightning?.count > 0 && <span>⚡ {c.lightning.count} strikes{c.lightning.distance != null ? `, ${round(c.lightning.distance)} ${u.distance} away` : ''}</span>}
        {!kidMode && c.indoor?.temp != null && <span>🏠 Inside {round(c.indoor.temp)}{u.temp}</span>}
      </div>
      {kidMode && c.temp != null && <p className="hint station-kid">That's a real thermometer at your house, not a guess from far away!</p>}
    </div>
  );
}
