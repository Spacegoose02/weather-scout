import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { compass } from '../../format.js';

const dayWord = (date, i) => (i === 0 ? 'Today' : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }));

// One line for the top of the card, e.g. "Choppy, 4 ft waves · Rip currents".
export function marineHeadline(d) {
  if (!d?.available) return '';
  const bits = [];
  if (d.sea && d.waves?.now?.waveHeight != null) bits.push(`${d.sea.label}, ${d.waves.now.waveHeight} ${d.units.height} waves`);
  if (d.rip) bits.push('Rip currents');
  else if (d.hazards?.length) bits.push(d.hazards[0].event);
  return bits.join(' · ');
}

// Marine & beach: waves, water temperature, the NWS marine forecast and any
// small craft, gale, rip current or high surf hazards.
export default function MarineCard({ location, units, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/marine?lat=${location.lat}&lon=${location.lon}&units=${units}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 30 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon, units]);

  const head = <h2>⛵ {kidMode ? 'Beach & waves' : 'Marine & beach'}</h2>;
  if (err) return <section className="card dash-marine">{head}<p className="hint">{err}</p></section>;
  if (!d) return <section className="card dash-marine">{head}<p className="hint">Checking the water…</p></section>;
  if (!d.available) return <section className={`card dash-marine ${size}`}><div className="card-title">{head}</div><p>{d.text}</p></section>;
  const w = d.waves?.now;
  const danger = d.rip || d.hazards.some((h) => /warning/i.test(h.event));
  return (
    <section className={`card dash-marine ${size} ${danger ? 'alarm' : ''}`}>
      <div className="card-title">{head}{d.zone && size !== 's' && <span className="hint">{d.zone.name}</span>}</div>
      {d.hazards.length > 0 && (
        <ul className="marine-hazards">
          {d.hazards.slice(0, 3).map((h) => <li key={h.id}><b>{/rip current/i.test(h.event) ? '🌊 ' : '⚠️ '}{h.event}</b>{h.ends && size !== 's' ? <span className="hint"> until {new Date(h.ends).toLocaleString([], { weekday: 'short', hour: 'numeric' })}</span> : ''}</li>)}
        </ul>
      )}
      {d.rip && <p className="storm-kid">{kidMode ? 'Rip currents can pull swimmers out to sea. Only swim near a lifeguard!' : 'Rip currents: swim near a lifeguard. If caught, swim parallel to shore, then back in.'}</p>}
      {w && (
        <div className="marine-grid">
          <div className="marine-tile"><span className="hint">Waves</span><b>{w.waveHeight ?? '–'} {d.units.height}</b><span className="hint">{d.sea?.label}{w.wavePeriod ? ` · every ${Math.round(w.wavePeriod)} s` : ''}{w.waveFrom != null ? ` · from ${compass(w.waveFrom)}` : ''}</span></div>
          {w.swellHeight != null && size !== 's' && <div className="marine-tile"><span className="hint">Swell</span><b>{w.swellHeight} {d.units.height}</b><span className="hint">{w.swellPeriod ? `${Math.round(w.swellPeriod)} s apart` : ''}</span></div>}
          {w.water != null && <div className="marine-tile"><span className="hint">Water</span><b>{w.water}{d.units.temp}</b><span className="hint">{kidMode ? (w.water >= (units === 'metric' ? 24 : 75) ? 'Nice and warm!' : 'Brrr, chilly!') : 'sea surface'}</span></div>}
        </div>
      )}
      {kidMode && d.sea && <p>{d.sea.kid}</p>}
      {size !== 's' && d.waves?.days?.length > 1 && (
        <div className="marine-days" role="list" aria-label="Highest waves each day">
          {d.waves.days.map((x, i) => <div key={x.date} role="listitem"><span className="hint">{dayWord(x.date, i)}</span><b>{x.waveMax ?? '–'}</b></div>)}
        </div>
      )}
      {!kidMode && d.forecast[0] && size !== 's' && (
        <div className="marine-fc">
          {d.forecast.slice(0, size === 'l' ? 3 : 1).map((p) => <p key={p.name}><b>{p.name}:</b> {p.text}</p>)}
        </div>
      )}
      {!kidMode && <p className="source">{d.source}.</p>}
    </section>
  );
}
