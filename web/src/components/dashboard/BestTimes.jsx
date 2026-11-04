import { useMemo } from 'react';
import { planActivities } from '../../../../shared/activities.js';

const RATING = { great: 'Great', ok: 'OK', no: 'Not today' };

// "Best times outside": the best stretch in the next day and a half for a walk,
// a bike ride, the playground, a kite, a picnic, the pool, snow play or a rainbow hunt.
export default function BestTimes({ weather, units, kidMode, size }) {
  const { forecast } = weather;
  // Refreshes with the forecast (every 10 minutes).
  const plan = useMemo(() => planActivities(forecast, { units: units === 'metric' ? 'metric' : 'imperial' }), [forecast, units]);
  const shown = size === 's' ? plan.filter((a) => a.rating !== 'no').slice(0, 3) : plan;
  return (
    <section className={`card dash-best ${size}`}>
      <div className="card-title">
        <h2>🗓️ {kidMode ? 'When can we go out?' : 'Best times outside'}</h2>
      </div>
      {!plan.length ? <p className="hint">No hourly forecast to plan with yet.</p> : (
        <ul className="best-list">
          {shown.map((a) => (
            <li key={a.id} className={`best-${a.rating}`}>
              <span className="best-emoji" aria-hidden>{a.emoji}</span>
              <span className="best-name">{a.name}</span>
              <span className="best-when">
                {a.rating === 'no' ? <span className="hint">Not soon: {a.reason}</span> : a.label}
              </span>
              <span className={`best-pill ${a.rating}`}>{RATING[a.rating]}</span>
              {size === 'l' && a.rating !== 'no' && <span className="hint best-why">{a.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      {size === 's' && shown.length === 0 && <p className="hint">Nothing looks great in the next day and a half. Indoor day!</p>}
    </section>
  );
}
