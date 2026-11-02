import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

export default function Admin({ me, onClose }) {
  const [users, setUsers] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [keyName, setKeyName] = useState('Den-Duty');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', displayName: '', password: '', ssoSubject: '', isAdmin: false });

  const load = async () => {
    try {
      setUsers((await api('/api/admin/users')).users);
      setKeys((await api('/api/admin/app-keys')).keys);
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

      <h3>Camera feeds</h3>
      {feeds.length === 0 ? (
        <p className="hint">No feeds configured. Copy <code>cameras.example.json</code> to <code>/data/cameras.json</code> and put API keys in environment variables.</p>
      ) : (
        <ul className="feeds">
          {feeds.map((f) => <li key={f.id}>{f.ok ? '🟢' : '🔴'} {f.name}: {f.ok ? `${f.count} cameras` : f.error}</li>)}
        </ul>
      )}
    </Modal>
  );
}
