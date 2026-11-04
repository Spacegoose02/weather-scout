import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { REPORT_KINDS, REPORT_KIND, HAIL_SIZES, hailLabel, NOTE_MAX } from '../../../../shared/hazards.js';

const ago = (t, now = Date.now()) => {
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr${h === 1 ? '' : 's'} ago`;
};

export function reportLine(r) {
  const size = r.kind === 'hail' && r.magnitude ? ` (${hailLabel(r.magnitude) || `${r.magnitude} in`})` : r.magnitude ? ` (${r.magnitude}${r.unit ? ` ${r.unit.toLowerCase()}` : ''})` : '';
  return `${r.label}${size}`;
}

// "What's falling where you are?": one-tap reports from the family, next to
// the National Weather Service's spotter reports nearby.
export default function Reports({ location, user, kidMode, size, onSignIn }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [picking, setPicking] = useState(false);
  const [kind, setKind] = useState(null);
  const [hail, setHail] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState('');

  const load = useCallback(() => api(`/api/reports/near?lat=${location.lat}&lon=${location.lon}&miles=25`).then(setData).catch((e) => setErr(e.message)), [location.lat, location.lon]);
  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/api/reports', { method: 'POST', body: { kind, hail: REPORT_KIND[kind].hail ? hail : null, note: kidMode ? '' : note, lat: location.lat, lon: location.lon } });
      setThanks(kidMode ? `${REPORT_KIND[kind].emoji} ${REPORT_KIND[kind].kid} You're a weather reporter!` : 'Thanks! Your report is on the map for 24 hours.');
      setPicking(false);
      setKind(null);
      setHail(null);
      setNote('');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    await api(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => setErr(e.message));
    load();
  };

  const list = data?.reports || [];
  const shown = size === 's' ? list.slice(0, 3) : size === 'l' ? list.slice(0, 10) : list.slice(0, 6);
  return (
    <section className={`card dash-reports ${size}`}>
      <div className="card-title">
        <h2>📣 {kidMode ? 'Weather reporters' : 'Weather reports near you'}</h2>
        {!picking && <button className="ghost small" onClick={() => (user ? setPicking(true) : onSignIn?.())}>{user ? '＋ Report' : 'Sign in to report'}</button>}
      </div>

      {picking && (
        <div className="report-form">
          <p className="hint">{kidMode ? 'What do you see outside right now?' : 'What is happening where you are right now?'}</p>
          <div className="report-kinds" role="group" aria-label="What you see">
            {REPORT_KINDS.map((k) => (
              <button key={k.id} className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                <span aria-hidden>{k.emoji}</span> {k.label}
              </button>
            ))}
          </div>
          {kind && REPORT_KIND[kind].hail && (
            <div className="report-kinds hail" role="group" aria-label="Hail size">
              {HAIL_SIZES.map((h) => <button key={h.in} className={hail === h.in ? 'on' : ''} aria-pressed={hail === h.in} onClick={() => setHail(h.in)}>{h.label}</button>)}
            </div>
          )}
          {!kidMode && kind && (
            <label className="report-note">
              Note (optional)
              <input value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Big drops, street flooding on Main St…" />
            </label>
          )}
          <div className="row-actions">
            <button onClick={send} disabled={busy || !kind || (REPORT_KIND[kind]?.hail && !hail)}>Send report</button>
            <button className="link" onClick={() => { setPicking(false); setKind(null); }}>Cancel</button>
          </div>
          <p className="hint">Your report shows on the map near {location.name || 'this place'} (to about half a mile) with your first name, for 24 hours.</p>
        </div>
      )}
      {thanks && !picking && <p className="ok-text" role="status">{thanks}</p>}
      {err && <p className="error-text" role="alert">{err}</p>}

      {!data && !err && <p className="hint">Looking for reports…</p>}
      {data && !list.length && <p className="hint">No reports within 25 miles in the last day. {user ? 'Be the first!' : ''}</p>}
      {shown.length > 0 && (
        <ul className="report-list">
          {shown.map((r) => (
            <li key={r.id} className={r.source}>
              <span className="report-emoji" aria-hidden>{r.emoji}</span>
              <span className="report-what"><strong>{reportLine(r)}</strong>{r.remark && !kidMode && <span className="hint"> · {r.remark}</span>}</span>
              <span className="report-meta hint">
                {r.miles < 1 ? 'here' : `${Math.round(r.miles)} mi ${r.dir}`} · {ago(r.t)} · {r.source === 'family' ? r.by : r.by || 'NWS'}
                {r.source === 'family' && (r.userId === data.me || user?.isAdmin) && <button className="link small" onClick={() => remove(r.id)} aria-label="Remove this report">✕</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="source">Family reports from Weather Scout{data?.nwsAvailable === false ? '' : ', plus National Weather Service storm reports (via Iowa Environmental Mesonet)'}.</p>
    </section>
  );
}
