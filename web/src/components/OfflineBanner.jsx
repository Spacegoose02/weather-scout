import { useEffect, useState } from 'react';
import { onOffline, offlineState, offlineReason, savedLabel, ageWords } from '../offline.js';

// "You're offline, showing the weather from 2:40 PM." Shows when the browser
// loses its connection or the service worker answers with a saved copy.
export default function OfflineBanner({ onRetry }) {
  const [state, setState] = useState(offlineState);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [, tick] = useState(0);

  useEffect(() => {
    const off = onOffline(setState);
    const up = () => {
      setOnline(true);
      onRetry?.();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => {
      off();
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      clearInterval(id);
    };
  }, [onRetry]);

  if (online && !state.offline) return null;
  const when = state.savedAt ? `${savedLabel(state.savedAt)} (${ageWords(state.savedAt)})` : '';
  const why = offlineReason(state.reason);
  return (
    <div className="offline-banner card" role="status">
      <span className="offline-icon" aria-hidden>📴</span>
      <div>
        <strong>{online ? why.title : 'You’re offline.'}</strong>{' '}
        {online && why.detail && <>{why.detail}{' '}</>}
        {when ? <>Showing the weather saved at {when}.</> : 'Showing what this device saved last.'}{' '}
        <span className="hint">Your safety plan and shelter spot still work. Radar and cameras come back with the connection.</span>
      </div>
      {online && why.kind === 'signin'
        ? <button className="ghost" onClick={() => window.location.reload()}>Sign in again</button>
        : onRetry && <button className="ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}
