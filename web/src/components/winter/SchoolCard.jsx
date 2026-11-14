import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { snowDayWord } from '../../../../shared/winter.js';

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const dayOf = (date, odds) => (date === odds?.date ? odds.name : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'long', timeZone: 'UTC' }));

// School tomorrow: the snow day meter (a guess from the forecast) and, when the
// family set it up, the real status from the school district or a grown-up.
export default function SchoolCard({ location, kidMode, size, isAdmin, onAdmin }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/school?lat=${location.lat}&lon=${location.lon}`).then((r) => live && (setS(r), setErr(''))).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon]);

  const title = kidMode ? '🛷 Snow day meter' : '🏫 School tomorrow';
  if (!s) return <section className="card dash-school"><h2>{title}</h2><p className="hint">{err || 'Checking…'}</p></section>;
  const o = s.odds;
  const st = s.status;
  const big = kidMode && size !== 's';
  return (
    <section className={`card dash-school ${size} ${st && st.status !== 'open' ? 'alarm' : ''}`}>
      <div className="card-title"><h2>{title}</h2></div>
      {st && (
        <div className={`school-status st-${st.status}`} role="status">
          <span className="school-emoji" aria-hidden>{st.emoji}</span>
          <div>
            <b>{s.school ? `${s.school}: ` : ''}{st.label} {dayOf(st.date, o)}</b>
            <p className="hint">{kidMode ? st.kid : st.text || st.note || ''}</p>
            {!kidMode && <p className="hint small">{st.source === 'family' ? `Set by ${st.setBy || 'a grown-up'}` : `From the district’s page, checked ${ago(s.checkedAt)}`}{s.url && st.source !== 'family' && <> · <a href={s.url} target="_blank" rel="noopener noreferrer">check the source</a></>}</p>}
          </div>
        </div>
      )}
      <div className={`snowday ${big ? 'big' : ''}`}>
        <span className="winter-label">{kidMode ? `Snow day chance for ${o.name}` : `Snow day or delay chance (${o.name})`}</span>
        {o.chance == null ? <p className="hint">{o.reason}</p> : (
          <>
            <b className="winter-big">{o.chance}%</b>
            <span className="snowday-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={o.chance} aria-label="Snow day chance"><i style={{ width: `${o.chance}%` }} /></span>
            <span className="hint">{snowDayWord(o.chance)} · {o.reason}</span>
            {kidMode && o.chance >= 50 && <p className="storm-kid">🦝 Rocky says: put your pajamas on inside out and a spoon under your pillow. (It won’t change the weather, but it’s fun!)</p>}
          </>
        )}
      </div>
      {!kidMode && !s.configured && size !== 's' && (
        <p className="hint small">
          The chance is a guess from overnight snow, ice and bus-time cold. Add your school district’s closings page in Family & settings to also show the official word here.
          {isAdmin && onAdmin && <> <button type="button" className="link" onClick={onAdmin}>Set it up</button></>}
        </p>
      )}
      {!kidMode && s.configured && s.error && <p className="hint small">Couldn’t read the district page last time: {s.error}</p>}
      {!kidMode && s.configured && !st && <p className="hint small">No closing or delay posted by {s.school || 'the district'} (checked {ago(s.checkedAt) || 'soon'}).</p>}
    </section>
  );
}
