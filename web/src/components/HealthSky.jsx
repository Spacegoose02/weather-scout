import { round, clockLabel } from '../format.js';

const PRESSURE_DOT = { warning: 'red', watch: 'yellow', calm: 'green', unknown: '' };
const shortDate = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

export default function HealthSky({ weather }) {
  const { health, moon, forecast } = weather;
  if (!health && !moon) return null;
  const units = forecast.units;
  const p = health?.pressure;
  const heat = health?.heat;
  const today = forecast.daily[0];
  return (
    <section className="card health" aria-label="Health and sky">
      <h2 className="card-title">Health & sky</h2>
      <div className="details">
        {p && (
          <div className="tile wide">
            <div className="tile-label">Pressure swings</div>
            <div className="tile-value">
              {PRESSURE_DOT[p.level] && <i className={`dot ${PRESSURE_DOT[p.level]}`} aria-hidden />}{' '}
              {p.level === 'warning' ? 'Big swing ahead' : p.level === 'watch' ? 'Noticeable change' : p.level === 'calm' ? 'Steady' : '–'}
            </div>
            <div className="tile-note">{p.message}</div>
          </div>
        )}
        {heat?.now && (
          <div className="tile">
            <div className="tile-label">Heat stress (WBGT)</div>
            <div className="tile-value"><i className={`dot ${heat.now.category.color}`} aria-hidden /> {round(heat.now.wbgt)}{units.temp}</div>
            <div className="tile-note">{heat.now.category.label}. {heat.now.category.advice}</div>
          </div>
        )}
        {heat?.peak && (
          <div className="tile">
            <div className="tile-label">Peak next 24h</div>
            <div className="tile-value"><i className={`dot ${heat.peak.category.color}`} aria-hidden /> {round(heat.peak.wbgt)}{units.temp}</div>
            <div className="tile-note">{heat.peak.category.label} around {clockLabel(heat.peak.time)}</div>
          </div>
        )}
        {moon && (
          <div className="tile">
            <div className="tile-label">Moon</div>
            <div className="tile-value"><span aria-hidden>{moon.emoji}</span> {moon.illumination}%</div>
            <div className="tile-note">{moon.name}. Full {shortDate(moon.nextFull)}, new {shortDate(moon.nextNew)}</div>
          </div>
        )}
        {today?.sunrise && (
          <div className="tile">
            <div className="tile-label">Sun</div>
            <div className="tile-value">🌅 {clockLabel(today.sunrise)}</div>
            <div className="tile-note">Sets {clockLabel(today.sunset)}</div>
          </div>
        )}
      </div>
      {heat?.note && <p className="hint">{heat.note}</p>}
    </section>
  );
}
