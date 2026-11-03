// Windy maps (https://www.windy.com): animated wind, gusts, rain, temperature
// and more from ECMWF, GFS and ICON. Two ways to show it:
//   - No key: the free Windy embed (an iframe straight to embed.windy.com).
//   - WINDY_MAP_KEY set: a small page here that runs the Windy Map Forecast
//     API, so the family gets the full map without the embed's limits.
// Windy map keys are browser keys by design (the map runs in the browser and
// Windy checks the site's domain), so the key does end up in this page. It is
// never in /api/config or the repository; set it in the Unraid template.
import { WINDY_LEVELS, WINDY_MODELS, WINDY_OVERLAYS, windyView } from '../../shared/windy.js';

const viewSchema = {
  querystring: {
    type: 'object',
    properties: {
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lon: { type: 'number', minimum: -180, maximum: 180 },
      zoom: { type: 'integer', minimum: 1, maximum: 18 },
      overlay: { type: 'string', maxLength: 20 },
      product: { type: 'string', maxLength: 20 },
      level: { type: 'string', maxLength: 10 },
    },
  },
};

// Only allow what the page needs: Windy's scripts and tiles, plus Leaflet from unpkg.
const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https://api.windy.com https://*.windy.com https://unpkg.com",
  "style-src 'unsafe-inline' https://*.windy.com https://unpkg.com",
  'img-src data: blob: https:',
  'font-src data: https://*.windy.com',
  'connect-src https://*.windy.com https://*.windytv.com https://windy.com',
  'worker-src blob:',
  "frame-ancestors 'self'",
].join('; ');

export function windyMapPage(key, view) {
  const boot = JSON.stringify({ key, ...windyView(view) }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Windy map</title>
<style>html,body,#windy{margin:0;height:100%;width:100%;background:#1d2433}</style>
<script src="https://unpkg.com/leaflet@1.4.0/dist/leaflet.js"></script>
<script src="https://api.windy.com/assets/map-forecast/libBoot.js"></script>
</head><body><div id="windy"></div>
<script>
const boot = ${boot};
windyInit({ key: boot.key, lat: boot.lat, lon: boot.lon, zoom: boot.zoom, verbose: false }, (windy) => {
  const { store, picker, map } = windy;
  const apply = (v) => {
    for (const k of ['overlay', 'product', 'level']) if (v[k] && store.get(k) !== v[k]) store.set(k, v[k]);
  };
  apply(boot);
  picker.open({ lat: boot.lat, lon: boot.lon });
  // The Weather Scout page changes layers without reloading (each load counts toward the key's quota).
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'windy-view') return;
    apply(e.data);
    if (e.data.lat != null && e.data.lon != null) map.setView([e.data.lat, e.data.lon], e.data.zoom || map.getZoom());
  });
});
</script></body></html>`;
}

export function registerWindy(app, { cfg }) {
  // Read on every request: an admin can change the key in Family & settings.
  const keyOf = () => cfg.windy?.mapKey || '';

  app.get('/api/windy', async () => ({
    mode: keyOf() ? 'api' : 'embed',
    overlays: WINDY_OVERLAYS,
    models: WINDY_MODELS,
    levels: WINDY_LEVELS,
  }));

  app.get('/api/windy/map', { schema: viewSchema }, async (req, reply) => {
    const key = keyOf();
    if (!key) return reply.code(404).send({ error: 'Add a Windy Map Forecast key in Family & settings (or WINDY_MAP_KEY) to use the Windy Map Forecast API. The free embed works without it.' });
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-store')
      .header('content-security-policy', PAGE_CSP)
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'origin')
      .send(windyMapPage(key, req.query));
  });
}
