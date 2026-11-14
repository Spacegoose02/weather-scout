import { niceDays, TIERS } from '../../../../shared/niceday.js';
import Raccoon from '../Raccoon.jsx';

const dayName = (date, i) => (i === 0 ? 'Today' : i === 1 ? 'Tmrw' : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }));
const longName = (date, i) => (i === 0 ? 'today' : i === 1 ? 'tomorrow' : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'long', timeZone: 'UTC' }));

// Nice-day score: how pleasant each of the next 7 days looks (0-100), the best
// day to plan something outside, and in Kid mode, Rocky's grade for each day.
export default function NiceDay({ weather, kidMode, size }) {
  const { days, best } = niceDays(weather.forecast, { air: weather.air });
  if (!days.length) return <section className="card dash-nice"><h2>☀️ Nice-day score</h2><p className="hint">No forecast yet.</p></section>;
  const today = days[0];
  const bestIdx = days.indexOf(best);
  const show = size === 's' ? days.slice(0, 4) : days;
  return (
    <section className={`card dash-nice ${size}`}>
      <div className="card-title">
        <h2>☀️ {kidMode ? "Rocky's day grades" : 'Nice-day score'}</h2>
        <span className="nice-pill" style={{ background: today.tier.color }}>{kidMode ? today.tier.grade : today.score}</span>
      </div>
      {kidMode ? (
        <div className="nice-kid">
          {size !== 's' && <Raccoon items={weather.kid?.raccoon?.items || []} mood={weather.kid?.raccoon?.mood || 'happy'} size={72} />}
          <p><strong>Today gets a {today.tier.grade}.</strong> {today.tier.kid}{bestIdx > 0 ? ` The best day this week is ${longName(best.date, bestIdx)}!` : ''}</p>
        </div>
      ) : (
        <p>
          <strong>Today: {today.tier.label} ({today.score})</strong>, {today.why}.
          {bestIdx > 0 && <> Best day ahead: <strong>{longName(best.date, bestIdx)}</strong> ({best.score}, {best.tier.label.toLowerCase()}).</>}
        </p>
      )}
      <ol className="nice-days" aria-label="Nice-day score for each day">
        {show.map((d, i) => (
          <li key={d.date} className={i === bestIdx ? 'best' : ''} title={`${d.tier.label}: ${d.why}`}>
            <span className="nice-day-name">{dayName(d.date, i)}</span>
            <span className="nice-bar" aria-hidden><i style={{ height: `${Math.max(6, d.score)}%`, background: d.tier.color }} /></span>
            <b>{kidMode ? d.tier.grade : d.score}</b>
            {size === 'l' && !kidMode && <span className="nice-why">{d.why}</span>}
          </li>
        ))}
      </ol>
      {size !== 's' && !kidMode && (
        <p className="nice-key" aria-hidden>
          {TIERS.slice(0, 5).map((t) => <span key={t.id}><i style={{ background: t.color }} />{t.label} {t.min}+</span>)}
        </p>
      )}
      {!kidMode && <p className="source">Scored from feels-like temperature, humidity, rain, sky, wind, UV and air quality in the forecast. Turn on ☀️ Nice day tomorrow in 🔔 Alerts for a heads-up.</p>}
    </section>
  );
}
