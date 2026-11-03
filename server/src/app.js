import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { registerKidZone } from './kidzone.js';
import { registerDashboard } from './dashboard.js';
import { registerSafetyPlan } from './safetyplan.js';
import { registerHistory } from './history.js';
import { loadConfig, loadOrCreateSecret } from './config.js';
import { TtlCache, UpstreamError, fetchJson } from './cache.js';
import { openDb, publicUser } from './db.js';
import { AuthService, AuthError, SESSION_COOKIE } from './auth.js';
import { CameraService } from './providers/cameras/index.js';
import * as openMeteo from './providers/openmeteo.js';
import * as nws from './providers/nws.js';
import { radarFrames } from './providers/radar.js';
import * as severe from './providers/severe.js';
import * as tropics from './providers/tropics.js';
import * as ocean from './providers/ocean.js';
import * as models from './providers/models.js';
import * as modelMaps from './providers/modelmaps.js';
import { MAP_AREAS, MAP_MODELS, gridFor } from '../../shared/modelmap.js';
import { kidReport } from './kid.js';
import { AppKeys } from './appkeys.js';
import { healthReport } from './health.js';
import { moonPhase } from './sky.js';
import { MediaService } from './media.js';
import { ChaserService } from './chasers.js';
import { getOfficeProducts } from './providers/news.js';
import { PushService, LEVELS } from './push.js';
import { AiService, registerAi } from './ai.js';
import { registerTts } from './tts.js';
import { AiSettings, SettingsError, testConnection, previewVoice } from './aisettings.js';
import { registerBriefing, buildBriefing } from './briefing.js';
import { registerWindy } from './windy.js';
import { StationService, registerStations } from './stations.js';
import { HomeAssistantService } from './homeassistant.js';
import { cleanOutfit, rockySvg } from '../../shared/rocky-outfit.js';

const MIN = 60_000;

/** Path of Rocky's picture in this outfit and mood (see /api/connect/rocky.svg). */
function rockyPath({ items, mood }) {
  const o = cleanOutfit(items, mood);
  const q = new URLSearchParams({ items: o.items.join(','), mood: o.mood });
  return `/api/connect/rocky.svg?${q}`;
}

