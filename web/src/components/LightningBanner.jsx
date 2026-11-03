import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ThunderCounter from './kid/ThunderCounter.jsx';
import { dirWord, milesToKm } from '../../../shared/lightning.js';
import '../lightning/lightning.css';

const EVERY_MS = 60_000;

function dist(miles, units) {
  if (units === 'metric') {
    const km = milesToKm(miles);
    return km < 1 ? 'less than 1 km' : `${Math.round(km)} km`;
  }
  return miles < 1 ? 'less than 1 mile' : `${Math.round(miles)} mile${Math.round(miles) === 1 ? '' : 's'}`;
}
const ago = (min) => (min <= 0 ? 'just now' : `${min} min ago`);

// On-screen "lightning within X miles" warning, on every tab, with the 30-30
// rule countdown. Off when the distance is set to 0 (Alerts settings).
export default function LightningBanner({ location, miles, units, kidMode, onMap, onSettings }) {
  const [near, setNear] = useState(null);
  const [hidden, setHidden] = useState(0);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    if (!miles || !location) { setNear(null); return undefined; }
    let off = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api(`/api/lightning/near?lat=${location.lat}&lon=${location.lon}&miles=${miles}`)
        .then((r) => !off && setNear(r))
        .catch(() => !off && setNear(null));
    };
    load();
    const id = setInterval(load, EVERY_MS);
    document.addEventListener('visibilitychange', load);
    return () => { off = true; clearInterval(id); document.removeEventListener('visibilitychange', load); };
  }, [location?.lat, location?.lon, miles]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!near?.count || !near.nearest || !near.newest) return null;
  // Dismissed: stay quiet until a newer strike comes in.
  if (hidden && near.newest.t <= hidden) return null;

  const n = near.nearest;
  const dir = dirWord(n.dir);
  const until = near.allClearAt ? new Date(near.allClearAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const closeBy = near.newest.ageMin <= 10;
  const wait = near.minutesToAllClear;

  return (
    <section className={`bolt-banner ${closeBy ? 'close' : ''}`} role="alert" aria-label="Lightning nearby">
      <span className="bolt-emoji" aria-hidden>⚡</span>
      <div>
        {kidMode ? (
          <>
            <strong>Rocky spotted lightning {dist(n.miles, units)} away!</strong>
            <p>Time to go inside. We can go back out in <span className="bolt-clock">{wait} minute{wait === 1 ? '' : 's'}</span> if there is no more lightning. When thunder roars, go indoors!</p>
          </>
        ) : (
          <>
            <strong>Lightning {dist(n.miles, units)} {dir}, {ago(n.ageMin)}</strong>
            <p>
              {near.count.toLocaleString()} strike{near.count === 1 ? '' : 's'} within {dist(miles, units)} in the last 30 minutes.
              {' '}Stay indoors until <span className="bolt-clock">{until}</span> ({wait} min after the last strike nearby).
            </p>
          </>
        )}
      </div>
      <div className="bolt-actions">
        {onMap && <button onClick={onMap}>🗺️ See it on the map</button>}
        {kidMode && <button onClick={() => setCounting(!counting)} aria-expanded={counting}>⏱️ Count to 30</button>}
        {onSettings && !kidMode && <button className="ghost" onClick={onSettings}>Distance</button>}
        <button className="ghost" onClick={() => setHidden(near.newest.t)} aria-label="Hide until there is new lightning">✕</button>
      </div>
      {kidMode && counting && <ThunderCounter compact />}
    </section>
  );
}
