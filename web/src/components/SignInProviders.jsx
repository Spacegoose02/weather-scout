import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

// Family & settings → Sign-in providers. OpenID Connect apps (your own
// Tinyauth, Authelia, Authentik, Pocket ID, or Google) that get a
// "Sign in with …" button. The client secret goes to the server and never
// comes back; leaving the box empty on an edit keeps the saved one.
const EMPTY = { name: '', issuer: '', clientId: '', clientSecret: '', scopes: '', autoCreate: false, showOnLogin: true };

function ProviderForm({ provider, callbackUrl, onClose, onSaved }) {
  const [form, setForm] = useState(provider ? { ...EMPTY, ...provider, clientSecret: '' } : EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { name: form.name, issuer: form.issuer, clientId: form.clientId, scopes: form.scopes, autoCreate: form.autoCreate, showOnLogin: form.showOnLogin };
    if (form.clientSecret.trim()) body.clientSecret = form.clientSecret;
    try {
      if (provider) await api(`/api/admin/oidc-providers/${provider.id}`, { method: 'PATCH', body });
      else await api('/api/admin/oidc-providers', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={provider ? `Edit ${provider.name}` : 'Add a sign-in provider'} onClose={onClose}>
      <form className="form oidc-form" onSubmit={save}>
        <label>Name on the sign-in button
          <input value={form.name} onChange={set('name')} required maxLength={40} placeholder="Tinyauth" autoFocus />
        </label>
        <label>Issuer URL
          <input className="mono" value={form.issuer} onChange={set('issuer')} required placeholder="https://auth.example.com" inputMode="url" />
        </label>
        <label>Client ID
          <input className="mono" value={form.clientId} onChange={set('clientId')} required autoComplete="off" />
        </label>
        <label>Client secret
          <input className="mono" type="password" value={form.clientSecret} onChange={set('clientSecret')} autoComplete="new-password"
            placeholder={provider?.hasSecret ? 'Saved; leave empty to keep it' : 'From your sign-in provider'} />
        </label>
        <label><span>Extra scopes <span className="hint">(optional)</span></span>
          <input className="mono" value={form.scopes} onChange={set('scopes')} placeholder="openid, profile and email are always asked for" />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.autoCreate} onChange={set('autoCreate')} />
          Create an account for anyone who signs in with it
        </label>
        <p className="hint oidc-warn">
          Only turn this on for a provider that just lets in people you trust (your own Tinyauth or Authelia). With Google it
          would let anyone with a Google account in. New accounts are regular family members, not admins. When it is off,
          link people first under People (their username or email at the provider).
        </p>
        <label className="check">
          <input type="checkbox" checked={form.showOnLogin} onChange={set('showOnLogin')} />
          Show on the sign-in page
        </label>
        {!provider && callbackUrl && (
          <p className="hint">In your provider, set the redirect (callback) URL to <code>{callbackUrl}</code></p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="oidc-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function SignInProviders() {
  const [providers, setProviders] = useState([]);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | provider
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const r = await api('/api/admin/oidc-providers');
      setProviders(r.providers);
      setCallbackUrl(r.callbackUrl);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const remove = async (p) => {
    if (!confirm(`Remove ${p.name}? Its sign-in button goes away. People keep their profiles and can still use a password or another provider.`)) return;
    try {
      await api(`/api/admin/oidc-providers/${p.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <h3>Sign-in providers</h3>
      <p className="hint">
        Add a <strong>Sign in with…</strong> button for an OpenID Connect app such as Tinyauth, Authelia, Authentik, Pocket ID or
        Google. Make a client there with this redirect URL: <code>{callbackUrl || '…/api/auth/oidc/callback'}</code>
        {callbackUrl && <> <button className="link" onClick={() => navigator.clipboard?.writeText(callbackUrl)}>copy</button></>}
      </p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {providers.length > 0 && (
        <ul className="feeds oidc-list">
          {providers.map((p) => (
            <li key={p.id}>
              🔐 <strong>{p.name}</strong> <span className="hint">{p.issuer}</span>
              {p.autoCreate && <span className="pill">makes accounts</span>}
              {!p.showOnLogin && <span className="pill">hidden</span>}{' '}
              <button className="link" onClick={() => setEditing(p)}>edit</button>
              <button className="link danger" onClick={() => remove(p)}>remove</button>
            </li>
          ))}
        </ul>
      )}
      <button className="ghost" onClick={() => setEditing('new')}>＋ Add a provider</button>
      {editing && (
        <ProviderForm
          provider={editing === 'new' ? null : editing}
          callbackUrl={callbackUrl}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}
