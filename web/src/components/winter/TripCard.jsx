import { useState } from 'react';
import { api } from '../../api.js';

const HAZARD_EMOJI = { ice: '🧊', snow: '❄️', storm: '⛈️', fog: '🌫️', heavyrain: '🌧️', wind: '💨', rain: '🌦️' };
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const LEAVE = [
  { id: 0, label: 'Now' },
  { id: 1, label: 'In 1 hour' },
  { id: 2, label: 'In 2 hours' },
  { id: 4, label: 'In 4 hours' },
  { id: 8, label: 'In 8 hours' },
];

export function tripHeadline(trip) {
  if (!trip) return '';
  const bad = trip.stops.filter((s) => s.hazard && s.hazard.rank >= 2);
  if (!bad.length) {
    const wet = trip.stops.find((s) => s.hazard);
    return wet ? `Some rain along the way near mile ${wet.miles}, nothing worse.` : 'Dry roads the whole way.';
  }
  const w = trip.worst;
  return `${w.hazard.label} near mile ${w.miles}, around ${time(w.eta)}.`;
}

// Trip forecast: pick where you're driving and when you leave, and see the
// weather at each stretch of the drive at the time you'll be there.
export default function TripCard({ location, units, size }) {
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState(null);
  const [to, setTo] = useState(null);
  const [leave, setLeave] = useState(0);
  const [trip, setTrip] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const find = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setErr('');
    try {
      const r = await api(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      const list = Array.isArray(r) ? r : r.results || [];
      setPlaces(list.slice(0, 5));
      if (!list.length) setErr('No place found with that name.');
    } catch (ex) { setErr(ex.message); }
  };

  const go = async (dest = to, hours = leave) => {
    if (!dest) return;
    setBusy(true);
    setErr('');
    try {
      const depart = Date.now() + hours * 3600_000;
      setTrip(await api(`/api/trip?fromLat=${location.lat}&fromLon=${location.lon}&toLat=${dest.lat}&toLon=${dest.lon}&depart=${depart}&units=${units}`));
    } catch (ex) { setErr(ex.message); setTrip(null); }
    setBusy(false);
  };

  const shown = trip ? (size === 's' ? trip.stops.filter((s, i) => s.hazard || i === trip.stops.length - 1) : trip.stops) : [];
  return (
    <section className={`card dash-trip ${size} ${trip?.worst?.hazard?.rank >= 4 ? 'alarm' : ''}`}>
      <div className="card-title"><h2>🚗 Trip forecast</h2></div>
      <form className="trip-form" onSubmit={find}>
        <label htmlFor="trip-to" className="sr-only">Where are you driving?</label>
        <input id="trip-to" value={q} onChange={(e) => setQ(e.target.value)} placeholder={to ? to.name : 'Where are you driving?'} autoComplete="off" />
        <button type="submit">Find</button>
      </form>
      {places && places.length > 0 && !to && (
        <ul className="trip-places">
          {places.map((p) => (
            <li key={`${p.lat},${p.lon}`}><button className="link" onClick={() => { setTo(p); setPlaces(null); go(p); }}>{p.name}</button></li>
          ))}
        </ul>
      )}
      {to && (
        <div className="trip-leave" role="group" aria-label="When you leave">
          <span>To <b>{to.name}</b>, leaving</span>
          <select value={leave} onChange={(e) => { const h = Number(e.target.value); setLeave(h); go(to, h); }} aria-label="When you leave">
            {LEAVE.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button className="link" onClick={() => { setTo(null); setTrip(null); setQ(''); }}>Change</button>
        </div>
      )}
      {busy && <p className="hint">Checking the roads…</p>}
      {err && <p className="hint">{err}</p>}
      {trip && !busy && (
        <>
          <p className="trip-headline"><b>{tripHeadline(trip)}</b> {trip.miles} mi, about {Math.floor(trip.minutes / 60) ? `${Math.floor(trip.minutes / 60)} h ` : ''}{trip.minutes % 60} min, arriving {time(trip.arrive)}.</p>
          <ol className="trip-stops">
            {shown.map((s) => (
              <li key={s.miles} className={s.hazard ? `bad r${s.hazard.rank}` : ''}>
                <span className="trip-mile">mi {s.miles}</span>
                <span className="trip-at hint">{time(s.eta)}</span>
                <span>{s.hazard ? `${HAZARD_EMOJI[s.hazard.id] || '⚠️'} ${s.hazard.label}` : s.label}</span>
                <span className="hint">{s.temp != null ? `${Math.round(s.temp)}${trip.units.temp}` : ''}</span>
              </li>
            ))}
          </ol>
          <p className="source">{trip.source} Check NWS alerts and your state's 511 before you go.</p>
        </>
      )}
    </section>
  );
}
