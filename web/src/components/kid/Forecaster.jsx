import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { scorePending, forecasterTotals, guessKey } from '../../kid/logic.js';

const longDay = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export default function Forecaster({ weather, kid, today }) {
  const { forecast, location } = weather;
  const units = location.units;
  const tomorrow = forecast.daily[1]?.time;
  const guesses = kid.data.guesses || [];
  const mine = guesses.find((g) => g.date === tomorrow);
  const base = Math.round(forecast.daily[0]?.high ?? forecast.current.temp ?? 60);
  const [high, setHigh] = useState(mine?.high ?? base);
  const [rain, setRain] = useState(mine?.rain ?? null);
  const [editing, setEditing] = useState(!mine);

  // Score any guesses whose day is over.
  useEffect(() => {
    const pending = guesses.filter((g) => !g.result && g.date < today);
    if (!pending.length) return;
    const keys = [...new Set(pending.map(guessKey))];
    Promise.all(keys.map((k) => {
      const [lat, lon, u] = k.split(',');
      return api(`/api/kid/actuals?lat=${lat}&lon=${lon}&units=${u}`).then((r) => [k, r.days]).catch(() => [k, null]);
    })).then((pairs) => {
      const { guesses: next, changed } = scorePending(guesses, Object.fromEntries(pairs), today);
      if (!changed) return;
      kid.update(() => ({ guesses: next }));
      const t = forecasterTotals(next);
      const badges = ['junior-forecaster'];
      if (t.bullseyes) badges.push('bullseye');
      if (t.points >= 25) badges.push('weather-wiz');
      kid.earn(...badges);
    });
  }, [today, guesses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const g = { date: tomorrow, high: Number(high), rain, units, lat: location.lat, lon: location.lon, madeOn: today };
    kid.update((prev) => ({ guesses: [...(prev.guesses || []).filter((x) => x.date !== tomorrow), g].slice(-60) }));
    setEditing(false);
  };

  const totals = forecasterTotals(guesses);
  const scored = guesses.filter((g) => g.result).slice(-5).reverse();
  const waiting = guesses.filter((g) => !g.result && g.date <= today && g.date !== tomorrow);
  const tempUnit = forecast.units.temp;

  return (
    <section className="card forecaster">
      <h2>Kid forecaster</h2>
      <p className="hint">Be the meteorologist! Guess tomorrow's weather. No peeking at the forecast! 🙈</p>
      {tomorrow && (editing ? (
        <div className="guess-form">
          <p><strong>{longDay(tomorrow)}</strong></p>
          <label className="guess-high">
            How hot will it get?
            <span className="guess-temp">{high}{tempUnit}</span>
            <input type="range" min={base - 30} max={base + 30} value={high} onChange={(e) => setHigh(Number(e.target.value))} />
          </label>
          <div className="guess-rain">
            <span>Will it rain?</span>
            <button className={rain === true ? 'on' : 'ghost'} onClick={() => setRain(true)} aria-pressed={rain === true}>☔ Yes</button>
            <button className={rain === false ? 'on' : 'ghost'} onClick={() => setRain(false)} aria-pressed={rain === false}>🌤️ No</button>
          </div>
          <button onClick={save} disabled={rain == null}>Lock in my forecast</button>
        </div>
      ) : (
        <div className="guess-locked">
          <p>🔒 Your forecast for tomorrow: <strong>{mine.high}{tempUnit}</strong> and <strong>{mine.rain ? 'rain' : 'no rain'}</strong>.</p>
          <p className="hint">Come back the day after to see how you did.</p>
          <button className="link" onClick={() => setEditing(true)}>Change my guess</button>
        </div>
      ))}

      {waiting.length > 0 && <p className="hint">⏳ Waiting for the real weather on {waiting.map((g) => longDay(g.date)).join(', ')}.</p>}

      {scored.length > 0 && (
        <>
          <h3>How did you do? <span className="points">{totals.points} points</span></h3>
          <ul className="guess-history">
            {scored.map((g) => (
              <li key={g.date}>
                <span className="when">{longDay(g.date)}</span>
                <span>You said {g.high}°{g.rain ? ' ☔' : ' 🌤️'}. Really: {g.result.actualHigh}°{g.result.rained ? ' ☔' : ' 🌤️'}</span>
                <span className="pts">+{g.result.points}</span>
              </li>
            ))}
          </ul>
          <p className="rocky-line">🦝 {scored[0].result.message}</p>
        </>
      )}
      <p className="hint small">
        Points: 3 for a high within {units === 'metric' ? '1° (2 within 3°, 1 within 6°)' : '2° (2 within 5°, 1 within 10°)'}, and 2 for getting rain right.
      </p>
    </section>
  );
}
