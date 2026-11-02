import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { registerKidZone } from './kidzone.js';
import { loadConfig, loadOrCreateSecret } from './config.js';
import { TtlCache, UpstreamError, fetchJson } from './cache.js';
import { openDb, publicUser } from './db.js';
import { AuthService, AuthError, SESSION_COOKIE } from './auth.js';
import { CameraService } from './providers/cameras/index.js';
import * as openMeteo from './providers/openmeteo.js';
import * as nws from './providers/nws.js';
import { radarFrames } from './providers/radar.js';
import { kidReport } from './kid.js';
import { AppKeys } from './appkeys.js';
import { healthReport } from './health.js';
import { moonPhase } from './sky.js';
import { MediaService } from './media.js';
import { PushService, LEVELS } from './push.js';
import { AiService, registerAi } from './ai.js';

const MIN = 60_000;

export async function buildApp({ config, fetchImpl = fetch, logger = true, pushSend } = {}) {
  const cfg = config || loadConfig();
  const app = Fastify({ logger, trustProxy: true });
  const cache = new TtlCache();
  const db = openDb(cfg.dataDir);
  const auth = new AuthService(db, cfg);
  const cameras = new CameraService(cfg, cache, fetchImpl, { retry: { baseDelayMs: Number(cfg.env.CAMERA_RETRY_DELAY_MS) || 1500 } });
  const appKeys = new AppKeys(db);
  const media = new MediaService(db, cache, fetchImpl);
  const push = cfg.push.enabled ? new PushService(db, cfg, { send: pushSend, log: app.log }) : null;
  const ai = new AiService(cfg, { fetchImpl, log: app.log });
  await auth.bootstrapAdmin();

  await app.register(fastifyCookie, { secret: loadOrCreateSecret(cfg) });

  // ---- who is this? -------------------------------------------------------
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    let user = await auth.userFromProxyHeaders(req.headers);
    if (!user) {
      const raw = req.cookies[SESSION_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : null;
      if (unsigned?.valid) user = auth.userFromSession(unsigned.value);
    }
    req.user = user || null;
  });

  const OPEN = new Set(['/api/health', '/api/config', '/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/auth/setup']);
  app.addHook('preHandler', async (req, reply) => {
    if (!cfg.auth.required || !req.url.startsWith('/api/')) return;
    if (OPEN.has(req.url.split('?')[0]) || req.user || req.url.startsWith('/api/connect/')) return;
    reply.code(401).send({ error: 'Please sign in.' });
  });

  const requireUser = async (req, reply) => {
    if (!req.user) reply.code(401).send({ error: 'Please sign in.' });
  };
  const requireAdmin = async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Please sign in.' });
    if (!req.user.is_admin) return reply.code(403).send({ error: 'Admins only.' });
  };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof UpstreamError || err.name === 'TimeoutError' || err.cause?.code) {
      req.log.warn({ err }, 'upstream failure');
      return reply.code(502).send({ error: `Could not reach ${err.source || 'a weather service'} right now. Try again in a minute.` });
    }
    if (err.validation) return reply.code(400).send({ error: err.message });
    req.log.error(err);
    return reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: err.statusCode < 500 ? err.message : 'Something went wrong.' });
  });

  // ---- helpers ------------------------------------------------------------
  const latLonSchema = {
    querystring: {
      type: 'object',
      required: ['lat', 'lon'],
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        units: { type: 'string', enum: ['imperial', 'metric'] },
      },
    },
  };
  // Round to ~1 km so nearby requests share a cache entry.
  const loc = (q) => ({ lat: Math.round(q.lat * 100) / 100, lon: Math.round(q.lon * 100) / 100, units: q.units || cfg.units });
  const key = (prefix, l) => `${prefix}:${l.lat},${l.lon},${l.units}`;

  const forecast = (l) => cache.wrap(key('fc', l), 10 * MIN, () => openMeteo.getForecast(l, fetchImpl));
  const alerts = (l) => cache.wrap(key('al', { ...l, units: '' }), 2 * MIN, () => nws.getAlerts(l, { userAgent: cfg.nwsUserAgent, fetchImpl }));
  const air = (l) => cache.wrap(key('aq', { ...l, units: '' }), 30 * MIN, () => openMeteo.getAirQuality(l, fetchImpl));
  const settle = async (p) => {
    try {
      return await p;
    } catch (err) {
      app.log.warn({ err: err.message }, 'optional data source failed');
      return null;
    }
  };

  // ---- public ---------------------------------------------------------------
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/config', async (req) => ({
    defaultLocation: cfg.defaultLocation,
    units: cfg.units,
    auth: {
      required: cfg.auth.required,
      sso: cfg.auth.trustProxyHeaders,
      ssoLogoutUrl: cfg.auth.ssoLogoutUrl || null,
      needsSetup: auth.userCount() === 0 && !cfg.auth.trustProxyHeaders,
    },
    user: publicUser(req.user),
    ai: ai.status(),
  }));

  // ---- weather --------------------------------------------------------------
  app.get('/api/weather', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    const [fc, al, aq] = await Promise.all([forecast(l), settle(alerts(l)), settle(air(l))]);
    const alertList = al?.alerts || [];
    return {
      location: l,
      forecast: fc,
      alerts: alertList,
      alertsAvailable: !!al,
      air: aq,
      kid: kidReport(fc, { alerts: alertList, air: aq }),
      health: healthReport(fc),
      moon: moonPhase(),
      fetchedAt: new Date().toISOString(),
    };
  });

  app.get('/api/forecast', { schema: latLonSchema }, async (req) => forecast(loc(req.query)));
  app.get('/api/alerts', { schema: latLonSchema }, async (req) => alerts(loc(req.query)));
  app.get('/api/air', { schema: latLonSchema }, async (req) => air(loc(req.query)));
  app.get('/api/radar', async () => radarFrames());

  // ---- kid zone (saved progress, seasons photos, forecaster, field trips) ----
  registerKidZone(app, { db, cameras, cache, fetchImpl, requireUser, latLonSchema, loc });

  // ---- AI weather expert, cloud photos, web search ---------------------------
  registerAi(app, { ai, forecast, alerts, air, settle, loc });

  // ---- severe weather push notifications ------------------------------------
  const subSchema = { type: 'object', required: ['endpoint'], properties: { endpoint: { type: 'string', maxLength: 2000 } } };
  const pushOff = (reply) => reply.code(404).send({ error: 'Push notifications are turned off on this server.' });
  app.get('/api/push/key', async (req, reply) => (push ? { publicKey: push.publicKey, levels: LEVELS } : pushOff(reply)));
  app.post('/api/push/status', { schema: { body: subSchema } }, async (req, reply) => (push ? push.status(req.body.endpoint) : pushOff(reply)));
  app.post('/api/push/subscribe', {
    schema: { body: { type: 'object', required: ['subscription', 'place'], properties: { subscription: { type: 'object' }, place: { type: 'object' }, levels: { type: 'array', items: { type: 'string' }, maxItems: 3 } } } },
  }, async (req, reply) => (push ? reply.code(201).send(push.subscribe(req.body, req.user?.id ?? null)) : pushOff(reply)));
  app.post('/api/push/unsubscribe', { schema: { body: subSchema } }, async (req, reply) => (push ? { ok: push.unsubscribe(req.body.endpoint) } : pushOff(reply)));
  app.post('/api/push/test', {
    schema: { body: subSchema },
  }, async (req, reply) => (push ? push.test(req.body.endpoint) : pushOff(reply)));
  app.decorate('push', push);
  // NWS alerts for a place, shared with the web app's cache (used by the background push check).
  app.decorate('pushAlerts', (l) => alerts({ ...l, units: '' }));
  app.addHook('onClose', async () => push?.stop());

  // ---- news & videos -------------------------------------------------------
  app.get('/api/news', async () => {
    const [news, videos] = await Promise.all([media.items('rss'), media.items('youtube', 24)]);
    return { news: news.items, videos: videos.items, feeds: [...news.feeds, ...videos.feeds] };
  });

  app.get('/api/geocode', {
    schema: { querystring: { type: 'object', required: ['q'], properties: { q: { type: 'string', minLength: 2, maxLength: 100 } } } },
  }, async (req) => cache.wrap(`geo:${req.query.q.toLowerCase()}`, 24 * 60 * MIN, () => openMeteo.geocode(req.query.q, fetchImpl)));

  app.get('/api/reverse-geocode', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    return cache.wrap(`rgeo:${l.lat},${l.lon}`, 24 * 60 * MIN, () => nws.reverseGeocode(l, { userAgent: cfg.nwsUserAgent, fetchImpl }));
  });

  // Approximate location from the internet connection, for when the browser won't
  // share GPS (plain http, or permission denied). On a home LAN the visitor's IP is
  // private, so we look up the server's own public IP, which is the same house.
  const PRIVATE_IP = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80:|::ffff:(127|10|192\.168)\.)/i;
  app.get('/api/ip-location', async (req, reply) => {
    if (/^(0|false|no|off)$/i.test(cfg.env.IP_LOCATION || '')) return reply.code(404).send({ error: 'Approximate location is turned off on this server.' });
    const ip = String(req.ip || '').replace(/^::ffff:(?=\d)/, '');
    const pub = ip && !PRIVATE_IP.test(ip) && /^[\d.:a-f]+$/i.test(ip) ? ip : '';
    const r = await cache.wrap(`ipgeo:${pub || 'self'}`, 24 * 60 * MIN, async () => {
      const raw = await fetchJson(`https://ipapi.co/${pub ? `${pub}/` : ''}json/`, { source: 'ipapi.co', fetchImpl, headers: { 'user-agent': cfg.nwsUserAgent } });
      if (raw.error || !Number.isFinite(raw.latitude)) throw new UpstreamError('ipapi.co', 502, raw.reason || 'no location for this connection');
      return {
        name: [raw.city, raw.country_code === 'US' ? raw.region_code : raw.country_name].filter(Boolean).join(', ') || 'Approximate location',
        lat: Math.round(raw.latitude * 100) / 100,
        lon: Math.round(raw.longitude * 100) / 100,
        approximate: true,
      };
    });
    return r;
  });

  // ---- cameras ----------------------------------------------------------------
  app.get('/api/cameras', {
    schema: {
      querystring: {
        type: 'object',
        required: ['south', 'west', 'north', 'east'],
        properties: {
          south: { type: 'number' }, west: { type: 'number' }, north: { type: 'number' }, east: { type: 'number' },
        },
      },
    },
  }, async (req) => {
    const out = await cameras.inBounds(req.query);
    // Images are served through our proxy so http-only DOT cameras work on an https site.
    out.cameras = out.cameras.map((c) => ({ ...c, imageUrl: c.hasImage ? `/api/cameras/image/${encodeURIComponent(c.id)}` : null }));
    return out;
  });

  app.get('/api/cameras/image/:id', async (req, reply) => {
    const cam = await cameras.findById(req.params.id);
    if (!cam?.image) return reply.code(404).send({ error: 'Unknown camera.' });
    const res = await fetchImpl(cam.image, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': cfg.nwsUserAgent } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) return reply.code(502).send({ error: 'Camera image unavailable.' });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return reply.code(502).send({ error: 'Camera image too large.' });
    return reply.header('content-type', type).header('cache-control', 'public, max-age=60').send(buf);
  });

  // ---- auth -----------------------------------------------------------------
  const setSession = (reply, session) => {
    reply.setCookie(SESSION_COOKIE, session.token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.auth.secureCookies, signed: true, expires: new Date(session.expires),
    });
  };

  app.get('/api/auth/me', async (req) => ({ user: publicUser(req.user) }));

  const credsSchema = {
    body: {
      type: 'object', required: ['username', 'password'],
      properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 200 }, displayName: { type: 'string', maxLength: 64 } },
    },
  };

  app.post('/api/auth/login', { schema: credsSchema }, async (req, reply) => {
    const session = await auth.login(req.body.username, req.body.password);
    setSession(reply, session);
    return { user: publicUser(auth.userFromSession(session.token)) };
  });

  // First-run: the very first account created becomes the admin.
  app.post('/api/auth/setup', { schema: credsSchema }, async (req, reply) => {
    if (auth.userCount() > 0) return reply.code(409).send({ error: 'Setup is already done.' });
    const user = await auth.createUser({ ...req.body, isAdmin: true });
    setSession(reply, auth.createSession(user.id));
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    const unsigned = raw ? req.unsignCookie(raw) : null;
    if (unsigned?.valid) auth.destroySession(unsigned.value);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true, ssoLogoutUrl: cfg.auth.trustProxyHeaders ? cfg.auth.ssoLogoutUrl || null : null };
  });

  // ---- profile ---------------------------------------------------------------
  app.get('/api/me/preferences', { preHandler: requireUser }, async (req) => publicUser(req.user).preferences);
  app.put('/api/me/preferences', { preHandler: requireUser, schema: { body: { type: 'object' } } }, async (req) =>
    publicUser(auth.setPreferences(req.user.id, req.body)).preferences);

  // ---- admin -----------------------------------------------------------------
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => ({ users: auth.listUsers() }));
  app.post('/api/admin/users', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['username'],
        properties: {
          username: { type: 'string' }, password: { type: 'string' }, displayName: { type: 'string' },
          isAdmin: { type: 'boolean' }, ssoSubject: { type: 'string' },
        },
      },
    },
  }, async (req) => ({ user: publicUser(await auth.createUser(req.body)) }));
  app.patch('/api/admin/users/:id', { preHandler: requireAdmin, schema: { body: { type: 'object' } } }, async (req) => ({
    user: publicUser(await auth.updateUser(Number(req.params.id), req.body)),
  }));
  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (req) => {
    auth.deleteUser(Number(req.params.id));
    return { ok: true };
  });
  app.get('/api/admin/cameras', { preHandler: requireAdmin }, async () => ({ feeds: (await cameras.all()).feeds }));
  app.get('/api/admin/media', { preHandler: requireAdmin }, async () => ({ feeds: media.list() }));
  app.post('/api/admin/media', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['kind', 'url'], properties: { kind: { type: 'string', enum: ['rss', 'youtube'] }, url: { type: 'string', minLength: 3, maxLength: 500 }, title: { type: 'string', maxLength: 80 } } } },
  }, async (req, reply) => {
    try {
      return reply.code(201).send({ feed: await media.add(req.body) });
    } catch (err) {
      if (err instanceof UpstreamError) return reply.code(400).send({ error: `Could not reach that address (${err.status}).` });
      if (!err.statusCode && !err.cause) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
  app.delete('/api/admin/media/:id', { preHandler: requireAdmin }, async (req, reply) =>
    media.remove(Number(req.params.id)) ? { ok: true } : reply.code(404).send({ error: 'Not found' }));
  app.get('/api/admin/app-keys', { preHandler: requireAdmin }, async () => ({ keys: appKeys.list() }));
  app.post('/api/admin/app-keys', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } } },
  }, async (req) => appKeys.create(req.body.name));
  app.delete('/api/admin/app-keys/:id', { preHandler: requireAdmin }, async (req, reply) =>
    (appKeys.revoke(Number(req.params.id)) ? { ok: true } : reply.code(404).send({ error: 'No such key.' })));

  // ---- other family apps ------------------------------------------------------
  // A compact, kid-safe summary for Den-Duty's boards and family wall (and Home
  // Assistant or scripts). Needs an app key from Family & settings. Location
  // defaults to the server's home location.
  app.get('/api/connect/summary', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90 },
          lon: { type: 'number', minimum: -180, maximum: 180 },
          units: { type: 'string', enum: ['imperial', 'metric'] },
        },
      },
    },
  }, async (req, reply) => {
    if (!appKeys.check(req.headers.authorization)) {
      return reply.code(401).header('www-authenticate', 'Bearer').send({ error: 'A Weather Scout app key is needed (Family & settings, Connected apps).' });
    }
    const home = cfg.defaultLocation;
    const l = loc({ lat: req.query.lat ?? home.lat, lon: req.query.lon ?? home.lon, units: req.query.units });
    const [fc, al, aq] = await Promise.all([forecast(l), settle(alerts(l)), settle(air(l))]);
    const alertList = al?.alerts || [];
    const kid = kidReport(fc, { alerts: alertList, air: aq });
    const c = fc.current;
    const today = fc.daily[0] || {};
    return {
      location: { name: req.query.lat == null ? home.name : null, lat: l.lat, lon: l.lon },
      units: fc.units,
      current: { temp: c.temp, feelsLike: c.feelsLike, icon: c.icon, label: c.label, kidLabel: c.kidLabel, isDay: c.isDay, windSpeed: c.windSpeed, uv: c.uv },
      today: { high: today.high ?? null, low: today.low ?? null, precipChance: today.precipChance ?? null, icon: today.icon ?? null, kidLabel: today.kidLabel ?? null },
      // Paths are relative to this server, so connected apps can show the same Rocky.
      raccoon: { ...kid.raccoon, art: { full: '/rocky/rocky.png', face: '/rocky/rocky-face.png', icon: '/icon-192.png' } },
      checklist: kid.checklist,
      playground: kid.playground,
      sky: kid.sky,
      airQuality: aq?.aqi != null ? { aqi: aq.aqi, label: aq.category?.label, color: aq.category?.color, kid: aq.category?.kid } : null,
      alerts: alertList.map((a) => ({ id: a.id, event: a.event, severity: a.severity, headline: a.headline, kid: a.kid, ends: a.ends })),
      alertsAvailable: !!al,
      updatedAt: new Date().toISOString(),
    };
  });

  // ---- web app ---------------------------------------------------------------
  if (fs.existsSync(cfg.webDist)) {
    await app.register(fastifyStatic, { root: cfg.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found.' });
      const file = path.join(cfg.webDist, req.url.split('?')[0]);
      if (file.startsWith(cfg.webDist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return reply.sendFile(path.relative(cfg.webDist, file));
      }
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => db.close());
  return app;
}
