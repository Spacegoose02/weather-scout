import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });

// "Which forecast was right?": each model's forecast from the day before, against
// what really happened here over the last week. `full` shows the day-by-day table.
export default function Scorecard({ location, units, kidMode, size = 'm', full = false }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const u = units === 'metric' ? '°C' : '°F';

  useEffect(() => {
    let live = true;
    setS(null);
    setErr('');
    api(`/api/models/scorecard?lat=${location.lat}&lon=${location.lon}&units=${units}`).then((r) => live && setS(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [location.lat, location.lon, units]);

  const head = <h2>🏆 {kidMode ? 'Which forecast was right?' : 'Forecast scorecard'}</h2>;
  if (err) return <section className="card dash-score">{head}<p className="hint">{err}</p></section>;
  if (!s) return <section className="card dash-score">{head}<p className="hint">Checking last week’s forecasts…</p></section>;
  if (!s.ranking.length) return <section className="card dash-score">{head}<p className="hint">Not enough past forecasts for this place yet.</p></section>;

  const best = s.ranking[0];
  const worst = s.ranking.at(-1);
  const top = size === 's' ? s.ranking.slice(0, 3) : s.ranking;
  const maxErr = Math.max(...s.ranking.map((m) => m.avgError), 1);
  return (
    <section className={`card dash-score ${size}`}>
      <div className="card-title">{head}<span className="hint">Last {s.dates.length} days</span></div>
      <p>
        {kidMode
          ? `${best.name} was the best guesser this week! Its highs and lows were only about ${best.avgError}${u} off.`
          : `${best.name} was closest here this week, off by ${best.avgError}${u} on average for highs and lows${s.ranking.length > 1 ? `; ${worst.name} was furthest at ${worst.avgError}${u}` : ''}.`}
      </p>
      <ol className="score-list">
        {top.map((m, i) => (
          <li key={m.id}>
            <span className="score-rank">{i + 1}</span>
            <span className="score-name">{m.name}{m.ai && <span className="score-ai" title="AI model">AI</span>}</span>
            <span className="score-bar" aria-hidden><span style={{ width: `${(m.avgError / maxErr) * 100}%` }} /></span>
            <span className="score-num">±{m.avgError}{u}</span>
            {size !== 's' && <span className="hint score-rain">rain right {m.rainRight}/{m.rainDays}</span>}
          </li>
        ))}
      </ol>
      {full && (
        <div className="table-scroll">
          <table className="score-table">
            <thead>
              <tr><th>Day</th><th>What happened</th>{s.ranking.map((m) => <th key={m.id}>{m.name}</th>)}</tr>
            </thead>
            <tbody>
              {s.dates.map((d) => (
                <tr key={d}>
                  <th>{day(d)}</th>
                  <td><strong>{Math.round(s.truth[d].high)}° / {Math.round(s.truth[d].low)}°</strong></td>
                  {s.ranking.map((m) => {
                    const p = m.perDay[d];
                    return <td key={m.id} className={p && p.off <= 2 ? 'close' : p && p.off >= 5 ? 'far' : ''}>{p ? `${Math.round(p.high)}° / ${Math.round(p.low)}°` : '–'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="source">Each model’s forecast from the day before (Open-Meteo Previous Runs), checked against {s.truthSource.name}.</p>
    </section>
  );
}
