import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Family & settings › Email alerts: who gets warning emails, for which place
// and which warnings. Each email also has its own link to change or stop them.
export default function EmailRecipients({ PlaceFinder }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ email: '', name: '', place: null, kinds: null });
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/admin/email-alerts').then((d) => {
    setData(d);
    setForm((f) => ({ ...f, kinds: f.kinds || d.defaults }));
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  if (!data) return error ? <p className="error-text">{error}</p> : null;

  const run = async (fn, ok) => {
    setError('');
    setNote('');
    setBusy(true);
    try {
      const r = await fn();
      setNote(r?.message || ok || '');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const add = () => run(async () => {
    await api('/api/admin/email-alerts', { method: 'POST', body: { email: form.email, name: form.name, place: form.place, kinds: form.kinds } });
    setForm({ email: '', name: '', place: null, kinds: data.defaults });
  }, 'Added.');
  const toggleKind = (k) => setForm((f) => ({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] }));

  return (
    <div className="email-recipients">
      <h4>Who gets warning emails</h4>
      {!data.enabled && <p className="hint">Fill in the mail server above and save first. You can add people now; emails start once mail is set up.</p>}
      {data.enabled && !data.appUrl && <p className="hint">Tip: add the Weather Scout web address above so emails can link to the radar and to a page where each person can change or stop them.</p>}
      {data.recipients.length > 0 ? (
        <ul className="feeds">
          {data.recipients.map((r) => (
            <li key={r.id}>
              <strong>{r.name || r.email}</strong> {r.name && <span className="hint">{r.email}</span>} · {r.place.name || `${r.place.lat}, ${r.place.lon}`}
              <span className="hint"> · {r.kinds.map((k) => data.kinds[k]?.split(' (')[0]).join(', ')}{r.paused ? ' · paused' : ''}{r.lastSentAt ? ` · last sent ${new Date(`${r.lastSentAt}Z`).toLocaleString()}` : ''}</span>
              <span className="row-actions">
                <button type="button" className="link" disabled={busy || !data.enabled} onClick={() => run(() => api(`/api/admin/email-alerts/${r.id}/test`, { method: 'POST' }))}>Send a test</button>
                <button type="button" className="link" disabled={busy} onClick={() => run(() => api(`/api/admin/email-alerts/${r.id}`, { method: 'PATCH', body: { paused: !r.paused } }), r.paused ? 'Resumed.' : 'Paused.')}>{r.paused ? 'Resume' : 'Pause'}</button>
                <button type="button" className="link danger" disabled={busy} onClick={() => run(() => api(`/api/admin/email-alerts/${r.id}`, { method: 'DELETE' }), 'Removed.')}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="hint">No one yet.</p>}

      <fieldset className="email-add">
        <legend>Add someone</legend>
        <div className="ai-row">
          <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="grandma@example.com" /></label>
          <label><span>Name (optional)</span><input type="text" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grandma" /></label>
        </div>
        <p className="hint">Place: {form.place ? <strong>{form.place.name}</strong> : 'find their town below'}</p>
        <PlaceFinder onPick={(h) => setForm((f) => ({ ...f, place: { lat: h.lat, lon: h.lon, name: h.name } }))} />
        <div className="email-kinds">
          {Object.entries(data.kinds).map(([k, label]) => (
            <label key={k}><input type="checkbox" checked={!!form.kinds?.includes(k)} onChange={() => toggleKind(k)} /> {label}</label>
          ))}
        </div>
        <div className="ai-actions"><button type="button" disabled={busy || !form.email || !form.place || !form.kinds?.length} onClick={add}>Add</button></div>
      </fieldset>
      {note && <p className="ok-text" role="status">{note}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
