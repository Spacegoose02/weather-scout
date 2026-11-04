import { noteOffline, clearOfflineCache } from './offline.js';

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    noteOffline(path, null);
    const err = new Error(navigator.onLine === false
      ? 'You are offline. Weather Scout will catch up when the connection comes back.'
      : 'Weather Scout could not reach the server. Check the connection and try again.');
    err.offline = true;
    throw err;
  }
  // The service worker answered with a saved copy (offline mode).
  noteOffline(path, res.headers.get('x-offline-saved-at'));
  // Someone signed in or out: saved answers belong to the old account.
  if (method !== 'GET' && path.startsWith('/api/auth/')) clearOfflineCache();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
