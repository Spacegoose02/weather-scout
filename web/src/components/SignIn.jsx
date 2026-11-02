import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

export default function SignIn({ setup, required, sso, onClose, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: { username, password } });
      onDone(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={setup ? 'Welcome! Create the admin account' : 'Sign in'} onClose={required && !setup ? null : onClose}>
      {setup && <p>This first account manages the family list, SSO links and camera settings.</p>}
      {sso && !setup && <p className="hint">Signed in with single sign-on? Reload the page through your tinyauth URL.</p>}
      <form onSubmit={submit} className="form">
        <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} /></label>
        <label>Password<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup ? 8 : 1} /></label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'One sec…' : setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </Modal>
  );
}
