// Offline mode, browser side. The service worker (public/sw.js) answers with a
// saved copy when the network is down and marks it with x-offline-saved-at.
// api.js reports each answer here, and the OfflineBanner listens.

const listeners = new Set();
let state = { offline: false, savedAt: null };

function set(next) {
  if (next.offline === state.offline && next.savedAt === state.savedAt) return;
  state = next;
  for (const fn of listeners) fn(state);
}

export const offlineState = () => state;

export function onOffline(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// savedAt: ISO time of the saved copy, '' for a saved copy of unknown age,
// null for a fresh answer. A failed request (no answer at all) passes null too
// but counts as offline when the browser says so.
export function noteOffline(path, savedAt) {
  if (!path.startsWith('/api/weather') && !path.startsWith('/api/config')) {
    if (savedAt != null && !state.offline) set({ offline: true, savedAt: savedAt || null });
    return;
  }
  if (savedAt != null) set({ offline: true, savedAt: savedAt || state.savedAt });
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) set({ offline: true, savedAt: state.savedAt });
  else set({ offline: false, savedAt: null });
}

export function clearOfflineCache() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'weather-scout:clear-cache' });
  } catch {
    /* no service worker */
  }
}

// "2:40 PM", or "Tue 2:40 PM" when it is from another day.
export function savedLabel(iso, now = Date.now()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export function ageWords(iso, now = Date.now()) {
  if (!iso) return '';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
