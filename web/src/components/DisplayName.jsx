import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

// Lets anyone signed in pick the friendly name Rocky greets them with.
export default function DisplayName({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.displayName === user.username ? '' : user.displayName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/me', { method: 'PATCH', body: { displayName: name } });
      onSaved(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="What should Rocky call you?" onClose={onClose}>
      <form onSubmit={save} className="form">
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={user.username} autoFocus autoComplete="nickname" />
        </label>
        <p className="hint">Rocky uses this to say hi and in your briefings. You still sign in as <strong>{user.username}</strong>. Leave it empty to use your username.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}
