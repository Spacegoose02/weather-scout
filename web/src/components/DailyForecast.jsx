import { dayLabel, icon, round } from '../format.js';
import { t, condLabel } from '../i18n.js';

export default function DailyForecast({ daily, units }) {
  if (!daily?.length) return null;
  const lo = Math.min(...daily.map((d) => d.low));
  const hi = Math.max(...daily.map((d) => d.high));
  const span = Math.max(1, hi - lo);
  return (
    <section className="card daily">
      <h2>{t('10-day forecast')}</h2>
      <ul>
        {daily.map((d, i) => (
          <li key={d.time}>
            <span className="d-day">{dayLabel(d.time, i)}</span>
            <span className="d-icon" title={condLabel(d.code, d.label)}>{icon(d.icon)}</span>
            <span className="d-rain">{d.precipChance >= 20 ? `${round(d.precipChance)}%` : ''}</span>
            <span className="d-low">{round(d.low)}°</span>
            <span className="d-bar" aria-hidden>
              <i style={{ left: `${((d.low - lo) / span) * 100}%`, right: `${100 - ((d.high - lo) / span) * 100}%` }} />
            </span>
            <span className="d-high">{round(d.high)}°</span>
            {d.snowTotal > 0 && <span className="d-snow">❄️ {d.snowTotal} {units.precip === 'in' ? 'in' : 'cm'}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
