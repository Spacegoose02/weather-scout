import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const LABEL = { likely: 'Likely tonight', possible: 'Possible tonight', unlikely: 'Not tonight' };

// Northern lights tonight, from NOAA's space weather forecast.
export default function Aurora({ location, kidMode, size }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setErr('');
    const load = () => api(`/api/sky/aurora?lat=${location.lat}&lon=${location.lon}`).then((r) => live && setA(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 30 * 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [location.lat, location.lon]);

  const title = a?.name === 'southern lights' ? '🌌 Southern lights' : '🌌 Northern lights';
  if (err) return <section className="card dash-aurora"><h2>{title}</h2><p className="hint">{err}</p></section>;
  if (!a) return <section className="card dash-aurora"><h2>{title}</h2><p className="hint">Checking space weather…</p></section>;

  const meter = Math.max(0, Math.min(100, a.kpTonight == null ? 0 : (a.kpTonight / 9) * 100));
  const need = Math.max(0, Math.min(100, (Math.min(a.needed, 9) / 9) * 100));
  return (
    <section className={`card dash-aurora ${a.chance} ${size}`}>
      <div className="card-title">
        <h2>{title}</h2>
        <span className={`aurora-pill ${a.chance}`}>{LABEL[a.chance]}</span>
      </div>
      <p>{kidMode ? a.kid : a.text}</p>
      {size !== 's' && a.kpTonight != null && (
        <div className="kp-meter" role="img" aria-label={`Tonight's Kp ${a.kpTonight} out of 9. This place needs about Kp ${a.needed}.`}>
          <div className="kp-fill" style={{ width: `${meter}%` }} />
          {a.needed <= 9 && <div className="kp-need" style={{ left: `${need}%` }} title={`Needed here: Kp ${a.needed}`} />}
          <div className="kp-scale" aria-hidden><span>0</span><span className="kp-g1" style={{ left: `${(5 / 9) * 100}%` }}>Kp 5 (G1)</span><span>9</span></div>
        </div>
      )}
      {size !== 's' && (
        <p className="hint">
          Tonight: Kp {a.kpTonight ?? '?'}{a.storm ? ` (${a.storm} storm)` : ''}. Here needs about Kp {a.needed > 9 ? '9+' : a.needed}.
          {a.cloudsTonight != null && ` Clouds tonight: ${a.cloudsTonight}%.`}
          {a.best3Days && a.best3Days.kp > (a.kpTonight ?? 0) && ` Strongest in the next 3 days: Kp ${a.best3Days.kp} around ${new Date(a.best3Days.at).toLocaleString([], { weekday: 'short', hour: 'numeric' })}.`}
        </p>
      )}
      <p className="source">{a.source}</p>
    </section>
  );
}
