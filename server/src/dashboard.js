// Custom dashboards, the daily observation journal and tonight's sky.
//
// Dashboards: each signed-in person has one saved layout (an ordered list of
// cards, each with a size). Guests see the house default, which an admin can
// set from their own layout. The server only checks the shape; the web app
// knows the card catalog, so cards added later never break an old layout.
//
// Journal: one entry per person per day (sky icons, measured high/low, rain
// gauge, a short note and a snapshot of what the forecast said).
import { tonightSky } from './stars.js';

const MIN = 60_000;
export const SIZES = ['s', 'm', 'l'];
const MAX_CARDS = 40;
export const SKY_ICONS = ['sunny', 'partly', 'cloudy', 'rain', 'drizzle', 'storm', 'snow', 'fog', 'windy', 'rainbow', 'frost', 'hot'];
const MAX_ENTRIES = 3000; // about eight years of daily entries

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dashboards (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS journal_entries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day)
);
`;

const layoutSchema = {
  type: 'object',
  required: ['cards'],
  additionalProperties: false,
  properties: {
    cards: {
      type: 'array',
      maxItems: MAX_CARDS,
      items: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,31}$' },
          size: { type: 'string', enum: SIZES },
        },
      },
    },
  },
};

// Drop duplicates (first one wins) so a layout is always a clean ordered list.
export function cleanLayout(layout) {
  const seen = new Set();
  const cards = [];
  for (const c of layout?.cards || []) {
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push({ id: c.id, size: SIZES.includes(c.size) ? c.size : 'm' });
  }
  return { cards: cards.slice(0, MAX_CARDS) };
}

const num = (min, max) => ({ type: ['number', 'null'], minimum: min, maximum: max });
const entrySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sky: { type: 'array', maxItems: 6, uniqueItems: true, items: { type: 'string', enum: SKY_ICONS } },
    high: num(-80, 140),
    low: num(-80, 140),
    rain: num(0, 1000), // rain gauge, in the person's precipitation unit
    units: { type: 'string', enum: ['imperial', 'metric'] },
    note: { type: 'string', maxLength: 500 },
    forecast: {
      type: 'object',
      additionalProperties: false,
      properties: { high: num(-80, 140), low: num(-80, 140), precip: num(0, 1000), icon: { type: 'string', maxLength: 20 }, label: { type: 'string', maxLength: 60 } },
    },
  },
};

const DAY_RE = '^\\d{4}-\\d{2}-\\d{2}$';

export function registerDashboard(app, { db, requireUser, requireAdmin, cache, latLonSchema, loc }) {
  db.exec(SCHEMA);

  // ---- dashboards ---------------------------------------------------------------
  const getLayout = db.prepare('SELECT layout, updated_at FROM dashboards WHERE user_id = ?');
  const putLayout = db.prepare(`INSERT INTO dashboards (user_id, layout, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`);
  const delLayout = db.prepare('DELETE FROM dashboards WHERE user_id = ?');
  const getSetting = db.prepare('SELECT value FROM site_settings WHERE key = ?');
  const putSetting = db.prepare(`INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  const delSetting = db.prepare('DELETE FROM site_settings WHERE key = ?');

  const parse = (s) => {
    try {
      return cleanLayout(JSON.parse(s));
    } catch {
      return null;
    }
  };
  const houseDefault = () => {
    const row = getSetting.get('dashboard.default');
    return row ? parse(row.value) : null;
  };

  // The guest layout. null means "use the app's built-in default".
  app.get('/api/dashboard/default', async () => ({ layout: houseDefault() }));

  app.get('/api/me/dashboard', { preHandler: requireUser }, async (req) => {
    const row = getLayout.get(req.user.id);
    return { layout: row ? parse(row.layout) : null, houseDefault: houseDefault(), updatedAt: row?.updated_at || null };
  });

  app.put('/api/me/dashboard', { preHandler: requireUser, schema: { body: layoutSchema } }, async (req) => {
    const layout = cleanLayout(req.body);
    putLayout.run(req.user.id, JSON.stringify(layout));
    return { layout };
  });

  // Back to the default (the house default when an admin set one).
  app.delete('/api/me/dashboard', { preHandler: requireUser }, async (req) => {
    delLayout.run(req.user.id);
    return { ok: true, layout: null, houseDefault: houseDefault() };
  });

  app.put('/api/admin/dashboard/default', { preHandler: requireAdmin, schema: { body: layoutSchema } }, async (req) => {
    const layout = cleanLayout(req.body);
    putSetting.run('dashboard.default', JSON.stringify(layout));
    return { layout };
  });

  app.delete('/api/admin/dashboard/default', { preHandler: requireAdmin }, async () => {
    delSetting.run('dashboard.default');
    return { ok: true, layout: null };
  });

  // ---- observation journal -----------------------------------------------------------
  const listEntries = db.prepare('SELECT day, data, updated_at FROM journal_entries WHERE user_id = ? ORDER BY day DESC LIMIT ?');
  const countEntries = db.prepare('SELECT COUNT(*) AS n FROM journal_entries WHERE user_id = ?');
  const hasEntry = db.prepare('SELECT 1 FROM journal_entries WHERE user_id = ? AND day = ?');
  const putEntry = db.prepare(`INSERT INTO journal_entries (user_id, day, data, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, day) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const delEntry = db.prepare('DELETE FROM journal_entries WHERE user_id = ? AND day = ?');

  const entryOut = (r) => {
    let data = {};
    try {
      data = JSON.parse(r.data);
    } catch { /* keep empty */ }
    return { day: r.day, ...data, updatedAt: r.updated_at };
  };

  app.get('/api/me/journal', {
    preHandler: requireUser,
    schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 400 } } } },
  }, async (req) => ({ entries: listEntries.all(req.user.id, req.query.limit || 120).map(entryOut) }));

  app.put('/api/me/journal/:day', {
    preHandler: requireUser,
    schema: { params: { type: 'object', properties: { day: { type: 'string', pattern: DAY_RE } } }, body: entrySchema },
  }, async (req, reply) => {
    const { day } = req.params;
    if (Number.isNaN(Date.parse(`${day}T12:00:00Z`))) return reply.code(400).send({ error: 'That is not a real date.' });
    // Kids can fill in yesterday, but not next week.
    if (day > new Date(Date.now() + 36 * 3_600_000).toISOString().slice(0, 10)) return reply.code(400).send({ error: 'You can only write about days that already happened.' });
    if (!hasEntry.get(req.user.id, day) && countEntries.get(req.user.id).n >= MAX_ENTRIES) {
      return reply.code(409).send({ error: 'Your journal is full. Delete a few old pages first.' });
    }
    const entry = { ...req.body, note: (req.body.note || '').trim() };
    putEntry.run(req.user.id, day, JSON.stringify(entry));
    return { entry: { day, ...entry } };
  });

  app.delete('/api/me/journal/:day', {
    preHandler: requireUser,
    schema: { params: { type: 'object', properties: { day: { type: 'string', pattern: DAY_RE } } } },
  }, async (req, reply) => (delEntry.run(req.user.id, req.params.day).changes ? { ok: true } : reply.code(404).send({ error: 'No page for that day.' })));

  // ---- tonight's sky ------------------------------------------------------------------
  // Pure math, no upstream call. Cached for 10 minutes per ~1 km so a family
  // full of tablets does not redo it.
  app.get('/api/sky/tonight', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    return cache.wrap(`sky-tonight:${l.lat},${l.lon}`, 10 * MIN, async () => tonightSky(l));
  });
}
