import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const hourWord = (t) => {
  const h = Number(t.slice(11, 13));
  return h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`;
};
const dayWord = (date, i) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'long', timeZone: 'UTC' }));

// The forecast tuned to the family's own weather station.
export default function BackyardCard({ location, units, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/forecast/backyard?lat=${location.lat}&lon=${location.lon}&units=${units}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 15 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon, units]);

  const head = <h2>🏡 {kidMode ? 'Our yard forecast' : 'Backyard forecast'}</h2>;
  if (err) return <section className="card dash-yard">{head}<p className="hint">{err}</p></section>;
  if (!d) return <section className="card dash-yard">{head}<p className="hint">Checking your station…</p></section>;
  if (!d.available) return <section className={`card dash-yard ${size}`}><div className="card-title">{head}</div><p>{d.text}</p></section>;
  const deg = '°';
  const step = size === 'l' ? 2 : 3;
  const hours = d.hours.filter((_, i) => i % step === 0).slice(0, size === 's' ? 4 : 8);
  const days = d.days.slice(0, 2);
  return (
    <section className={`card dash-yard ${size}`}>
      <div className="card-title">{head}{d.station && <span className="hint">{d.station.name}</span>}</div>
      {d.now?.tuned != null && (
        <div className="yard-now">
          <div><span className="hint">Forecast now</span><b>{Math.round(d.now.model)}{deg}</b></div>
          <div className="yard-arrow" aria-hidden="true">→</div>
          <div><span className="hint">Tuned to your yard</span><b className="yard-tuned">{d.now.tuned}{deg}</b></div>
          {d.station?.temp != null && <div><span className="hint">Station</span><b>{Math.round(d.station.temp)}{deg}</b></div>}
        </div>
      )}
      <p className="yard-text">{d.text}</p>
      {size !== 's' && days.length > 0 && (
        <div className="yard-days">
          {days.map((x, i) => (
            <div key={x.date}>
              <span className="hint">{dayWord(x.date, i)}</span>
              <span>High <b>{x.tunedHigh}{deg}</b>{x.tunedHigh !== Math.round(x.high) && <s className="hint"> {Math.round(x.high)}{deg}</s>}</span>
              <span>Low <b>{x.tunedLow}{deg}</b>{x.tunedLow !== Math.round(x.low) && <s className="hint"> {Math.round(x.low)}{deg}</s>}</span>
            </div>
          ))}
        </div>
      )}
      <div className="yard-hours" role="list" aria-label="Tuned hourly temperatures">
        {hours.map((h) => (
          <div key={h.time} role="listitem" className="yard-hour">
            <span className="hint">{hourWord(h.time)}</span>
            <b>{h.tuned}{deg}</b>
            {h.bias != null && Math.abs(h.bias) >= 1 && <small className={h.bias > 0 ? 'warm' : 'cool'}>{h.bias > 0 ? '+' : ''}{Math.round(h.bias)}</small>}
          </div>
        ))}
      </div>
      {!kidMode && <p className="source">Learned from {d.learned.samples} readings over {d.learned.days} day{d.learned.days === 1 ? '' : 's'}{d.learned.averageMiss != null ? `; the raw forecast missed your yard by ${d.learned.averageMiss}${deg} on average` : ''}. Within 15 miles of home.</p>}
    </section>
  );
}
