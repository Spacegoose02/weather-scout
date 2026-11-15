import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

export default function SignIn({ setup, required, sso, providers = [], initialError = '', onClose, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: setup && displayName.trim() ? { username, password, displayName } : { username, password } });
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
      {!setup && providers.length > 0 && (
        <div className="oidc-buttons">
          {providers.map((p) => (
            // A full page visit: the provider's sign-in page takes over, then sends you back here.
            <a key={p.id} className="button oidc-button" href={`/api/auth/oidc/${p.id}/login`}>🔐 Sign in with {p.name}</a>
          ))}
          <p className="oidc-or hint"><span>or use a Weather Scout password</span></p>
        </div>
      )}
      <form onSubmit={submit} className="form">
        <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} /></label>
        <label>Password<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup ? 8 : 1} /></label>
        {setup && <label>What should Rocky call you? <span className="hint">(optional)</span><input autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder={username || 'Dad, Mom, Sam…'} /></label>}
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'One sec…' : setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </Modal>
  );
}
