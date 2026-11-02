// Weather Scout service worker: shows severe weather alerts pushed by the server,
// even when the app is closed. It does not cache anything.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
      if (url.includes('shelter=1')) open.postMessage({ type: 'weather-scout:shelter' });
      return open.focus();
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
