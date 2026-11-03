import { useRef, useState } from 'react';
import { api } from '../../../api.js';
import { icon } from '../../../format.js';
import { shrink } from '../Seasons.jsx';
import { HAIL_SIZES } from '../../../kid/chaser/spotter.js';
import {
  PHOTO_SPOT, RANKS, SIGHTINGS, WATCHED_FROM, addEntry, entryPoints, logBadges, logStats, sightingById,
} from '../../../kid/chaser/logbook.js';
import '../../../kid/chaser/train.css';

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const niceDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const niceTime = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const blank = (today) => ({ day: today, time: nowTime(), saw: [], hail: '', from: 'window', note: '' });

// Storm Chaser Logbook: write down every storm you watch (safely!), earn points
// for what you spot and climb the chaser ranks.
export default function Logbook({ weather, user, kid, today }) {
  const log = kid.data.chaseLog || [];
  const stats = logStats(log);
  const [draft, setDraft] = useState(() => blank(today));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const fileRef = useRef();

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (id) => set({ saw: draft.saw.includes(id) ? draft.saw.filter((x) => x !== id) : [...draft.saw, id] });

  const pickPhoto = async (f) => {
    setError('');
    if (!f) return;
    try {
      const img = await shrink(f);
      setFile(img);
      setPreview(img);
    } catch {
      setError('That photo would not open. Try another one.');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!draft.saw.length) {
      setError('Pick at least one thing you saw.');
      return;
    }
    setBusy(true);
    setError('');
    const c = weather.forecast.current;
    const entry = {
      id: `${draft.day}-${Date.now().toString(36)}`,
      day: draft.day,
      time: draft.time,
      saw: draft.saw,
      hail: draft.saw.includes('hail') ? draft.hail || null : null,
      from: draft.from,
      note: draft.note.trim().slice(0, 300),
      weather: draft.day === today ? { temp: c.temp == null ? null : Math.round(c.temp), units: weather.forecast.units.temp, icon: c.icon, kidLabel: c.kidLabel } : null,
    };
    try {
      if (file && user) {
        const r = await api('/api/me/photos', { method: 'POST', body: { spot: PHOTO_SPOT, image: file, takenOn: draft.day } });
        entry.photoId = r.photo.id;
        entry.photoUrl = r.photo.url;
      }
      const next = addEntry(log, entry);
      kid.update(() => ({ chaseLog: next }));
      const ids = logBadges(next);
      if (ids.length) kid.earn(...ids);
      setDraft(blank(today));
      setFile(null);
      setPreview('');
      if (fileRef.current) fileRef.current.value = '';
      setOpen(entry.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!window.confirm('Delete this storm from your logbook?')) return;
    if (entry.photoId && user) await api(`/api/me/photos/${entry.photoId}`, { method: 'DELETE' }).catch(() => {});
    kid.update((prev) => ({ chaseLog: (prev.chaseLog || []).filter((e) => e.id !== entry.id) }));
  };

  return (
    <>
      <section className="card train-wide chase-rank">
        <div className="rank-badge" aria-hidden>{stats.rank.emoji}</div>
        <div className="rank-text">
          <p className="hint">Chaser rank</p>
          <h2>{stats.rank.name}</h2>
          <p>{stats.storms} storm{stats.storms === 1 ? '' : 's'} logged · {stats.points} chase points · {stats.kinds.size} of {SIGHTINGS.length} sightings</p>
          {stats.next && (
            <>
              <div className="badge-meter" role="progressbar" aria-valuemin={0} aria-valuemax={stats.next.at} aria-valuenow={stats.points} aria-label={`Points toward ${stats.next.name}`}>
                <i style={{ width: `${Math.min(100, ((stats.points - stats.rank.at) / (stats.next.at - stats.rank.at)) * 100)}%` }} />
              </div>
              <p className="hint">{stats.toNext} more point{stats.toNext === 1 ? '' : 's'} to {stats.next.emoji} {stats.next.name}</p>
            </>
          )}
        </div>
        <ol className="rank-ladder" aria-label="All chaser ranks">
          {RANKS.map((r) => <li key={r.name} className={stats.points >= r.at ? 'on' : ''}><span aria-hidden>{r.emoji}</span> {r.name} <small>{r.at}</small></li>)}
        </ol>
      </section>

      <section className="card train-wide chase-log">
        <h2>📒 Log a storm</h2>
        <p className="hint">Real chasers keep a log of every storm. Watch from a safe spot with a grown-up, then write down what you saw. Rare sightings earn more points!</p>
        <form onSubmit={save} className="log-form">
          <div className="log-when">
            <label>Day<input type="date" value={draft.day} max={today} onChange={(e) => set({ day: e.target.value || today })} /></label>
            <label>Time<input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} /></label>
            <label>Watched from
              <select value={draft.from} onChange={(e) => set({ from: e.target.value })}>
                {WATCHED_FROM.map((w) => <option key={w.id} value={w.id}>{w.emoji} {w.label}</option>)}
              </select>
            </label>
          </div>
          <p className="log-q"><strong>What did you see?</strong></p>
          <div className="sighting-grid" role="group" aria-label="What did you see">
            {SIGHTINGS.map((s) => (
              <button key={s.id} type="button" className={draft.saw.includes(s.id) ? 'on' : ''} aria-pressed={draft.saw.includes(s.id)} onClick={() => toggle(s.id)}>
                <span aria-hidden>{s.emoji}</span><small>{s.label}</small><em>+{s.points}</em>
              </button>
            ))}
          </div>
          {draft.saw.includes('hail') && (
            <label className="log-hail">How big was the hail?
              <select value={draft.hail} onChange={(e) => set({ hail: e.target.value })}>
                <option value="">Not sure</option>
                {HAIL_SIZES.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.label} ({h.inches}″)</option>)}
              </select>
            </label>
          )}
          {draft.saw.includes('tornado') && <p className="log-safety">🛡️ Tornado nearby? Go to your safe spot first. Log it later, when the warning is over!</p>}
          <label className="log-note">Chaser notes
            <textarea rows={2} maxLength={300} value={draft.note} placeholder="Which way was it moving? What color was the sky? How loud was the thunder?" onChange={(e) => set({ note: e.target.value })} />
          </label>
          {user ? (
            <label className={`photo-add ${busy ? 'busy' : ''}`}>
              📷 {preview ? 'Change photo' : 'Add a storm photo (+1)'}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => pickPhoto(e.target.files?.[0])} hidden />
            </label>
          ) : <p className="hint">Sign in to add storm photos to your logbook.</p>}
          {preview && <img className="log-preview" src={preview} alt="Your storm photo" />}
          <div className="row">
            <button disabled={busy}>{busy ? 'Saving…' : `Save to my logbook${draft.saw.length ? ` (+${entryPoints({ ...draft, photoId: file ? 1 : null })} points)` : ''}`}</button>
            {error && <span className="error-text" role="alert">{error}</span>}
          </div>
        </form>
      </section>

      <section className="card train-wide chase-history">
        <h2>🗂️ My storms</h2>
        {log.length === 0 ? <p className="hint">No storms yet. The next time thunder rumbles, watch from the window and log it here!</p> : (
          <ul className="log-list">
            {log.map((e) => (
              <li key={e.id}>
                <button className="log-entry" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                  <span className="log-day">{niceDay(e.day)}{e.time ? ` · ${niceTime(e.time)}` : ''}</span>
                  <span className="log-saw" aria-label={(e.saw || []).map((s) => sightingById[s]?.label).join(', ')}>{(e.saw || []).map((s) => sightingById[s]?.emoji).join(' ')}</span>
                  <span className="log-pts">+{entryPoints(e)}</span>
                </button>
                {open === e.id && (
                  <div className="log-more">
                    {e.photoUrl && <img src={e.photoUrl} alt={`Storm on ${niceDay(e.day)}`} loading="lazy" />}
                    <p>{(e.saw || []).map((s) => sightingById[s]?.label).join(', ')}{e.hail ? ` (${HAIL_SIZES.find((h) => h.id === e.hail)?.label.toLowerCase()} size hail)` : ''}</p>
                    <p className="hint">Watched from: {WATCHED_FROM.find((w) => w.id === e.from)?.label || 'home'}{e.weather ? ` · ${icon(e.weather.icon)} ${e.weather.temp ?? ''}${e.weather.units || ''}` : ''}</p>
                    {e.note && <p>“{e.note}”</p>}
                    <button className="link danger" onClick={() => remove(e)}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
