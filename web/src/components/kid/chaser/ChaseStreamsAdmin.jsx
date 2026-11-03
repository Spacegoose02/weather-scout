import { useEffect, useState } from 'react';
import { api } from '../../../api.js';

// Family & settings: the storm chaser YouTube channels or live videos kids can
// watch in Kid Zone › Storm Chaser › Live chase. Only these ever show.
export default function ChaseStreamsAdmin() {
  const [streams, setStreams] = useState([]);
  const [form, setForm] = useState({ url: '', title: '', anytime: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/admin/chase-streams').then((r) => setStreams(r.streams)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    act(async () => {
      await api('/api/admin/chase-streams', { method: 'POST', body: { url: form.url, title: form.title || undefined, anytime: form.anytime } });
      setForm({ url: '', title: '', anytime: false });
    });
  };
  const patch = (s, body) => act(() => api(`/api/admin/chase-streams/${s.id}`, { method: 'PATCH', body }));

  return (
    <div className="chase-admin">
      <h3>Live storm chasers</h3>
      <p className="hint">YouTube storm chaser channels (or a single live video) for Kid Zone › Storm Chaser › Live chase. Kids only see the ones you add here, only while a tornado or severe thunderstorm warning is up somewhere in the US (unless you tick “anytime”), and streams start muted. Pick chasers you have watched and trust with kids.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {streams.length > 0 && (
        <table className="users">
          <thead><tr><th>Chaser</th><th>Type</th><th>Anytime</th><th>On</th><th /></tr></thead>
          <tbody>
            {streams.map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.kind === 'channel' ? 'Channel' : 'Video'}</td>
                <td><input type="checkbox" checked={s.anytime} onChange={(e) => patch(s, { anytime: e.target.checked })} aria-label={`Show ${s.title} without warnings`} /></td>
                <td><input type="checkbox" checked={s.enabled} onChange={(e) => patch(s, { enabled: e.target.checked })} aria-label={`${s.title} on`} /></td>
                <td><button className="link" onClick={() => confirm(`Remove ${s.title}?`) && act(() => api(`/api/admin/chase-streams/${s.id}`, { method: 'DELETE' }))}>remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="form inline" onSubmit={add}>
        <input required placeholder="YouTube channel link, @handle or live video link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <input placeholder="Name (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label><input type="checkbox" checked={form.anytime} onChange={(e) => setForm({ ...form, anytime: e.target.checked })} /> anytime</label>
        <button disabled={busy}>Add chaser</button>
      </form>
    </div>
  );
}
