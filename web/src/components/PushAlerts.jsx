import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { pushSupported, secureContext, currentSubscription, enablePush, disablePush } from '../push.js';

const KINDS = [
  ['warning', 'Warnings', 'Tornado, severe thunderstorm, flash flood, high wind, winter storm…'],
  ['watch', 'Watches', 'Conditions are right for dangerous weather later.'],
  ['advisory', 'Advisories', 'Wind, fog, frost, heat and other heads-ups.'],
];

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

export default function PushAlerts({ location, saved, onClose }) {
  const places = dedupe([location, ...(saved || [])].filter(Boolean));
  const [status, setStatus] = useState(null);
  const [placeIdx, setPlaceIdx] = useState(0);
  const [levels, setLevels] = useState(['warning']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!pushSupported() || !secureContext()) return setStatus({ subscribed: false });
      const sub = await currentSubscription();
      if (!sub) return setStatus({ subscribed: false });
      const s = await api('/api/push/status', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => ({ subscribed: false }));
      setStatus(s);
      if (s.subscribed) {
        setLevels(s.levels);
        const i = places.findIndex((p) => Math.abs(p.lat - s.place.lat) < 0.01 && Math.abs(p.lon - s.place.lon) < 0.01);
        if (i >= 0) setPlaceIdx(i);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await fn();
      if (done) setMsg(done);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => setStatus(await enablePush({ place: places[placeIdx], levels })), 'Alerts are on for this device.');
  const off = () => run(async () => { await disablePush(); setStatus({ subscribed: false }); }, 'Alerts are off for this device.');
  const test = () => run(async () => {
    const sub = await currentSubscription();
    await api('/api/push/test', { method: 'POST', body: { endpoint: sub.endpoint } });
  }, 'Test sent. It should pop up in a few seconds.');

  const toggle = (k) => setLevels((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  let blocker = null;
  if (!secureContext()) blocker = 'Your browser only allows alerts on a secure (https://) address. Open Weather Scout through your https domain (for example behind your reverse proxy) to turn them on.';
  else if (isIos() && !standalone()) blocker = 'On iPhone and iPad, first add Weather Scout to your Home Screen (Share, then "Add to Home Screen"), open it from there, and come back here.';
  else if (!pushSupported()) blocker = 'This browser does not support push notifications.';

  return (
    <Modal title="Weather alerts on this device" onClose={onClose}>
      <p className="hint">Get a notification on this phone or computer when the National Weather Service issues an alert, even when Weather Scout is closed. Each device picks its own place.</p>
      {blocker ? (
        <p className="error-text" role="alert">{blocker}</p>
      ) : !status ? (
        <p>Checking…</p>
      ) : (
        <div className="form push-form">
          <label>
            Place
            <select value={placeIdx} onChange={(e) => setPlaceIdx(Number(e.target.value))}>
              {places.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Send me</legend>
            {KINDS.map(([k, label, note]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={levels.includes(k)} onChange={() => toggle(k)} />
                <span><strong>{label}</strong> <span className="tile-note">{note}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="row-actions">
            <button onClick={save} disabled={busy || !levels.length}>{status.subscribed ? 'Save' : '🔔 Turn on alerts'}</button>
            {status.subscribed && <button className="ghost" onClick={test} disabled={busy}>Send a test</button>}
            {status.subscribed && <button className="link danger" onClick={off} disabled={busy}>Turn off</button>}
          </div>
          {status.subscribed && <p className="hint">On for <strong>{status.place.name || 'your place'}</strong>{status.lastSentAt ? `, last alert sent ${new Date(`${status.lastSentAt}Z`).toLocaleString()}` : ''}.</p>}
        </div>
      )}
      {msg && <p className="ok-text" role="status">{msg}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </Modal>
  );
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((l) => {
    const k = `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
