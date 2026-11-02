// Kid Zone server routes: per-kid saved progress (bingo, forecaster guesses,
// badges), Seasons tracker photos, real weather for scoring forecaster
// guesses, and camera field trips. Kept in its own file and its own tables so
// it stays out of the way of the core app.
import { fetchJson } from './cache.js';
import { unitParams } from './providers/openmeteo.js';
import { describeCode, isSnow, isWet } from './weathercodes.js';

const MIN = 60_000;
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const MAX_DATA_BYTES = 256 * 1024;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PHOTOS = 600;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kid_data (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kid_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot TEXT NOT NULL,
  taken_on TEXT NOT NULL,
  mime TEXT NOT NULL,
  image BLOB NOT NULL,
  weather TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS kid_photos_user ON kid_photos(user_id, spot, taken_on);
`;

// ---- field trips ---------------------------------------------------------------
const R_MILES = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
export function distanceMiles(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}
const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export function directionWord(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

// One camera per ~13-mile grid cell, nearest first, so the trip covers the area.
// Within a cell, a camera with live video wins over a still-only one.
const canShow = (c) => c.hasImage !== false || c.video || c.embed;
const isLive = (c) => !!(c.video || c.embed);
export function spreadCameras(home, cams, max = 30, cell = 0.2) {
  const seen = new Map();
  const sorted = cams
    .filter(canShow)
    .map((c) => ({ ...c, miles: distanceMiles(home, c) }))
    .sort((a, b) => a.miles - b.miles);
  for (const c of sorted) {
    const k = `${Math.floor(c.lat / cell)},${Math.floor(c.lon / cell)}`;
    const prev = seen.get(k);
    if (!prev || (isLive(c) && !isLive(prev))) seen.set(k, c);
  }
  return [...seen.values()].sort((a, b) => a.miles - b.miles).slice(0, max);
}

const MISSIONS = [
  { id: 'rain', emoji: '🌧️', title: 'See where it is raining right now', pick: (s) => s.filter((p) => isWet(p.code) && !isSnow(p.code)).sort((a, b) => b.precip - a.precip), none: 'No rain at any camera right now. Everybody is dry!' },
  { id: 'snow', emoji: '❄️', title: 'Find the snowiest camera', pick: (s) => s.filter((p) => isSnow(p.code) || p.snowfall > 0).sort((a, b) => b.snowfall - a.snowfall), none: 'No snow on the cameras today. Check back on a cold, snowy day!' },
  { id: 'fog', emoji: '🌫️', title: 'Spot a foggy road', pick: (s) => s.filter((p) => [45, 48].includes(p.code)), none: 'No fog right now. Fog likes early, cool mornings.' },
  { id: 'sunny', emoji: '☀️', title: 'Find a sunny camera', pick: (s) => s.filter((p) => p.code <= 1 && p.isDay).sort((a, b) => a.cloudCover - b.cloudCover), none: 'No clear skies on the cameras right now.' },
  { id: 'coldest', emoji: '🥶', title: 'Visit the coldest camera', pick: (s) => [...s].sort((a, b) => a.temp - b.temp) },
  { id: 'warmest', emoji: '🔥', title: 'Visit the warmest camera', pick: (s) => [...s].sort((a, b) => b.temp - a.temp) },
  { id: 'windiest', emoji: '💨', title: 'Find the windiest camera', pick: (s) => [...s].sort((a, b) => b.gust - a.gust) },
];

const CLUES = {
  rain: 'Look for wet, shiny roads and car headlights.',
  snow: 'Look for white on the grass, the trees or the road.',
  fog: 'Can you see far away, or does it fade into gray?',
  sunny: 'Look for bright light and sharp shadows.',
  coldest: 'Do you see frost, snow or people bundled up?',
  warmest: 'Is the sky bright? Is there any snow left?',
  windiest: 'Look for trees bending and flags flying straight out.',
};

export function fieldTripMissions(home, spots, units = { temp: '°F', wind: 'mph' }) {
  const usable = spots.filter((p) => p.temp != null);
  return MISSIONS.map((m) => {
    const found = usable.length ? m.pick(usable).slice(0, 3) : [];
    return {
      id: m.id,
      emoji: m.emoji,
      title: m.title,
      clue: CLUES[m.id],
      found: found.length > 0,
      none: m.none || 'No cameras to visit right now.',
      cameras: found.map((p) => ({
        id: p.id, name: p.name, road: p.road || null, imageUrl: p.imageUrl || null, video: p.video || null, embed: p.embed || null,
        miles: Math.round(p.miles), direction: directionWord(home, p),
        temp: Math.round(p.temp), gust: Math.round(p.gust), kidLabel: p.kidLabel, icon: p.icon, isDay: p.isDay,
      })),
    };
  }).sort((a, b) => Number(b.found) - Number(a.found));
}

// ---- forecaster scoring data ------------------------------------------------------
export function actualsUrl(l) {
  const p = new URLSearchParams({
    latitude: l.lat.toFixed(4), longitude: l.lon.toFixed(4),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
    past_days: '14', forecast_days: '1', timezone: 'auto', ...unitParams(l.units),
  });
  return `${OPEN_METEO}?${p}`;
}

export function parseActuals(raw) {
  const d = raw?.daily;
  if (!d?.time) return [];
  const today = (raw.current?.time || new Date(Date.now() + (raw.utc_offset_seconds || 0) * 1000).toISOString()).slice(0, 10);
  return d.time
    .map((date, i) => ({ date, high: d.temperature_2m_max?.[i] ?? null, low: d.temperature_2m_min?.[i] ?? null, precipTotal: d.precipitation_sum?.[i] ?? null, ...describeCode(d.weather_code?.[i]) }))
    .filter((x) => x.date < today && x.high != null);
}

function spotsUrl(points, units) {
  const p = new URLSearchParams({
    latitude: points.map((c) => c.lat.toFixed(3)).join(','),
    longitude: points.map((c) => c.lon.toFixed(3)).join(','),
    current: 'temperature_2m,weather_code,wind_gusts_10m,precipitation,snowfall,is_day,cloud_cover',
    timezone: 'auto',
    ...unitParams(units),
  });
  return `${OPEN_METEO}?${p}`;
}

// ---- photos --------------------------------------------------------------------
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export function decodePhoto(dataUrl) {
  const m = DATA_URL.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  const magic = { 'image/jpeg': [0xff, 0xd8], 'image/png': [0x89, 0x50], 'image/webp': [0x52, 0x49] }[m[1]];
  if (buf.length < 4 || buf[0] !== magic[0] || buf[1] !== magic[1]) return null;
  return { mime: m[1], buf };
}

// ---- badges & progress -----------------------------------------------------------
// Badges ({ id: 'YYYY-MM-DD' }) and progress counters ({ clouds: { cumulus: day },
// quizzes: { tornado: 3 }, journalBest: 7 }) only ever grow, so saves from different
// tabs or devices are unioned instead of overwriting each other.
const BADGE_ID = /^[a-z0-9-]{1,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[A-Za-z0-9-]{1,40}$/;
function mergeValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  return a ?? b;
}
export function mergeProgress(have = {}, add = {}) {
  const out = { ...have };
  for (const [k, v] of Object.entries(add || {})) {
    if (!KEY.test(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = { ...(out[k] && typeof out[k] === 'object' ? out[k] : {}) };
      for (const [ik, iv] of Object.entries(v)) {
        if (KEY.test(ik) && (typeof iv === 'number' || typeof iv === 'string')) inner[ik] = mergeValue(inner[ik], iv);
      }
      out[k] = inner;
    } else if (typeof v === 'number' || typeof v === 'string') {
      out[k] = mergeValue(out[k], v);
    }
  }
  return out;
}
export function mergeBadges(have = {}, add = {}) {
  const out = { ...have };
  const fresh = [];
  for (const [id, day] of Object.entries(add || {})) {
    if (!BADGE_ID.test(id) || out[id]) continue;
    out[id] = DAY_RE.test(day) ? day : new Date().toISOString().slice(0, 10);
    fresh.push(id);
  }
  return { badges: out, fresh };
}

export function registerKidZone(app, { db, cameras, cache, fetchImpl, requireUser, latLonSchema, loc }) {
  db.exec(SCHEMA);

  // ---- saved progress -------------------------------------------------------------
  const getData = db.prepare('SELECT data FROM kid_data WHERE user_id = ?');
  const putData = db.prepare(`INSERT INTO kid_data (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);

  app.get('/api/me/kid', { preHandler: requireUser }, async (req) => {
    const row = getData.get(req.user.id);
    try {
      return { data: JSON.parse(row?.data || '{}') };
    } catch {
      return { data: {} };
    }
  });

  const readData = (userId) => {
    try {
      return JSON.parse(getData.get(userId)?.data || '{}');
    } catch {
      return {};
    }
  };

  app.put('/api/me/kid', { preHandler: requireUser, schema: { body: { type: 'object' } } }, async (req, reply) => {
    // Keep badges and progress earned elsewhere (Learn, journal, another device)
    // even if this client had an older copy.
    const have = readData(req.user.id);
    const body = { ...req.body };
    body.badges = mergeBadges(have.badges, body.badges).badges;
    body.progress = mergeProgress(have.progress, body.progress);
    const json = JSON.stringify(body);
    if (json.length > MAX_DATA_BYTES) return reply.code(413).send({ error: 'That is a lot of kid data. Try clearing old guesses.' });
    putData.run(req.user.id, json);
    return { ok: true };
  });

  // Add progress and/or badges without touching anything else. Returns the
  // merged data plus which badges are brand new (for the celebration).
  app.post('/api/me/kid/merge', {
    preHandler: requireUser,
    schema: { body: { type: 'object', properties: { progress: { type: 'object' }, badges: { type: 'object' } }, additionalProperties: false } },
  }, async (req, reply) => {
    const data = readData(req.user.id);
    data.progress = mergeProgress(data.progress, req.body.progress);
    const { badges, fresh } = mergeBadges(data.badges, req.body.badges);
    data.badges = badges;
    const json = JSON.stringify(data);
    if (json.length > MAX_DATA_BYTES) return reply.code(413).send({ error: 'That is a lot of kid data. Try clearing old guesses.' });
    putData.run(req.user.id, json);
    return { data, fresh };
  });

  // ---- seasons tracker photos ---------------------------------------------------------
  const listPhotos = db.prepare('SELECT id, spot, taken_on, weather FROM kid_photos WHERE user_id = ? ORDER BY spot, taken_on, id');
  const countPhotos = db.prepare('SELECT COUNT(*) AS n FROM kid_photos WHERE user_id = ?');
  const addPhoto = db.prepare('INSERT INTO kid_photos (user_id, spot, taken_on, mime, image, weather) VALUES (?, ?, ?, ?, ?, ?)');
  const getPhoto = db.prepare('SELECT mime, image FROM kid_photos WHERE id = ? AND user_id = ?');
  const delPhoto = db.prepare('DELETE FROM kid_photos WHERE id = ? AND user_id = ?');

  const photoOut = (r) => ({ id: r.id, spot: r.spot, takenOn: r.taken_on, weather: r.weather ? JSON.parse(r.weather) : null, url: `/api/me/photos/${r.id}` });

  app.get('/api/me/photos', { preHandler: requireUser }, async (req) => ({ photos: listPhotos.all(req.user.id).map(photoOut) }));

  app.post('/api/me/photos', {
    preHandler: requireUser,
    bodyLimit: Math.ceil(MAX_PHOTO_BYTES * 1.4) + 4096,
    schema: {
      body: {
        type: 'object', required: ['spot', 'image'],
        properties: {
          spot: { type: 'string', minLength: 1, maxLength: 60 },
          image: { type: 'string' },
          takenOn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          weather: { type: 'object', properties: { temp: { type: ['number', 'null'] }, units: { type: 'string', maxLength: 4 }, icon: { type: 'string', maxLength: 20 }, kidLabel: { type: 'string', maxLength: 60 } }, additionalProperties: false },
        },
      },
    },
  }, async (req, reply) => {
    const photo = decodePhoto(req.body.image);
    if (!photo) return reply.code(400).send({ error: 'That does not look like a photo.' });
    if (photo.buf.length > MAX_PHOTO_BYTES) return reply.code(413).send({ error: 'That photo is too big.' });
    if (countPhotos.get(req.user.id).n >= MAX_PHOTOS) return reply.code(409).send({ error: 'Your photo album is full. Delete a few old ones first.' });
    const takenOn = req.body.takenOn || new Date().toISOString().slice(0, 10);
    const r = addPhoto.run(req.user.id, req.body.spot.trim(), takenOn, photo.mime, photo.buf, req.body.weather ? JSON.stringify(req.body.weather) : null);
    return { photo: photoOut({ id: Number(r.lastInsertRowid), spot: req.body.spot.trim(), taken_on: takenOn, weather: req.body.weather ? JSON.stringify(req.body.weather) : null }) };
  });

  app.get('/api/me/photos/:id', { preHandler: requireUser }, async (req, reply) => {
    const row = getPhoto.get(Number(req.params.id), req.user.id);
    if (!row) return reply.code(404).send({ error: 'No such photo.' });
    return reply.header('content-type', row.mime).header('cache-control', 'private, max-age=86400').send(Buffer.from(row.image));
  });

  app.delete('/api/me/photos/:id', { preHandler: requireUser }, async (req, reply) => {
    const r = delPhoto.run(Number(req.params.id), req.user.id);
    return r.changes ? { ok: true } : reply.code(404).send({ error: 'No such photo.' });
  });

  // ---- kid forecaster: what really happened -------------------------------------------
  app.get('/api/kid/actuals', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    const days = await cache.wrap(`kid-actuals:${l.lat},${l.lon},${l.units}`, 60 * MIN, async () =>
      parseActuals(await fetchJson(actualsUrl(l), { source: 'Open-Meteo', fetchImpl })));
    return { location: l, days };
  });

  // ---- camera field trips --------------------------------------------------------------
  app.get('/api/kid/field-trip', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    return cache.wrap(`kid-trip:${l.lat},${l.lon},${l.units}`, 10 * MIN, async () => {
      const box = { south: l.lat - 1, north: l.lat + 1, west: l.lon - 1.3, east: l.lon + 1.3 };
      const { cameras: cams } = await cameras.inBounds(box, 5000);
      const picked = spreadCameras(l, cams);
      if (!picked.length) return { location: l, cameraCount: 0, missions: [] };
      let raw = await fetchJson(spotsUrl(picked, l.units), { source: 'Open-Meteo', fetchImpl, timeoutMs: 15000 });
      if (!Array.isArray(raw)) raw = [raw];
      const spots = picked.map((c, i) => {
        const cur = raw[i]?.current || {};
        return {
          ...c,
          imageUrl: c.hasImage === false ? null : `/api/cameras/image/${encodeURIComponent(c.id)}`,
          temp: cur.temperature_2m ?? null, code: cur.weather_code ?? null, gust: cur.wind_gusts_10m ?? 0,
          precip: cur.precipitation ?? 0, snowfall: cur.snowfall ?? 0, isDay: !!cur.is_day, cloudCover: cur.cloud_cover ?? 100,
          ...describeCode(cur.weather_code),
        };
      });
      return { location: l, cameraCount: picked.length, units: l.units, missions: fieldTripMissions(l, spots) };
    });
  });
}
