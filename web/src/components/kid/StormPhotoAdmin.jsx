import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { KIND_LABEL } from '../../kid/stormphoto.js';

const STATUS = { ok: '🟢', missing: '🔴 not found on Commons', 'not-free': '🔴 license not free', unknown: '⚪ could not check' };

// Family & settings: the storm picture list. Hide any picture for everyone,
// or add a freely licensed one from Wikimedia Commons.
export default function StormPhotoAdmin() {
  const [data, setData] = useState({ photos: [] });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'lightning', caption: '', fact: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/admin/storm-photos').then(setData).catch((e) => setError(e.message));
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

  const shown = data.photos.filter((p) => p.status === 'ok' && !p.hidden).length;
  const hidden = data.photos.filter((p) => p.hidden).length;

  return (
    <>
      <h3>Storm picture of the day</h3>
      <p className="hint">
        Real tornado and lightning photos from Wikimedia Commons, all public domain or Creative Commons, with credit shown under each one.
        {' '}{shown} in the rotation{hidden ? `, ${hidden} hidden` : ''}.
        {data.error && <> Could not reach Commons just now ({data.error}).</>}
      </p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide the list' : 'Show every picture'}</button>
      {open && (
        <ul className="feeds storm-admin">
          {data.photos.map((p) => (
            <li key={p.key}>
              {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" width="64" height="43" style={{ objectFit: 'cover', borderRadius: 6, verticalAlign: 'middle', marginRight: 8, opacity: p.hidden ? 0.4 : 1 }} />}
              {p.hidden ? '🙈' : STATUS[p.status] || p.status} {KIND_LABEL[p.kind]}:{' '}
              {p.pageUrl ? <a href={p.pageUrl} target="_blank" rel="noopener noreferrer">{p.title.slice(5)}</a> : p.title.slice(5)}
              {p.license && <span className="hint"> ({p.license}{p.artist ? `, ${p.artist}` : ''})</span>}
              {p.custom && <span className="hint"> added by you</span>}{' '}
              {p.status === 'ok' && (
                <button className="link" disabled={busy} onClick={() => act(() => api('/api/admin/storm-photos/hidden', { method: 'POST', body: { title: p.title, hidden: !p.hidden } }))}>
                  {p.hidden ? 'bring back' : 'hide'}
                </button>
              )}{' '}
              {p.custom && <button className="link" disabled={busy} onClick={() => act(() => api(`/api/admin/storm-photos/${p.id}`, { method: 'DELETE' }))}>remove</button>}
            </li>
          ))}
        </ul>
      )}
      <form className="form inline" onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          await api('/api/admin/storm-photos', { method: 'POST', body: form });
          setForm({ title: '', kind: form.kind, caption: '', fact: '' });
        });
      }}>
        <input placeholder="commons.wikimedia.org/wiki/File:…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required aria-label="Commons file" />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Kind">
          <option value="lightning">Lightning</option>
          <option value="tornado">Tornado</option>
          <option value="storm">Other storm</option>
        </select>
        <input placeholder="Caption for kids" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} maxLength={240} required />
        <input placeholder="Fun fact (optional)" value={form.fact} onChange={(e) => setForm({ ...form, fact: e.target.value })} maxLength={240} />
        <button type="submit" disabled={busy}>Add picture</button>
      </form>
    </>
  );
}
