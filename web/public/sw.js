// Weather Scout service worker.
// 1. Offline mode: keeps the app itself and the last weather it showed, so
//    Weather Scout still opens (with "showing weather from 2:40 PM") when the
//    internet or the server drops, which is often exactly when a storm hits.
// 2. Shows severe weather alerts, personal alerts and Rocky's morning briefing
//    pushed by the server, even when the app is closed.
// 3. Feeds the Windows 11 widget.
const SHELL = 'ws-shell-v1';
const ASSETS = 'ws-assets-v1';
const API = 'ws-api-v1';
const KEEP = [SHELL, ASSETS, API];
const PRECACHE = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png', '/rocky/rocky.webp', '/rocky/rocky-face.webp'];

// API answers worth keeping for offline use. Everything else (sign-in, admin,
// push, live lightning, camera pictures, radar) always goes to the network.
const OFFLINE_API = [
  '/api/config', '/api/weather', '/api/me/dashboard', '/api/me/preferences', '/api/safety-plan',
  '/api/sky/tonight', '/api/sky/aurora', '/api/tides', '/api/models', '/api/ensemble', '/api/news',
  '/api/storm-photo', '/api/chaser/day', '/api/history', '/api/ocean/discoveries',
  '/api/reports/near', '/api/flood', '/api/fires/near', '/api/models/scorecard',
];
const API_WAIT_MS = 6000; // give up on a slow network after this, when a saved copy exists
const PAGE_WAIT_MS = 4000;

const assetUrls = (html) => [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];

async function precache() {
  const cache = await caches.open(SHELL);
  await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  const page = await cache.match('/');
  if (!page) return;
  const assets = await caches.open(ASSETS);
  await Promise.all(assetUrls(await page.clone().text()).map((u) => assets.add(u).catch(() => {})));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => {}));
});
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

// The app tells us to forget saved answers when someone signs in or out.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'weather-scout:clear-cache') event.waitUntil(caches.delete(API));
});

const timeout = (ms) => new Promise((resolve) => { setTimeout(() => resolve(null), ms); });

// A fresh copy of the page: if it points at a new build, drop the old build's files.
async function savePage(res) {
  const cache = await caches.open(SHELL);
  const old = await cache.match('/');
  const html = await res.clone().text();
  await cache.put('/', res);
  const before = old ? assetUrls(await old.text()).join() : '';
  const now = assetUrls(html);
  if (before && before !== now.join()) {
    await caches.delete(ASSETS);
    const assets = await caches.open(ASSETS);
    await Promise.all(now.map((u) => assets.add(u).catch(() => {})));
  }
}

async function page(event) {
  const net = fetch(event.request).then((res) => {
    if (res.ok && res.type === 'basic') event.waitUntil(savePage(res.clone()));
    return res;
  });
  const saved = await caches.match('/', { cacheName: SHELL });
  if (!saved) return net;
  const res = await Promise.race([net.catch(() => null), timeout(PAGE_WAIT_MS)]);
  return res || saved;
}

async function asset(event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) event.waitUntil(cache.put(event.request, res.clone()));
  return res;
}

// Icons, Rocky art and the like: answer from the cache, refresh in the background.
async function staticFile(event) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(event.request);
  const net = fetch(event.request).then((res) => {
    if (res.ok) event.waitUntil(cache.put(event.request, res.clone()));
    return res;
  });
  if (hit) {
    event.waitUntil(net.catch(() => {}));
    return hit;
  }
  return net;
}

