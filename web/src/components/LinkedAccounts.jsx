import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import Modal from './Modal.jsx';

// Settings → Sign-in accounts. Link your own Tinyauth (or other provider)
// account to this profile, so its "Sign in with …" button signs you in here.
// Linking is a full trip to the provider and back, like signing in.
export default function LinkedAccounts({ notice = '', initialError = '', onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(initialError);
  const [done, setDone] = useState(notice);

  const load = () => api('/api/me/identities').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const unlink = async (l) => {
    if (!confirm(t('Unlink your {name} account? Its button will stop signing you in to this profile.', { name: l.name }))) return;
    setError('');
    setDone('');
    try {
      await api(`/api/me/identities/${l.providerId}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const linkedIds = new Set((data?.linked || []).map((l) => l.providerId));
  const canLink = (data?.providers || []).filter((p) => !linkedIds.has(p.id));

  return (
    <Modal title={t('Sign-in accounts')} onClose={onClose}>
      <p className="hint">{t('Link an account you already have, like Tinyauth, to sign in to this profile with one tap.')}</p>
      {done && <p className="ok-text" role="status">✅ {t('Linked your {name} account.', { name: done })}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {!data ? <p className="hint">{t('Loading…')}</p> : (
        <>
          {data.linked.length > 0 && (
            <ul className="feeds oidc-list">
              {data.linked.map((l) => (
                <li key={l.providerId}>
                  🔐 <strong>{l.name}</strong>{l.label && <span className="hint">{l.label}</span>}
                  <button className="link danger" onClick={() => unlink(l)}>{t('unlink')}</button>
                </li>
              ))}
            </ul>
          )}
          {data.linked.length === 0 && data.providers.length > 0 && <p className="hint">{t('Nothing linked yet.')}</p>}
          {data.providers.length === 0 && <p className="hint">{t('No sign-in providers are set up yet. An admin can add Tinyauth in Family & settings.')}</p>}
          {canLink.length > 0 && (
            <div className="oidc-buttons">
              {canLink.map((p) => (
                <a key={p.id} className="button oidc-button" href={`/api/auth/oidc/${p.id}/link`}>🔗 {t('Link {name}', { name: p.name })}</a>
              ))}
            </div>
          )}
          {!data.hasPassword && <p className="hint">{t('You have no Weather Scout password, so keep at least one account linked.')}</p>}
        </>
      )}
    </Modal>
  );
}
