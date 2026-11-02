import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { registerKidZone } from './kidzone.js';
import { loadConfig, loadOrCreateSecret } from './config.js';
import { TtlCache, UpstreamError } from './cache.js';
import { openDb, publicUser } from './db.js';
import { AuthService, AuthError, SESSION_COOKIE } from './auth.js';
import { CameraService } from './providers/cameras/index.js';
import * as openMeteo from './providers/openmeteo.js';
import * as nws from './providers/nws.js';
import { radarFrames } from './providers/radar.js';
import { kidReport } from './kid.js';

const MIN = 60_000;

export async function buildApp({ config, fetchImpl = fetch, logger = true } = {}) {
  const cfg = config || loadConfig();
  const app = Fastify({ logger, trustProxy: true });
  const cache = new TtlCache();
  const db = openDb(cfg.dataDir);
  const auth = new AuthService(db, cfg);
  const cameras = new CameraService(cfg, cache, fetchImpl);
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
    if (OPEN.has(req.url.split('?')[0]) || req.user) return;
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
      fetchedAt: new Date().toISOString(),
    };
  });

  app.get('/api/forecast', { schema: latLonSchema }, async (req) => forecast(loc(req.query)));
  app.get('/api/alerts', { schema: latLonSchema }, async (req) => alerts(loc(req.query)));
  app.get('/api/air', { schema: latLonSchema }, async (req) => air(loc(req.query)));
  app.get('/api/radar', async () => radarFrames());

  // ---- kid zone (saved progress, seasons photos, forecaster, field trips) ----
  registerKidZone(app, { db, cameras, cache, fetchImpl, requireUser, latLonSchema, loc });

  app.get('/api/geocode', {
    schema: { querystring: { type: 'object', required: ['q'], properties: { q: { type: 'string', minLength: 2, maxLength: 100 } } } },
  }, async (req) => cache.wrap(`geo:${req.query.q.toLowerCase()}`, 24 * 60 * MIN, () => openMeteo.geocode(req.query.q, fetchImpl)));

  app.get('/api/reverse-geocode', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    return cache.wrap(`rgeo:${l.lat},${l.lon}`, 24 * 60 * MIN, () => nws.reverseGeocode(l, { userAgent: cfg.nwsUserAgent, fetchImpl }));
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
    out.cameras = out.cameras.map(({ video, ...c }) => ({ ...c, imageUrl: `/api/cameras/image/${encodeURIComponent(c.id)}`, video }));
    return out;
  });

  app.get('/api/cameras/image/:id', async (req, reply) => {
    const cam = await cameras.findById(req.params.id);
    if (!cam) return reply.code(404).send({ error: 'Unknown camera.' });
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