// Saved copies are marked with when they were saved, so the app can say how old they are.
async function markSaved(res) {
  const headers = new Headers(res.headers);
  headers.set('x-offline-saved-at', headers.get('x-saved-at') || '');
  headers.delete('x-saved-at');
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

async function api(event) {
  const cache = await caches.open(API);
  const net = fetch(event.request).then(async (res) => {
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set('x-saved-at', new Date().toISOString());
      const copy = new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers });
      event.waitUntil(cache.put(event.request, copy));
    }
    return res;
  });
  const saved = await cache.match(event.request);
  if (!saved) return net;
  const res = await Promise.race([net.catch(() => null), timeout(API_WAIT_MS)]);
  if (res && (res.ok || res.status === 401 || res.status === 403)) return res;
  event.waitUntil(net.catch(() => {}));
  return markSaved(saved);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') return event.respondWith(page(event));
  if (url.pathname.startsWith('/assets/')) return event.respondWith(asset(event));
  if (url.pathname.startsWith('/api/')) {
    if (OFFLINE_API.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) event.respondWith(api(event));
    return;
  }
  if (/\.(png|webp|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) event.respondWith(staticFile(event));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Weather Scout', body: event.data?.text() || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Weather Scout', {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      requireInteraction: !!data.requireInteraction,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (!open) return self.clients.openWindow(url);
      // A warning tap on an already-open app: show the shelter guide there.
      if (url.includes('shelter=1')) {
        open.postMessage({ type: 'weather-scout:shelter' });
        return open.focus();
      }
      // A link with its own page (like the morning briefing) opens that page in the open window.
      if (url === `${self.location.origin}/`) return open.focus();
      return open.focus().then((w) => (w || open).navigate?.(url)).catch(() => self.clients.openWindow(url));
    }),
  );
});

// ---- Windows 11 widget ---------------------------------------------------------
// When Weather Scout is installed as an app on Windows 11, the Widgets board
// (Win + W) can show a "Today" card. The card layout is an Adaptive Card in
// /widgets/today.json; its data comes from /api/widget/summary. The board does
// not refresh by itself, so this worker re-renders on install, resume, a
// periodic sync and the card's Refresh button. Browsers without widgets skip
// all of this.
const WIDGET_TAG = 'today';

async function renderWidget(widget) {
  const def = widget.definition;
  let template;
  let data;
  try {
    const res = await fetch(def.data, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 401 ? 'Open Weather Scout and sign in to see the weather here.' : 'Weather Scout could not get the weather right now.');
    template = await (await fetch(def.msAcTemplate)).text();
    data = await res.text();
  } catch (err) {
    template = await (await fetch('/widgets/signin.json')).text();
    data = JSON.stringify({ message: err.message || 'Weather Scout is offline.' });
  }
  await self.widgets.updateByTag(def.tag, { template, data });
}

async function renderAllWidgets() {
  if (!self.widgets) return;
  const widget = await self.widgets.getByTag(WIDGET_TAG);
  if (widget && widget.instances?.length) await renderWidget(widget);
}

if (self.widgets) {
  self.addEventListener('widgetinstall', (event) => {
    event.waitUntil((async () => {
      const def = event.widget.definition;
      const tags = (await self.registration.periodicSync?.getTags()) || [];
      if (self.registration.periodicSync && !tags.includes(def.tag)) {
        await self.registration.periodicSync.register(def.tag, { minInterval: (def.update || 900) * 1000 }).catch(() => {});
      }
      await renderWidget(event.widget);
    })());
  });

  self.addEventListener('widgetuninstall', (event) => {
    event.waitUntil((async () => {
      if (event.widget.instances.length <= 1 && self.registration.periodicSync) {
        await self.registration.periodicSync.unregister(event.widget.definition.tag).catch(() => {});
      }
    })());
  });

  self.addEventListener('widgetresume', (event) => event.waitUntil(renderWidget(event.widget)));

  self.addEventListener('widgetclick', (event) => {
    if (event.action === 'open') event.waitUntil(self.clients.openWindow('/'));
    else if (event.action === 'refresh') event.waitUntil(renderWidget(event.widget));
  });

  self.addEventListener('periodicsync', (event) => {
    if (event.tag === WIDGET_TAG) event.waitUntil(renderAllWidgets());
  });

  self.addEventListener('activate', (event) => event.waitUntil(renderAllWidgets()));
}
