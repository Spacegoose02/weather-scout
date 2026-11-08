// Instant updates from the server (see server/src/live.js). One EventSource per
// open app; the browser reconnects on its own after a drop. Every message is
// also re-sent as a window event ("weatherscout:live") so any card can listen.
import { useEffect, useRef, useState } from 'react';

export const LIVE_EVENT = 'weatherscout:live';

// "New: Tornado Warning" / "Ended: Flood Watch" for the little live notice.
export function liveNote(kind, data) {
  if (kind === 'alerts') {
    if (data.added?.length) return `⚠️ New: ${data.added.map((a) => a.event).join(', ')}`;
    if (data.ended?.length) return `✅ Ended: ${data.ended.map((a) => a.event).join(', ')}`;
    return '';
  }
  if (kind === 'storm') return `⛈️ A storm is heading this way${data.eta != null ? ` (about ${Math.max(5, Math.round(data.eta / 5) * 5)} min)` : ''}`;
  return '';
}

export function useLive(location, units, { onAlerts } = {}) {
  const [state, setState] = useState({ connected: false, note: '' });
  const cb = useRef(onAlerts);
  cb.current = onAlerts;
  useEffect(() => {
    if (!location || typeof EventSource === 'undefined') return undefined;
    const es = new EventSource(`/api/live?lat=${location.lat}&lon=${location.lon}&units=${units}`);
    let clear;
    const handle = (kind) => (e) => {
      let data = {};
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: { kind, data } }));
      if (kind === 'alerts') cb.current?.(data);
      const note = liveNote(kind, data);
      if (note) {
        setState((s) => ({ ...s, note }));
        clearTimeout(clear);
        clear = setTimeout(() => setState((s) => ({ ...s, note: '' })), 60_000);
      }
    };
    es.addEventListener('hello', () => setState((s) => ({ ...s, connected: true })));
    es.addEventListener('alerts', handle('alerts'));
    es.addEventListener('storm', handle('storm'));
    es.addEventListener('busy', () => es.close());
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    return () => { es.close(); clearTimeout(clear); };
  }, [location?.lat, location?.lon, units]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