export async function buildApp({ config, fetchImpl = fetch, logger = true, pushSend, mqttConnect } = {}) {
  const cfg = config || loadConfig();
  const app = Fastify({ logger, trustProxy: true });
  const cache = new TtlCache();
  // Rocky's base art as a data: URL for /api/connect/rocky.svg (an SVG shown as an
  // image can't load other files). From the built web app, or web/public in dev.
  let rockyBaseHref;
  const rockyBase = () => {
    if (rockyBaseHref) return rockyBaseHref;
    const file = [path.join(cfg.webDist, 'rocky/rocky.webp'), new URL('../../web/public/rocky/rocky.webp', import.meta.url).pathname]
      .find((f) => fs.existsSync(f));
    if (file) rockyBaseHref = `data:image/webp;base64,${fs.readFileSync(file).toString('base64')}`;
    return rockyBaseHref ?? null;
  };
  const db = openDb(cfg.dataDir);
  const auth = new AuthService(db, cfg);
  const cameras = new CameraService(cfg, cache, fetchImpl, { retry: { baseDelayMs: Number(cfg.env.CAMERA_RETRY_DELAY_MS) || 1500 } });
  const appKeys = new AppKeys(db);
  const media = new MediaService(db, cache, fetchImpl);
  const chasers = new ChaserService(cfg, cache, fetchImpl);
  const push = cfg.push.enabled ? new PushService(db, cfg, { send: pushSend, log: app.log }) : null;
  // Saved admin AI/voice settings win over the env vars; apply them before anything reads cfg.ai.
  const aiSettings = new AiSettings(db, cfg);
  aiSettings.apply();
  const ai = new AiService(cfg, { fetchImpl, log: app.log });
  const stations = new StationService(cfg, { fetchImpl, log: app.log });
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
    if (OPEN.has(req.url.split('?')[0]) || req.user || req.url.startsWith('/api/connect/') || req.url.startsWith('/api/stations/push')) return;
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

  // The compact, kid-safe summary shared by connected apps and the Windows widget.
  // Location defaults to the server's home location.
  const summary = async (q = {}) => {
    const home = cfg.defaultLocation;
    const l = loc({ lat: q.lat ?? home.lat, lon: q.lon ?? home.lon, units: q.units });
    const [fc, al, aq] = await Promise.all([forecast(l), settle(alerts(l)), settle(air(l))]);
    const alertList = al?.alerts || [];
    const kid = kidReport(fc, { alerts: alertList, air: aq });
    const c = fc.current;
    const today = fc.daily[0] || {};
    return {
      location: { name: q.lat == null ? home.name : null, lat: l.lat, lon: l.lon },
      units: fc.units,
      current: { temp: c.temp, feelsLike: c.feelsLike, icon: c.icon, label: c.label, kidLabel: c.kidLabel, isDay: c.isDay, windSpeed: c.windSpeed, uv: c.uv },
      today: { high: today.high ?? null, low: today.low ?? null, precipChance: today.precipChance ?? null, icon: today.icon ?? null, kidLabel: today.kidLabel ?? null },
      // Paths are relative to this server, so connected apps can show the same Rocky.
      // `dressed` is Rocky in today's outfit and mood, one picture ready for an <img>.
      raccoon: { ...kid.raccoon, art: { full: '/rocky/rocky.png', face: '/rocky/rocky-face.png', icon: '/icon-192.png', dressed: rockyPath(kid.raccoon) } },
      checklist: kid.checklist,
      playground: kid.playground,
      sky: kid.sky,
      airQuality: aq?.aqi != null ? { aqi: aq.aqi, label: aq.category?.label, color: aq.category?.color, kid: aq.category?.kid } : null,
      alerts: alertList.map((a) => ({ id: a.id, event: a.event, severity: a.severity, headline: a.headline, kid: a.kid, ends: a.ends })),
      alertsAvailable: !!al,
      // The family's own weather station, when one is reporting (see docs/HOME-ASSISTANT.md).
      station: stations.primary(l.units),
      updatedAt: new Date().toISOString(),
    };
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
    tts: { enabled: !!cfg.tts.url, voice: cfg.tts.url ? cfg.tts.voice : null, fallback: cfg.tts.fallback },
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
  app.get('/api/radar/sites', async () => ({ sites: await cache.wrap('nexrad-sites', 10 * MIN, () => severe.getNexradSites(fetchImpl)) }));
  app.get('/api/alerts/national', async () => cache.wrap('alerts-national', 2 * MIN, () => severe.getNationalAlerts({ userAgent: cfg.nwsUserAgent, fetchImpl })));
  app.get('/api/outlook', {
    schema: { querystring: { type: 'object', properties: { day: { type: 'integer', minimum: 1, maximum: 3 } } } },
  }, async (req) => {
    const day = req.query.day || 1;
    return cache.wrap(`spc:${day}`, 15 * MIN, () => severe.getOutlook(day, fetchImpl));
  });

  // ---- tropics & ocean ---------------------------------------------------------
  const boxSchema = {
    querystring: {
      type: 'object',
      required: ['south', 'west', 'north', 'east'],
      properties: {
        south: { type: 'number', minimum: -90, maximum: 90 }, north: { type: 'number', minimum: -90, maximum: 90 },
        west: { type: 'number', minimum: -540, maximum: 540 }, east: { type: 'number', minimum: -540, maximum: 540 },
        units: { type: 'string', enum: ['imperial', 'metric'] },
      },
    },
  };
  const wrapLon = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
  app.get('/api/tropics', async () => cache.wrap('tropics', 15 * MIN, () => tropics.getStorms(fetchImpl, { log: app.log })));
  app.get('/api/buoys', { schema: boxSchema }, async (req) => {
    const q = req.query;
    const units = q.units || cfg.units;
    const all = await cache.wrap(`buoys:${units}`, 15 * MIN, () => ocean.getBuoys(units, fetchImpl));
    const wide = q.east - q.west >= 360;
    const box = { south: q.south, north: q.north, west: wide ? -180 : wrapLon(q.west), east: wide ? 180 : wrapLon(q.east) };
    const r = ocean.inBox(all, box);
    return { buoys: r.items, total: r.total, truncated: r.truncated, units, source: 'NOAA National Data Buoy Center' };
  });
  // Tide stations in the map view, for the radar map's tide layer.
  app.get('/api/tides/stations', { schema: boxSchema }, async (req) => {
    const q = req.query;
    const all = await cache.wrap('tide-stations', 24 * 60 * MIN, () => ocean.getTideStations(fetchImpl));
    const wide = q.east - q.west >= 360;
    const box = { south: q.south, north: q.north, west: wide ? -180 : wrapLon(q.west), east: wide ? 180 : wrapLon(q.east) };
    const r = ocean.inBox(all, box);
    return { stations: r.items, total: r.total, truncated: r.truncated, source: 'NOAA Tides & Currents' };
  });
  app.get('/api/tides', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    const stations = await cache.wrap('tide-stations', 24 * 60 * MIN, () => ocean.getTideStations(fetchImpl));
    const near = ocean.nearestStation(stations, l);
    if (!near) return { station: null };
    const fc = await settle(forecast(l));
    const nowLocal = new Date(Date.now() + (fc?.utcOffsetSeconds || 0) * 1000).toISOString().slice(0, 16);
    const { events, ...t } = await cache.wrap(`tide:${near.id}:${l.units}`, 60 * MIN, () => ocean.getTides(l, stations, fetchImpl));
    return { ...t, station: near, ...ocean.upcomingTides(events, nowLocal), source: 'NOAA Tides & Currents' };
  });

  // ---- model comparison & ensemble confidence ---------------------------------
  app.get('/api/models', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    return cache.wrap(key('models', l), 30 * MIN, () => models.getModels(l, fetchImpl));
  });
  app.get('/api/ensemble', {
    schema: { querystring: { ...latLonSchema.querystring, properties: { ...latLonSchema.querystring.properties, model: { type: 'string', enum: models.ENSEMBLES.map((e) => e.id) } } } },
  }, async (req) => {
    const l = loc(req.query);
    const id = req.query.model || models.ENSEMBLES[0].id;
    return cache.wrap(key(`ens:${id}`, l), 60 * MIN, () => models.getEnsemble(l, id, fetchImpl));
  });

  // Forecast model maps: a grid of points every 3 hours for one model (Models tab).
  app.get('/api/modelmap', {
    schema: {
      querystring: {
        ...latLonSchema.querystring,
        properties: {
          ...latLonSchema.querystring.properties,
          model: { type: 'string', enum: MAP_MODELS.map((m) => m.id) },
          area: { type: 'string', enum: MAP_AREAS.map((a) => a.id) },
        },
      },
    },
  }, async (req, reply) => {
    const l = loc(req.query);
    const model = req.query.model || MAP_MODELS[0].id;
    const area = req.query.area || 'region';
    const g = gridFor(l.lat, l.lon, area);
    reply.header('cache-control', 'private, max-age=600');
    return cache.wrap(`mmap:${model}:${area}:${g.center.lat},${g.center.lon},${l.units}`, 60 * MIN,
      () => modelMaps.getModelMap({ ...l, model, area }, fetchImpl));
  });

  // ---- kid zone (saved progress, seasons photos, forecaster, field trips) ----
  registerKidZone(app, { db, cameras, cache, fetchImpl, requireUser, latLonSchema, loc });
  registerDashboard(app, { db, requireUser, requireAdmin, cache, latLonSchema, loc });
  const safety = registerSafetyPlan(app, { db, requireUser, requireAdmin });
  if (push) push.shelterFor = safety.shelterFor;
  registerHistory(app, { cache, fetchImpl, latLonSchema, loc, forecast, settle });

  // ---- AI weather expert, cloud photos, web search ---------------------------
  registerAi(app, { ai, forecast, alerts, air, settle, loc });
  const tts = registerTts(app, { cfg, fetchImpl });
  aiSettings.onChange(() => {
    ai.configure(cfg.ai);
    tts.reset();
    chasers.reset();
  });
  registerBriefing(app, { ai, forecast, alerts, air, settle, loc });
  registerWindy(app, { cfg });

  // ---- live storm chaser streams (Storm Center) -------------------------------
  app.get('/api/chasers/live', {
    schema: { querystring: { type: 'object', properties: { kid: { type: 'string', enum: ['0', '1', 'true', 'false'] } } } },
  }, async (req, reply) => {
    reply.header('cache-control', 'private, max-age=60');
    return chasers.live({ kid: req.query.kid === '1' || req.query.kid === 'true' });
  });

  // ---- personal weather stations & Home Assistant ----------------------------
  registerStations(app, { stations, cfg, requireAdmin });
  const homeAssistant = new HomeAssistantService(cfg, {
    stations,
    fetchImpl,
    log: app.log,
    ...(mqttConnect ? { connect: mqttConnect } : {}),
    snapshot: async () => {
      const home = cfg.defaultLocation;
      const l = loc({ lat: home.lat, lon: home.lon });
      const [fc, al, aq] = await Promise.all([forecast(l), settle(alerts(l)), settle(air(l))]);
      const alertList = al?.alerts || [];
      return { forecast: fc, alerts: alertList, air: aq, kid: kidReport(fc, { alerts: alertList, air: aq }) };
    },
  });
  app.get('/api/admin/integrations', { preHandler: requireAdmin }, async () => ({ homeAssistant: homeAssistant.status(), stations: stations.status(cfg.units) }));
  // Started from index.js (like push), so tests stay quiet.
  app.decorate('stations', stations);
  app.decorate('homeAssistant', homeAssistant);
  app.addHook('onClose', async () => {
    stations.stop();
    await homeAssistant.stop();
  });

  // ---- severe weather push notifications ------------------------------------
  const subSchema = { type: 'object', required: ['endpoint'], properties: { endpoint: { type: 'string', maxLength: 2000 } } };
  const pushOff = (reply) => reply.code(404).send({ error: 'Push notifications are turned off on this server.' });
  app.get('/api/push/key', async (req, reply) => (push ? { publicKey: push.publicKey, levels: LEVELS } : pushOff(reply)));
  app.post('/api/push/status', { schema: { body: subSchema } }, async (req, reply) => (push ? push.status(req.body.endpoint) : pushOff(reply)));
  app.post('/api/push/subscribe', {
    schema: { body: { type: 'object', required: ['subscription', 'place'], properties: { subscription: { type: 'object' }, place: { type: 'object' }, levels: { type: 'array', items: { type: 'string' }, maxItems: 3 }, briefingTime: { type: ['string', 'null'], maxLength: 5 } } } },
  }, async (req, reply) => (push ? reply.code(201).send(push.subscribe(req.body, req.user?.id ?? null)) : pushOff(reply)));
  app.post('/api/push/unsubscribe', { schema: { body: subSchema } }, async (req, reply) => (push ? { ok: push.unsubscribe(req.body.endpoint) } : pushOff(reply)));
  app.post('/api/push/test', {
    schema: { body: subSchema },
  }, async (req, reply) => (push ? push.test(req.body.endpoint) : pushOff(reply)));
  // Rocky's morning briefing for one place, used by the scheduled push and its test button.
  const pushBriefing = async ({ lat, lon, place, name }) => {
    const l = loc({ lat, lon });
    const [fc, al, aq] = await Promise.all([forecast(l), settle(alerts(l)), settle(air(l))]);
    return { utcOffsetSeconds: fc.utcOffsetSeconds, briefing: buildBriefing(fc, { alerts: al?.alerts || [], air: aq, place, name }) };
  };
  app.post('/api/push/briefing-test', {
    schema: { body: subSchema },
  }, async (req, reply) => (push ? push.testBriefing(req.body.endpoint, pushBriefing) : pushOff(reply)));
  app.decorate('push', push);
  app.decorate('pushBriefing', pushBriefing);
  // NWS alerts for a place, shared with the web app's cache (used by the background push check).
  app.decorate('pushAlerts', (l) => alerts({ ...l, units: '' }));
  app.addHook('onClose', async () => push?.stop());

  // ---- news & videos -------------------------------------------------------
  // Optional lat/lon adds the local NWS office's outlook, discussion and statements.
  // kid=1 keeps only kid-safe feeds and stories (see providers/news.js).
  app.get('/api/news', {
    schema: { querystring: { type: 'object', properties: { lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 }, kid: { type: 'boolean' } } } },
  }, async (req) => {
    const kid = !!req.query.kid;
    const office = async () => {
      if (req.query.lat == null || req.query.lon == null) return null;
      const l = loc(req.query);
      const place = await cache.wrap(`rgeo:${l.lat},${l.lon}`, 24 * 60 * MIN, () => nws.reverseGeocode(l, { userAgent: cfg.nwsUserAgent, fetchImpl }));
      if (!place?.office) return null;
      const products = await cache.wrap(`nws-products:${place.office}`, 15 * MIN, () => getOfficeProducts(place.office, { userAgent: cfg.nwsUserAgent, fetchImpl }));
      return { id: place.office, place: place.name, link: `https://www.weather.gov/${place.office.toLowerCase()}`, products: kid ? products.filter((p) => p.kidSafe) : products };
    };
    const [news, videos, local] = await Promise.all([media.items('rss', 40, { kid }), media.items('youtube', 24, { kid }), settle(office())]);
    return {
      news: news.items,
      local: news.items.filter((n) => n.scope === 'local'),
      national: news.items.filter((n) => n.scope !== 'local'),
      videos: videos.items,
      office: local,
      kid,
      feeds: [...news.feeds, ...videos.feeds],
    };
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
          hide: { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, async (req) => {
    const hide = (req.query.hide || '').split(',').map((x) => x.trim()).filter(Boolean);
    const out = await cameras.inBounds({ ...req.query, hide });
    // Images are served through our proxy so http-only DOT cameras work on an https site.
    out.cameras = out.cameras.map((c) => ({ ...c, imageUrl: c.hasImage ? `/api/cameras/image/${encodeURIComponent(c.id)}` : null }));
    return out;
  });

  // Every camera feed (one per state, mostly), for the map's layer panel.
  app.get('/api/cameras/feeds', async () => {
    const { feeds } = await cameras.all();
    return { feeds: feeds.map(({ id, name, region, ok, count }) => ({ id, name, region, ok, count: count || 0 })) };
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
  app.get('/api/admin/cameras', { preHandler: requireAdmin }, async () => ({ feeds: (await cameras.all()).feeds, needsKey: cameras.needingKeys() }));
  app.get('/api/admin/media', { preHandler: requireAdmin }, async () => ({ feeds: media.list() }));
  app.post('/api/admin/media', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['kind', 'url'], properties: { kind: { type: 'string', enum: ['rss', 'youtube'] }, url: { type: 'string', minLength: 3, maxLength: 500 }, title: { type: 'string', maxLength: 80 }, scope: { type: 'string', enum: ['local', 'national'] }, kidSafe: { type: 'boolean' } } } },
  }, async (req, reply) => {
    try {
      return reply.code(201).send({ feed: await media.add(req.body) });
    } catch (err) {
      if (err instanceof UpstreamError) return reply.code(400).send({ error: `Could not reach that address (${err.status}).` });
      if (!err.statusCode && !err.cause) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
  app.patch('/api/admin/media/:id', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', additionalProperties: false, properties: { title: { type: 'string', maxLength: 80 }, scope: { type: 'string', enum: ['local', 'national'] }, kidSafe: { type: 'boolean' }, enabled: { type: 'boolean' }, move: { type: 'string', enum: ['up', 'down'] } } } },
  }, async (req, reply) => {
    const feed = media.update(Number(req.params.id), req.body || {});
    return feed ? { feed } : reply.code(404).send({ error: 'Not found' });
  });
  app.delete('/api/admin/media/:id', { preHandler: requireAdmin }, async (req, reply) =>
    media.remove(Number(req.params.id)) ? { ok: true } : reply.code(404).send({ error: 'Not found' }));
  app.get('/api/admin/media-suggestions', { preHandler: requireAdmin }, async () => ({ suggestions: media.suggestions() }));
  app.get('/api/admin/media-hidden', { preHandler: requireAdmin }, async () => ({ hidden: media.hiddenList() }));
  app.post('/api/admin/media-hidden', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['link'], properties: { link: { type: 'string', maxLength: 1000 }, title: { type: 'string', maxLength: 300 } } } },
  }, async (req, reply) => reply.code(201).send({ hidden: media.hide(req.body) }));
  app.delete('/api/admin/media-hidden/:id', { preHandler: requireAdmin }, async (req, reply) =>
    media.unhide(Number(req.params.id)) ? { ok: true } : reply.code(404).send({ error: 'Not found' }));
  // AI helper and read-aloud settings. Keys are write-only.
  const aiSettingsView = () => ({ settings: aiSettings.view(), ai: ai.status(), tts: { enabled: !!cfg.tts.url } });
  app.get('/api/admin/ai-settings', { preHandler: requireAdmin }, async () => aiSettingsView());
  app.put('/api/admin/ai-settings', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['values'], properties: { values: { type: 'object', additionalProperties: { type: ['string', 'null'], maxLength: 500 } } } } },
  }, async (req, reply) => {
    try {
      aiSettings.update(req.body.values);
    } catch (err) {
      if (err instanceof SettingsError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
    req.log.info({ keys: Object.keys(req.body.values), by: req.user.username }, 'AI settings changed');
    return aiSettingsView();
  });
  const draftOf = (req, reply) => {
    try {
      return aiSettings.draft(req.body?.values);
    } catch (err) {
      if (err instanceof SettingsError) reply.code(err.statusCode).send({ error: err.message });
      else throw err;
      return null;
    }
  };
  const draftBody = { values: { type: 'object', additionalProperties: { type: ['string', 'null'], maxLength: 500 } } };
  app.post('/api/admin/ai-settings/test', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['target'], properties: { target: { type: 'string', enum: ['anthropic', 'ollama', 'kokoro', 'youtube'] }, ...draftBody } } },
  }, async (req, reply) => {
    const draft = draftOf(req, reply);
    if (!draft) return reply;
    return testConnection(req.body.target, draft, fetchImpl);
  });
  app.post('/api/admin/ai-settings/preview-voice', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 300 }, ...draftBody } } },
  }, async (req, reply) => {
    const draft = draftOf(req, reply);
    if (!draft) return reply;
    try {
      const audio = await previewVoice(draft, fetchImpl, req.body.text || "Hi! I'm Rocky. Let's check the sky together!");
      return reply.header('content-type', 'audio/mpeg').header('cache-control', 'no-store').send(audio);
    } catch (err) {
      if (err instanceof SettingsError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

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
    return summary(req.query);
  });

  // Rocky dressed for the weather as one standalone SVG, so Den-Duty's weather
  // card (or any app) can show the same Rocky as Kid Mode with a plain <img>.
  // Like /rocky/*.png it needs no key: it's only the mascot in an outfit.
  app.get('/api/connect/rocky.svg', {
    schema: {
      querystring: {
        type: 'object',
        properties: { items: { type: 'string', maxLength: 300 }, mood: { type: 'string', maxLength: 20 } },
      },
    },
  }, async (req, reply) => {
    const base = rockyBase();
    if (!base) return reply.code(404).send({ error: "Rocky's art isn't on this server." });
    const o = cleanOutfit(req.query.items, req.query.mood);
    return reply
      .type('image/svg+xml; charset=utf-8')
      .header('cache-control', 'public, max-age=86400')
      .header('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'")
      .header('x-content-type-options', 'nosniff')
      .send(rockySvg({ ...o, baseHref: base }));
  });

  // ---- Windows 11 widget ---------------------------------------------------
  // Data for the Widgets board card (web/public/widgets/today.json). Same sign-in
  // rules as the rest of the app; the service worker fetches it with the
  // family's cookie. Short, ready-to-show strings because Adaptive Cards can't
  // do much formatting, and absolute image URLs because the board needs them.
  app.get('/api/widget/summary', {
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
  }, async (req) => {
    const s = await summary(req.query);
    const origin = `${req.protocol}://${req.host}`;
    const deg = (v) => (v == null ? '--' : `${Math.round(v)}°`);
    const tip = s.checklist[0];
    const alert = s.alerts[0];
    return {
      place: s.location.name || 'Your weather',
      temp: deg(s.current.temp),
      feels: `Feels like ${deg(s.current.feelsLike)}`,
      label: s.current.kidLabel || s.current.label || '',
      hiLo: `High ${deg(s.today.high)} · Low ${deg(s.today.low)}`,
      rain: s.today.precipChance == null ? '' : `${s.today.precipChance}% chance of rain`,
      playground: s.playground ? `${s.playground.emoji} Playground: ${s.playground.label}` : '',
      tip: tip ? `${tip.emoji} ${tip.label}` : '',
      hasAlert: !!alert,
      alert: alert ? `⚠️ ${alert.event}${s.alerts.length > 1 ? ` (+${s.alerts.length - 1} more)` : ''}` : '',
      rockyUrl: `${origin}${s.raccoon.art.face}`,
      appUrl: `${origin}/`,
      updatedAt: s.updatedAt.replace(/\.\d+Z$/, 'Z'),
    };
  });

  // ---- Android app ---------------------------------------------------------
  // Digital Asset Links for the Android app (android/ folder, a Trusted Web
  // Activity). When the APK's signing fingerprint is listed here, Android opens
  // the app full screen with no browser bar. See docs/APPS.md.
  app.get('/.well-known/assetlinks.json', async (req, reply) => {
    const { packageName, certFingerprints } = cfg.android;
    if (!certFingerprints.length) return reply.code(404).send({ error: 'Set ANDROID_CERT_SHA256 to link the Android app.' });
    return [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: certFingerprints },
    }];
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
