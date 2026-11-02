import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { round } from '../../format.js';
import { SKY, SKY_EMOJI, streak, bestStreak, compareForecast, localToday } from '../../dashboard/journal.js';
import { trackProgress } from '../../kid/badges.js';

// Daily observation journal: what did the sky look like, what did your
// thermometer and rain gauge say, and anything else you noticed. One page a day.
export default function Journal({ weather, user, size, onSignIn }) {
  const today = localToday(weather.forecast);
  const units = weather.location?.units || 'imperial';
  const u = weather.forecast.units;
  const fc = weather.forecast.daily[0] || {};
  const [entries, setEntries] = useState(null);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    api('/api/me/journal?limit=120').then((r) => live && setEntries(r.entries)).catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const todays = entries?.find((e) => e.day === today);
  useEffect(() => {
    if (entries) setDraft(todays ? { ...todays } : { sky: [], high: null, low: null, rain: null, note: '' });
  }, [entries == null, todays?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Catch up on streak badges for pages written before badges existed (or on another device).
  useEffect(() => {
    if (entries?.length) trackProgress({ journalPages: entries.length, journalBest: bestStreak(entries) }, { day: today });
  }, [entries == null]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useMemo(() => (entries ? streak(entries, today) : 0), [entries, today]);

  if (!user) {
    return (
      <section className="card dash-journal">
        <h2>📓 Weather journal</h2>
        <p>Write down what the sky did each day: stickers for the clouds and sun, your own thermometer and rain-gauge readings, and what you noticed.</p>
        <button onClick={onSignIn}>Sign in to start a journal</button>
      </section>
    );
  }
  if (!entries || !draft) return <section className="card dash-journal"><h2>📓 Weather journal</h2><p className="hint">Opening your journal…</p></section>;

  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus('');
  };
  const toggleSky = (id) => set({ sky: draft.sky.includes(id) ? draft.sky.filter((x) => x !== id) : [...draft.sky, id].slice(0, 6) });
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const save = async () => {
    setStatus('saving');
    const body = {
      sky: draft.sky,
      high: num(draft.high),
      low: num(draft.low),
      rain: num(draft.rain),
      units,
      note: draft.note || '',
      forecast: { high: fc.high ?? null, low: fc.low ?? null, precip: fc.precipTotal ?? null, icon: fc.icon || undefined, label: fc.kidLabel?.slice(0, 60) || undefined },
    };
    try {
      const r = await api(`/api/me/journal/${today}`, { method: 'PUT', body });
      const list = [{ ...r.entry, updatedAt: new Date().toISOString() }, ...entries.filter((e) => e.day !== today)];
      setEntries(list);
      setStatus('saved');
      trackProgress({ journalPages: list.length, journalBest: bestStreak(list) }, { day: today });
    } catch (e) {
      setStatus(e.message);
    }
  };

  const past = entries.filter((e) => e.day !== today).slice(0, size === 'l' ? 10 : 5);
  const compare = todays && compareForecast(todays, u.temp);

  return (
    <section className={`card dash-journal ${size}`}>
      <div className="card-title">
        <h2>📓 Weather journal</h2>
        <span className="hint">{run > 0 ? `🔥 ${run}-day streak` : 'Start a streak today!'} · {entries.length} page{entries.length === 1 ? '' : 's'}</span>
      </div>

      <div className="journal-body">
        <div className="journal-today">
          <h3>{new Date(`${today}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
          <p className="hint">What did the sky look like?</p>
          <div className="sky-stickers" role="group" aria-label="Sky stickers">
            {SKY.map((s) => (
              <button key={s.id} type="button" className={draft.sky.includes(s.id) ? 'on' : ''} aria-pressed={draft.sky.includes(s.id)} onClick={() => toggleSky(s.id)} title={s.label}>
                <span aria-hidden>{s.emoji}</span><small>{s.label}</small>
              </button>
            ))}
          </div>
          <div className="journal-nums">
            <label>High {u.temp}<input type="number" inputMode="decimal" value={draft.high ?? ''} placeholder={round(fc.high)} onChange={(e) => set({ high: e.target.value })} /></label>
            <label>Low {u.temp}<input type="number" inputMode="decimal" value={draft.low ?? ''} placeholder={round(fc.low)} onChange={(e) => set({ low: e.target.value })} /></label>
            <label>Rain gauge ({u.precip})<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.rain ?? ''} placeholder="0" onChange={(e) => set({ rain: e.target.value })} /></label>
          </div>
          <label className="journal-note">I noticed…
            <textarea maxLength={500} rows={2} value={draft.note || ''} placeholder="Puddles on the slide, a hawk riding the wind…" onChange={(e) => set({ note: e.target.value })} />
          </label>
          <div className="dash-row">
            <button onClick={save} disabled={status === 'saving'}>{todays ? 'Update today’s page' : 'Save today’s page'}</button>
            {status === 'saved' && <span className="hint">Saved ✅</span>}
            {status && status !== 'saved' && status !== 'saving' && <span className="error-text">{status}</span>}
          </div>
          {compare && <p className="hint">{compare}</p>}
        </div>

        {past.length > 0 && (
          <div className="journal-past">
            <h3>Earlier pages</h3>
            <ul>
              {past.map((e) => (
                <li key={e.day}>
                  <button className="journal-page" onClick={() => setOpen(open === e.day ? null : e.day)} aria-expanded={open === e.day}>
                    <span className="jp-day">{new Date(`${e.day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })}</span>
                    <span className="jp-sky" aria-hidden>{(e.sky || []).map((s) => SKY_EMOJI[s]).join('') || '📝'}</span>
                    <span className="jp-temp">{e.high != null ? `${round(e.high)}°` : ''}{e.low != null ? ` / ${round(e.low)}°` : ''}</span>
                  </button>
                  {open === e.day && (
                    <div className="jp-more">
                      {e.rain != null && <p>🌧️ Rain gauge: {e.rain} {e.units === 'metric' ? 'mm' : 'in'}</p>}
                      {e.note && <p>“{e.note}”</p>}
                      {compareForecast(e, '°') && <p className="hint">{compareForecast(e, '°')}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
