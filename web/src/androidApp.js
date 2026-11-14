// Is this page running inside the Weather Scout Android app? The app opens the
// server with ?app=android (see android/.../TwaLauncherActivity.java). We
// remember it for this device and tidy the address, so Settings can offer
// "Change server", which hands back to the app's own server picker.

const KEY = 'ws.androidApp';

export function noteAndroidApp(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return;
  try {
    const url = new URL(win.location.href);
    const fromApp = url.searchParams.get('app') === 'android' || String(win.document?.referrer || '').startsWith('android-app://');
    if (fromApp) win.localStorage.setItem(KEY, '1');
    if (url.searchParams.has('app')) {
      url.searchParams.delete('app');
      win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // Private mode or a locked-down browser: just don't show the button.
  }
}

export function inAndroidApp(win = typeof window !== 'undefined' ? window : null) {
  try {
    return win?.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// Opens the app's server picker (the app listens for weatherscout://server).
export const CHANGE_SERVER_URL = 'weatherscout://server';
