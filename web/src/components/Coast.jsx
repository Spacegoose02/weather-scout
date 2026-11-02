import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { clockLabel, dayLabel } from '../format.js';

const NEAR_MILES = 2000; // only show storms that are anywhere close to this side of the ocean

function miles(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

// Tropical storms near you and the nearest tide station, on the Today tab.
// Each card only shows up when there is something to say.
export default function Coast({ location, units, onMap }) {
  const [tropics, setTropics] = useState(null);
  const [tides, setTides] = useState(null);
  useEffect(() => {
    api('/api/tropics').then(setTropics).catch(() => setTropics(null));
  }, []);
  useEffect(() => {
    setTides(null);
    api(`/api/tides?lat=${location.lat}&lon=${location.lon}&units=${units}`).then(setTides).catch(() => setTides(null));
  }, [location.lat, location.lon, units]);

  const near = (tropics?.storms || [])
    .map((s) => ({ ...s, miles: Math.round(miles(location, s) / 10) * 10 }))
    .filter((s) => s.miles <= NEAR_MILES)
    .sort((a, b) => a.miles - b.miles);

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <>
      {near.length > 0 && (
        <section className="card tropics" aria-label="Tropical storms">
          <div className="card-title">
            <h2>🌀 Hurricane tracker</h2>
            <button className="link" onClick={onMap}>See the cones on the map</button>
          </div>
          <ul className="storm-list">
            {near.map((s) => (
              <li key={s.id}>
                <span className={`cat cat-${s.category}`}>{s.category ? `Cat ${s.category}` : s.kind.startsWith('Tropical storm') ? 'TS' : 'TD'}</span>
                <div>
                  <strong>{s.kind} {s.name}</strong>
                  <div className="tile-note">
                    {s.windMph != null && `${s.windMph} mph winds`}
                    {s.movement && `, moving ${s.movement.dir} at ${s.movement.mph} mph`}
                    {`. About ${s.miles.toLocaleString()} miles from you.`}
                  </div>
                  <div className="tile-note kid-line">{s.kid}</div>
                </div>
                {s.advisoryUrl && <a href={s.advisoryUrl} target="_blank" rel="noopener noreferrer">Advisory</a>}
              </li>
            ))}
          </ul>
          <p className="hint">From the National Hurricane Center. Always follow your local officials.</p>
        </section>
      )}
      {tides?.station && (
        <section className="card tides" aria-label="Tides">
          <div className="card-title">
            <h2>🌊 Tides</h2>
            <a className="hint" href={tides.link} target="_blank" rel="noopener noreferrer">{tides.station.name}, {tides.station.miles} mi away</a>
          </div>
          {tides.state && <p className="tide-now">The tide is <strong>{tides.state}</strong>{tides.next[0] && <>. {tides.next[0].type === 'high' ? 'High' : 'Low'} tide at {clockLabel(tides.next[0].time)}</>}.</p>}
          <div className="tide-row">
            {tides.next.map((e) => (
              <div key={e.time} className={`tide ${e.type}`}>
                <div className="tide-icon" aria-hidden>{e.type === 'high' ? '⬆️' : '⬇️'}</div>
                <div className="tile-label">{e.type === 'high' ? 'High' : 'Low'}</div>
                <div className="tile-value">{clockLabel(e.time)}</div>
                <div className="tile-note">{dayLabel(e.time.slice(0, 10), e.time.slice(0, 10) === today ? 0 : 1)} · {e.height} {tides.unit}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
