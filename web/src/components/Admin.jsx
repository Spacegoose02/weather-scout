import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import IntegrationsPanel from './stations/IntegrationsPanel.jsx';

export default function Admin({ me, onClose }) {
  const [users, setUsers] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [keyName, setKeyName] = useState('Den-Duty');
  const [media, setMedia] = useState([]);
  const [mediaForm, setMediaForm] = useState({ kind: 'youtube', url: '', title: '', scope: 'national', kidSafe: true });
  const [suggestions, setSuggestions] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', displayName: '', password: '', ssoSubject: '', isAdmin: false });

  const load = async () => {
    try {
      setUsers((await api('/api/admin/users')).users);
      setKeys((await api('/api/admin/app-keys')).keys);
      setMedia((await api('/api/admin/media')).feeds);
      setSuggestions((await api('/api/admin/media-suggestions')).suggestions);
      setHidden((await api('/api/admin/media-hidden')).hidden);
      setFeeds((await api('/api/admin/cameras')).feeds);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const create = (e) => {
    e.preventDefault();
    const body = { username: form.username, displayName: form.displayName || form.username, isAdmin: form.isAdmin };
    if (form.password) body.password = form.password;
    if (form.ssoSubject) body.ssoSubject = form.ssoSubject;
    act(async () => {
      await api('/api/admin/users', { method: 'POST', body });
      setForm({ username: '', displayName: '', password: '', ssoSubject: '', isAdmin: false });
    });
  };

  const link = (u) => {
    const subject = prompt(`SSO identity for ${u.username} (the tinyauth username or email). Leave empty to unlink.`, u.ssoSubject || '');
    if (subject === null) return;
    act(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { ssoSubject: subject } }));
  };

  const resetPassword = (u) => {
    const password = prompt(`New password for ${u.username} (8+ characters)`);
    if (password) act(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { password } }));
  };

  return (
    <Modal title="Family & settings" onClose={onClose} wide>
      {error && <p className="error-text" role="alert">{error}</p>}
      <h3>People</h3>
      <table className="users">
        <thead><tr><th>Name</th><th>Username</th><th>SSO link</th><th>Role</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.displayName}</td>
              <td>{u.username}</td>
              <td>{u.ssoSubject || <em>none</em>} <button className="link" onClick={() => link(u)}>{u.ssoSubject ? 'change' : 'link'}</button></td>
              <td>
                <label><input type="checkbox" checked={u.isAdmin} disabled={u.id === me.id} onChange={(e) => act(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { isAdmin: e.target.checked } }))} /> admin</label>
              </td>
              <td className="row-actions">
                <button className="link" onClick={() => resetPassword(u)}>password</button>
                {u.id !== me.id && <button className="link danger" onClick={() => confirm(`Remove ${u.username}?`) && act(() => api(`/api/admin/users/${u.id}`, { method: 'DELETE' }))}>remove</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Add someone</h3>
      <form className="form inline" onSubmit={create}>
        <input placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <input placeholder="password (optional with SSO)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input placeholder="SSO identity (optional)" value={form.ssoSubject} onChange={(e) => setForm({ ...form, ssoSubject: e.target.value })} />
        <label><input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} /> admin</label>
        <button type="submit">Add</button>
      </form>

      <h3>Connected apps</h3>
      <p className="hint">Give Den-Duty (or Home Assistant) a key so it can show the weather card on kid boards and the family wall.</p>
      {keys.length > 0 && (
        <ul className="feeds">
          {keys.map((k) => (
            <li key={k.id}>
              🔑 {k.name} <code>…{k.hint}</code> · {k.lastUsedAt ? `last used ${new Date(`${k.lastUsedAt}Z`).toLocaleString()}` : 'not used yet'}{' '}
              <button className="link danger" onClick={() => confirm(`Remove the key for ${k.name}? It stops working right away.`) && act(() => api(`/api/admin/app-keys/${k.id}`, { method: 'DELETE' }))}>remove</button>
            </li>
          ))}
        </ul>
      )}
      {newKey && (
        <div className="newkey" role="status">
          <p><strong>Copy this key now.</strong> It won't be shown again. In Den-Duty, paste it with this server's address: <code>{window.location.origin}</code></p>
          <code className="keytext">{newKey}</code>{' '}
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(newKey)}>Copy</button>
        </div>
      )}
      <form className="form inline" onSubmit={(e) => {
        e.preventDefault();
        act(async () => setNewKey((await api('/api/admin/app-keys', { method: 'POST', body: { name: keyName } })).key));
      }}>
        <input placeholder="App name" value={keyName} onChange={(e) => setKeyName(e.target.value)} required maxLength={60} />
        <button type="submit">Make a key</button>
      </form>

      <h3>News & videos</h3>
      <p className="hint">
        Your local NWS office shows up on its own. Add more: RSS or Atom news feeds (local TV, NOAA, NASA) and YouTube channels,
        playlists or single videos (paste the link or @handle). Mark each one local or national, and untick <em>kids</em> to keep
        it out of Kid Mode. Kid Mode also skips any story about deaths or injuries.
      </p>
      {media.length > 0 && (
        <table className="users media-admin">
          <thead><tr><th /><th>Name</th><th>Section</th><th>Kids</th><th>On</th><th /></tr></thead>
          <tbody>
            {media.map((m, i) => {
              const patch = (body) => act(() => api(`/api/admin/media/${m.id}`, { method: 'PATCH', body }));
              const sameKind = (j) => media[j]?.kind === m.kind;
              return (
                <tr key={m.id}>
                  <td title={m.kind === 'youtube' ? `YouTube ${m.ytType}` : 'News feed'}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      {m.kind === 'rss' ? '📰' : m.ytType === 'video' ? '🎬' : m.ytType === 'playlist' ? '📼' : '▶️'}
                    </a>
                  </td>
                  <td>
                    <input type="text" defaultValue={m.title} maxLength={80} aria-label="Name" style={m.enabled ? undefined : { opacity: 0.55 }}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== m.title && patch({ title: e.target.value })} />
                  </td>
                  <td>
                    <select value={m.scope} onChange={(e) => patch({ scope: e.target.value })} aria-label="Section">
                      <option value="local">Local</option>
                      <option value="national">National</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={m.kidSafe} onChange={(e) => patch({ kidSafe: e.target.checked })} aria-label="Show in Kid Mode" /></td>
                  <td><input type="checkbox" checked={m.enabled} onChange={(e) => patch({ enabled: e.target.checked })} aria-label="Turned on" /></td>
                  <td className="row-actions">
                    <button className="link" disabled={!sameKind(i - 1)} onClick={() => patch({ move: 'up' })} aria-label="Move up">▲</button>
                    <button className="link" disabled={!sameKind(i + 1)} onClick={() => patch({ move: 'down' })} aria-label="Move down">▼</button>
                    <button className="link danger" onClick={() => confirm(`Remove ${m.title}?`) && act(() => api(`/api/admin/media/${m.id}`, { method: 'DELETE' }))}>remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <form className="form inline" onSubmit={(e) => {
        e.preventDefault();
        const body = { kind: mediaForm.kind, url: mediaForm.url, scope: mediaForm.scope, kidSafe: mediaForm.kidSafe };
        if (mediaForm.title) body.title = mediaForm.title;
        act(async () => {
          await api('/api/admin/media', { method: 'POST', body });
          setMediaForm({ ...mediaForm, url: '', title: '' });
        });
      }}>
        <select value={mediaForm.kind} onChange={(e) => setMediaForm({ ...mediaForm, kind: e.target.value })} aria-label="Type">
          <option value="youtube">YouTube channel, playlist or video</option>
          <option value="rss">News feed (RSS)</option>
        </select>
        <input placeholder={mediaForm.kind === 'youtube' ? 'youtube.com/@channel or a video link' : 'https://…/rss'} value={mediaForm.url} onChange={(e) => setMediaForm({ ...mediaForm, url: e.target.value })} required />
        <input placeholder="Name (optional)" value={mediaForm.title} onChange={(e) => setMediaForm({ ...mediaForm, title: e.target.value })} maxLength={80} />
        <select value={mediaForm.scope} onChange={(e) => setMediaForm({ ...mediaForm, scope: e.target.value })} aria-label="Section">
          <option value="local">Local</option>
          <option value="national">National</option>
        </select>
        <label><input type="checkbox" checked={mediaForm.kidSafe} onChange={(e) => setMediaForm({ ...mediaForm, kidSafe: e.target.checked })} /> kids</label>
        <button type="submit">Add</button>
      </form>
      {suggestions.some((s) => !s.added) && (
        <>
          <p className="hint"><strong>Free sources to try:</strong></p>
          <ul className="feeds">
            {suggestions.filter((s) => !s.added).map((s) => (
              <li key={s.url}>
                📰 {s.title} <span className="hint">({s.note}{s.kidSafe ? '' : ', grown-ups only'})</span>{' '}
                <button className="link" onClick={() => act(() => api('/api/admin/media', { method: 'POST', body: { kind: s.kind, url: s.url, title: s.title, scope: s.scope, kidSafe: s.kidSafe } }))}>add</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {hidden.length > 0 && (
        <>
          <p className="hint"><strong>Hidden stories and videos</strong> (hidden for everyone):</p>
          <ul className="feeds">
            {hidden.map((h) => (
              <li key={h.id}>
                🙈 <a href={h.link} target="_blank" rel="noopener noreferrer">{h.title || h.link}</a>{' '}
                <button className="link" onClick={() => act(() => api(`/api/admin/media-hidden/${h.id}`, { method: 'DELETE' }))}>bring back</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <IntegrationsPanel />

      <h3>Camera feeds</h3>
      {feeds.length === 0 ? (
        <p className="hint">No feeds configured. Copy <code>cameras.example.json</code> to <code>/data/cameras.json</code> and put API keys in environment variables.</p>
      ) : (
        <ul className="feeds">
          {feeds.map((f) => (
            <li key={f.id}>
              {f.ok ? '🟢' : f.stale ? '🟡' : '🔴'} {f.name}:{' '}
              {f.ok ? `${f.count} cameras`
                : f.stale ? `showing ${f.count} saved cameras from ${new Date(f.savedAt).toLocaleString()} (live feed: ${f.error}, retrying automatically)`
                : `${f.error} (retrying automatically)`}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
