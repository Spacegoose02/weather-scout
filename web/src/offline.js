// Offline mode, browser side. The service worker (public/sw.js) answers with a
// saved copy when the network is down and marks it with x-offline-saved-at.
// api.js reports each answer here, and the OfflineBanner listens.

const listeners = new Set();
let state = { offline: false, savedAt: null, reason: null };

function set(next) {
  if (next.offline === state.offline && next.savedAt === state.savedAt && next.reason === state.reason) return;
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
// reason: why the service worker fell back to a saved copy (its
// x-offline-reason header), see offlineReason().
export function noteOffline(path, savedAt, reason = null) {
  const why = savedAt != null ? reason || 'network' : null;
  if (!path.startsWith('/api/weather') && !path.startsWith('/api/config')) {
    if (savedAt != null && !state.offline) set({ offline: true, savedAt: savedAt || null, reason: why });
    return;
  }
  if (savedAt != null) set({ offline: true, savedAt: savedAt || state.savedAt, reason: why });
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) set({ offline: true, savedAt: state.savedAt, reason: state.reason });
  else set({ offline: false, savedAt: null, reason: null });
}

// What the offline banner says, from the service worker's reason.
//   network            no answer at all (server, proxy or Wi-Fi down)
//   slow               no answer within a few seconds
//   signin             the sign-in proxy (Tinyauth) wants a fresh sign-in
//   proxy:502          the reverse proxy answered, Weather Scout behind it didn't
//   upstream:502:msg   Weather Scout answered, a weather service it uses didn't
export function offlineReason(reason) {
  const r = String(reason || 'network');
  if (r === 'signin') return { kind: 'signin', title: 'Your sign-in has run out.', detail: 'Reload to sign in again.' };
  if (r === 'slow') return { kind: 'slow', title: 'The Weather Scout server is taking too long to answer.', detail: '' };
  if (r.startsWith('proxy:')) {
    const code = r.slice(6);
    return { kind: 'proxy', title: 'Weather Scout’s server isn’t answering.', detail: `The web address works, but the app behind it didn’t answer (error ${code}). Check that the Weather Scout container is running.` };
  }
  if (r.startsWith('upstream:')) {
    const [, code, ...rest] = r.split(':');
    const msg = rest.join(':').trim();
    return { kind: 'upstream', title: 'The server is up, but it can’t get fresh weather right now.', detail: msg || `The weather service it uses didn’t answer (error ${code}).` };
  }
  return { kind: 'network', title: 'Weather Scout can’t reach the server right now.', detail: '' };
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
