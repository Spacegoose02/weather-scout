import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { ODDS, dayName, oddsWord } from '../../../../shared/odds.js';

const COLS = ['rain', 'soaking', 'snow', 'freeze', 'gust'];
const short = (date, i) => (i === 0 ? 'Today' : i === 1 ? 'Tmrw' : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }));

// Which columns are worth a column this week: rain always, the others when any
// day reaches 5%.
export function oddsColumns(days) {
  return COLS.filter((k) => k === 'rain' || days.some((d) => (d.chance[k] ?? 0) >= 5));
}

// Forecast odds: the chance of rain, a soaking, snow, a freeze or strong gusts
// each day, from 82 ensemble runs, plus the likely range of highs.
export default function OddsCard({ location, units, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    api(`/api/forecast/odds?lat=${location.lat}&lon=${location.lon}&units=${units}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [location.lat, location.lon, units]);

  const head = <h2>🎲 {kidMode ? 'Weather chances' : 'Forecast odds'}</h2>;
  if (err) return <section className="card dash-odds">{head}<p className="hint">{err}</p></section>;
  if (!d) return <section className="card dash-odds">{head}<p className="hint">Rolling 82 forecasts…</p></section>;
  const cols = oddsColumns(d.days).slice(0, size === 's' ? 2 : 5);
  const days = d.days.slice(0, size === 's' ? 4 : 7);
  const metric = units === 'metric';
  return (
    <section className={`card dash-odds ${size}`}>
      <div className="card-title">{head}</div>
      {d.highlights.length > 0
        ? <ul className="odds-hl">{d.highlights.slice(0, size === 's' ? 1 : 3).map((h) => <li key={`${h.date}${h.key}`}><b>{h.chance}%</b> {h.text.replace(/^\d+% /, '')}</li>)}</ul>
        : <p className="hint">Nothing unusual is likely this week{days[0] ? `; ${days[0].chance.rain ?? 0}% chance of rain ${dayName(days[0].date, 0)}` : ''}.</p>}
      <table className="odds-table">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Day</span></th>
            {cols.map((k) => <th key={k} scope="col">{metric && ODDS[k].metricLabel ? ODDS[k].metricLabel : ODDS[k].label}</th>)}
            {size !== 's' && <th scope="col">High (likely range)</th>}
          </tr>
        </thead>
        <tbody>
          {days.map((x, i) => (
            <tr key={x.date}>
              <th scope="row">{short(x.date, i)}</th>
              {cols.map((k) => {
                const p = x.chance[k];
                return (
                  <td key={k} title={p == null ? 'No data' : `${p}%: ${oddsWord(p)}`}>
                    {p == null ? '–' : <span className="odds-cell" style={{ '--p': `${p}%` }}>{p}%</span>}
                  </td>
                );
              })}
              {size !== 's' && <td className="odds-range">{x.high.low != null ? `${x.high.low}–${x.high.high}°` : '–'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!kidMode && <p className="source">Out of {d.members} runs of the {d.models}: the share that bring each event. The high range covers 8 in 10 runs.</p>}
      {kidMode && <p className="storm-kid">Weather computers ran the forecast {d.members} times with tiny changes. The % is how many of them agreed!</p>}
    </section>
  );
}
