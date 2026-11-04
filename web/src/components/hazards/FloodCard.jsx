import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { floodLevel, ERO_LEVELS } from '../../../../shared/hazards.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric' }) : '');

// Flood & rivers: the flash flood outlook for today and tomorrow, and the
// nearest river gauges with their flood stage and forecast.
export default function FloodCard({ location, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/flood?lat=${location.lat}&lon=${location.lon}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 15 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon]);

  const head = <h2>🌊 {kidMode ? 'Rivers & flash floods' : 'Flood & rivers'}</h2>;
  if (err) return <section className="card dash-flood">{head}<p className="hint">{err}</p></section>;
  if (!d) return <section className="card dash-flood">{head}<p className="hint">Checking rivers…</p></section>;

  const gauges = d.gauges || [];
  const worst = gauges[0];
  const risk = [d.outlook.today, d.outlook.tomorrow].filter(Boolean).reduce((a, b) => (b.rank > a.rank ? b : a), ERO_LEVELS[0]);
  const alarm = (worst?.rank || 0) >= 3 || risk.rank >= 2;
  const shown = size === 's' ? gauges.slice(0, 2) : size === 'l' ? gauges.slice(0, 8) : gauges.slice(0, 4);
  return (
    <section className={`card dash-flood ${size} ${alarm ? 'alarm' : ''}`}>
      <div className="card-title">{head}</div>
      <div className="ero-row">
        {[['Today', d.outlook.today], ['Tomorrow', d.outlook.tomorrow]].map(([label, o]) => (
          <div key={label} className={`ero-chip r${o?.rank ?? 'x'}`}>
            <span className="ero-day">{label}</span>
            <strong>{o ? o.label : 'Unavailable'}</strong>
            {o && size !== 's' && <small>{o.rank ? `Flash flood chance ${o.chance}` : 'Flash floods not expected'}</small>}
          </div>
        ))}
      </div>
      {kidMode && <p>{risk.kid} {risk.rank >= 1 && 'Remember: turn around, don’t drown! Never walk or ride through moving water.'}</p>}
      {!kidMode && risk.rank >= 2 && <p>Heavy rain could cause flash flooding. Never drive through water on a road: 6 inches can knock you down and 12 inches can carry away a car.</p>}

      {d.gaugesAvailable === false && <p className="hint">River gauges are unavailable right now.</p>}
      {d.gaugesAvailable !== false && !gauges.length && <p className="hint">No river gauges within 40 miles.</p>}
      {shown.length > 0 && (
        <ul className="gauge-list">
          {shown.map((g) => {
            const now = floodLevel(g.category);
            const fc = floodLevel(g.forecast?.category);
            return (
              <li key={g.id}>
                <span className="gauge-dot" style={{ background: (fc && fc.rank > (now?.rank || 0) ? fc : now)?.color || '#8a94a8' }} aria-hidden />
                <span className="gauge-name"><a href={g.url} target="_blank" rel="noopener noreferrer">{g.name}</a> <span className="hint">{Math.round(g.miles)} mi {g.dir}</span></span>
                <span className="gauge-stage">
                  {g.stage != null ? `${g.stage.toFixed(1)} ${g.unit}` : '–'} {now && <span className="hint">{kidMode ? now.kid : now.label}</span>}
                  {g.forecast && fc && fc.rank > (now?.rank || 0) && <span className="gauge-rise"> ↗ {fc.label} by {when(g.forecast.at)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="source">NOAA National Water Prediction Service gauges; flash flood risk from the NOAA Weather Prediction Center’s Excessive Rainfall Outlook.</p>
    </section>
  );
}
