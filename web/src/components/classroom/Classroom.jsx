import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { icon, round } from '../../format.js';
import { questionFor, SKY_PICKS, SKY, WIND_PICKS } from './questions.js';
import { t, lang, locale, condLabel } from '../../i18n.js';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// The class's own weather log: what the sky looked like, the thermometer, rain
// and wind. Anyone can read it; signed-in people add to it.
function ClassLog({ user, units, onSignIn, suggestion }) {
  const [log, setLog] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('/api/classroom/log').then(setLog).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const start = () => setForm({ sky: suggestion.sky, temp: suggestion.temp ?? '', precip: suggestion.precip, wind: suggestion.wind, note: '' });
  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/api/classroom/log', { method: 'POST', body: { ...form, temp: form.temp === '' ? null : Number(form.temp), units } });
      setForm(null);
      load();
    } catch (x) {
      setErr(x.message);
    }
  };
  const remove = async (id) => {
    await api(`/api/classroom/log/${id}`, { method: 'DELETE' }).catch((x) => setErr(x.message));
    load();
  };
  const s = log?.summary;
  return (
    <section className="cr-panel cr-log">
      <h2>{t('📓 Our weather log')}</h2>
      {s && <p className="cr-summary">{t(s.rainyDays === 1 ? 'In {days} days: mostly {sky}, 1 wet day' : 'In {days} days: mostly {sky}, {wet} wet days', { days: s.days, sky: `${t(SKY[s.commonSky]?.label || '').toLowerCase()} ${SKY[s.commonSky]?.emoji || ''}`, wet: s.rainyDays })}{s.warmest != null ? t(', warmest {hi}°, coldest {lo}°', { hi: round(s.warmest), lo: round(s.coldest) }) : ''}.</p>}
      {form ? (
        <form className="cr-form" onSubmit={save}>
          <fieldset><legend>{t('The sky looks…')}</legend>
            <div className="cr-picks">{SKY_PICKS.map((p) => <button type="button" key={p.id} aria-pressed={form.sky === p.id} onClick={() => setForm({ ...form, sky: p.id })}><span aria-hidden>{p.emoji}</span>{t(p.label)}</button>)}</div>
          </fieldset>
          <fieldset><legend>{t('The wind is…')}</legend>
            <div className="cr-picks">{WIND_PICKS.map((p) => <button type="button" key={p.id} aria-pressed={form.wind === p.id} onClick={() => setForm({ ...form, wind: p.id })}><span aria-hidden>{p.emoji}</span>{t(p.label)}</button>)}</div>
          </fieldset>
          <div className="cr-row">
            <label>{t('Our thermometer says')} <input type="number" inputMode="decimal" value={form.temp} onChange={(e) => setForm({ ...form, temp: e.target.value })} style={{ width: '5em' }} /> {units === 'metric' ? '°C' : '°F'}</label>
            <label><input type="checkbox" checked={form.precip} onChange={(e) => setForm({ ...form, precip: e.target.checked })} /> {t('Rain or snow falling')}</label>
          </div>
          <label className="cr-note">{t('What we noticed')} <input value={form.note} maxLength={140} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t('Puddles on the blacktop…')} /></label>
          <div className="cr-row"><button className="primary" type="submit">{t('Save today')}</button><button type="button" onClick={() => setForm(null)}>{t('Cancel')}</button></div>
        </form>
      ) : user ? (
        <button className="primary" onClick={start}>{t("✏️ Add today's weather")}</button>
      ) : (
        <p className="hint">{t('Sign in to add to the log.')} <button className="link" onClick={onSignIn}>{t('Sign in')}</button></p>
      )}
      {err && <p className="error">{err}</p>}
      {log?.entries?.length > 0 && (
        <table className="cr-table">
          <thead><tr><th>{t('Day')}</th><th>{t('Sky')}</th><th>{t('Temp')}</th><th>{t('Wind')}</th><th>{t('Notes')}</th><th /></tr></thead>
          <tbody>
            {log.entries.slice(0, 10).map((r) => (
              <tr key={r.id}>
                <td>{new Date(`${r.day}T12:00Z`).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</td>
                <td><span aria-hidden>{SKY[r.sky]?.emoji}</span> {t(SKY[r.sky]?.label || '')}{r.precip ? ' 💧' : ''}</td>
                <td>{r.temp != null ? `${round(r.temp)}°` : '–'}</td>
                <td>{r.wind ? t(WIND_PICKS.find((w) => w.id === r.wind)?.label || '') : '–'}</td>
                <td>{r.note}</td>
                <td>{r.mine && <button className="link" aria-label={`Remove the entry for ${r.day}`} onClick={() => remove(r.id)}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// A guess at what the class will see, to start the log entry from.
export function skyGuess(c, units = 'imperial') {
  const code = c?.code ?? 0;
  const sky = code >= 95 ? 'storm' : code >= 71 && code <= 86 && ![80, 81, 82].includes(code) ? 'snow' : code >= 51 ? 'rain' : code >= 45 ? 'fog' : code === 3 ? 'cloudy' : code >= 1 ? 'partly' : 'sunny';
  const ws = (c?.windSpeed ?? 0) / (units === 'metric' ? 1.609 : 1); // mph
  const wind = ws >= 18 ? 'windy' : ws >= 8 ? 'breezy' : 'calm';
  return { sky, wind, precip: ['rain', 'storm', 'snow'].includes(sky), temp: c?.temp != null ? Math.round(c.temp) : null };
}

// Classroom board (#classroom): a full-screen view for a classroom projector or
// smartboard. Big clock, today's weather in kid words, the recess call, what to
// wear, any warnings, a question of the day and the class's weather log.
export default function Classroom({ weather, location, units, user, onSignIn, onExit }) {
  const now = useClock();
  const [reveal, setReveal] = useState(false);
  const q = questionFor(now);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onExit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);
  const full = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});

  if (!weather) return <div className="classroom"><p className="cr-loading">{t('Fetching the sky…')}</p></div>;
  const { current: c, units: u, daily } = weather.forecast;
  const today = daily?.[0];
  const kid = weather.kid;
  const pg = kid?.playground;
  return (
    <div className="classroom">
      <header className="cr-top">
        <div className="cr-clock">
          <b>{now.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' })}</b>
          <span>{now.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
        <div className="cr-place">{location?.name}</div>
        <div className="cr-tools">
          <button onClick={full}>⛶ {t('Full screen')}</button>
          <button onClick={onExit}>✕ {t('Leave board')}</button>
        </div>
      </header>

      {weather.alerts?.length > 0 && (
        <section className="cr-alerts" role="alert">
          {weather.alerts.slice(0, 2).map((a) => <p key={a.id}>⚠️ <b>{a.event}</b> {a.kid}</p>)}
        </section>
      )}

      <div className="cr-grid">
        <section className="cr-panel cr-now">
          <div className="cr-icon" aria-hidden>{icon(c.icon, c.isDay)}</div>
          <div>
            <div className="cr-temp">{round(c.temp)}<span>{u.temp}</span></div>
            <div className="cr-cond">{lang() === 'es' ? condLabel(c.code, c.label) : c.kidLabel || c.label}</div>
            {today && <div className="cr-hilo">{t('High {high}° · Low {low}° · {n}% chance of rain', { high: round(today.high), low: round(today.low), n: round(today.precipChance) })}</div>}
          </div>
        </section>

        {pg && (
          <section className={`cr-panel cr-recess ${pg.rating}`}>
            <h2>{t('Recess')}</h2>
            <div className="cr-light" aria-hidden><i className={pg.rating === 'red' ? 'on red' : 'red'} /><i className={pg.rating === 'yellow' ? 'on yellow' : 'yellow'} /><i className={pg.rating === 'green' ? 'on green' : 'green'} /></div>
            <p className="cr-recess-label">{pg.emoji} {t(pg.label)}</p>
            {pg.reasons?.length > 0 && <p className="hint">{t(pg.reasons[0])}</p>}
          </section>
        )}

        <section className="cr-panel cr-wear">
          <h2>{t('What to wear')}</h2>
          {kid?.checklist?.length ? (
            <ul>{kid.checklist.slice(0, 5).map((i) => <li key={i.id}><span aria-hidden>{i.emoji}</span> {t(i.label)}</li>)}</ul>
          ) : <p>{t('Just your regular clothes today!')}</p>}
        </section>

        <section className="cr-panel cr-question">
          <h2>{t('❓ Question of the day')}</h2>
          <p className="cr-q">{lang() === 'es' ? q.qEs : q.q}</p>
          {reveal ? <p className="cr-a">{lang() === 'es' ? q.aEs : q.a}</p> : <button onClick={() => setReveal(true)}>{t('Show the answer')}</button>}
        </section>

        <ClassLog user={user} units={units} onSignIn={onSignIn} suggestion={skyGuess(c, units)} />
      </div>
    </div>
  );
}
