// Classroom mode: a big-screen weather board for a class, plus the class's own
// weather log (what the sky looked like, the thermometer reading, rain, wind).
// Anyone can read the log; signed-in people add to it, and admins or the
// person who wrote an entry can remove it. Kept for a school year (400 days).

export const SKIES = ['sunny', 'partly', 'cloudy', 'fog', 'rain', 'storm', 'snow'];
export const WINDS = ['calm', 'breezy', 'windy'];
const KEEP_DAYS = 400;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS class_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  day TEXT NOT NULL,
  sky TEXT NOT NULL,
  temp REAL,
  units TEXT NOT NULL DEFAULT 'imperial',
  precip INTEGER NOT NULL DEFAULT 0,
  wind TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS class_log_day ON class_log(day);`;

// A kid-typed note: one line, no tags, at most 140 characters.
export const cleanNote = (s) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);

export function validEntry(b) {
  if (!SKIES.includes(b.sky)) return 'Pick what the sky looks like.';
  if (b.temp != null && (!Number.isFinite(b.temp) || b.temp < -60 || b.temp > 130)) return 'That temperature looks off.';
  if (b.wind != null && !WINDS.includes(b.wind)) return 'Pick calm, breezy or windy.';
  if (b.day && !/^\d{4}-\d{2}-\d{2}$/.test(b.day)) return 'Bad date.';
  return null;
}

// A few days of the log -> simple class findings ("Most days were sunny").
export function logSummary(rows) {
  if (!rows.length) return null;
  const count = {};
  for (const r of rows) count[r.sky] = (count[r.sky] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  const temps = rows.filter((r) => r.temp != null).map((r) => r.temp);
  return {
    days: new Set(rows.map((r) => r.day)).size,
    commonSky: top[0],
    commonCount: top[1],
    rainyDays: new Set(rows.filter((r) => r.precip).map((r) => r.day)).size,
    warmest: temps.length ? Math.max(...temps) : null,
    coldest: temps.length ? Math.min(...temps) : null,
  };
}

export function registerClassroom(app, { db, requireUser }) {
  db.exec(SCHEMA);
  const list = () => db.prepare('SELECT l.id, l.user_id, l.day, l.sky, l.temp, l.units, l.precip, l.wind, l.note, u.username FROM class_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.day DESC, l.id DESC LIMIT 60').all()
    .map((r) => ({ id: r.id, day: r.day, sky: r.sky, temp: r.temp, units: r.units, precip: !!r.precip, wind: r.wind, note: r.note, by: r.username || null, mine: false, userId: r.user_id }));

  app.get('/api/classroom/log', async (req) => {
    const rows = list().map(({ userId, ...r }) => ({ ...r, mine: !!req.user && (req.user.id === userId || !!req.user.is_admin) }));
    return { entries: rows, summary: logSummary(rows.slice(0, 20)), skies: SKIES, winds: WINDS };
  });

  app.post('/api/classroom/log', {
    preHandler: requireUser,
    schema: { body: { type: 'object', required: ['sky'], properties: { sky: { type: 'string' }, temp: { type: ['number', 'null'] }, units: { type: 'string', enum: ['imperial', 'metric'] }, precip: { type: 'boolean' }, wind: { type: ['string', 'null'] }, note: { type: 'string', maxLength: 400 }, day: { type: 'string' } } } },
  }, async (req, reply) => {
    const b = req.body;
    const bad = validEntry(b);
    if (bad) return reply.code(400).send({ error: bad });
    const day = b.day || new Date().toISOString().slice(0, 10);
    const r = db.prepare('INSERT INTO class_log (user_id, day, sky, temp, units, precip, wind, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, day, b.sky, b.temp ?? null, b.units || 'imperial', b.precip ? 1 : 0, b.wind ?? null, cleanNote(b.note));
    db.prepare("DELETE FROM class_log WHERE day < date('now', ?)").run(`-${KEEP_DAYS} days`);
    return reply.code(201).send({ id: Number(r.lastInsertRowid) });
  });

  app.delete('/api/classroom/log/:id', { preHandler: requireUser }, async (req, reply) => {
    const row = db.prepare('SELECT user_id FROM class_log WHERE id = ?').get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'Not found.' });
    if (row.user_id !== req.user.id && !req.user.is_admin) return reply.code(403).send({ error: 'Only the person who wrote it or an admin can remove it.' });
    db.prepare('DELETE FROM class_log WHERE id = ?').run(Number(req.params.id));
    return { ok: true };
  });
}
