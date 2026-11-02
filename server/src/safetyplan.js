// The family's severe weather safety plan. One plan per Weather Scout install
// (it is the household's server): shelter spots per hazard, meeting places,
// emergency contacts, the emergency kit checklist and the last drill date.
//
// Grown-ups (admins) edit the plan. Anyone signed in can tick kit items off and
// log a drill, so kids can help pack. Guests can read it, minus the contacts
// (phone numbers stay with people who have an account).
import { cleanPlan, defaultPlan, hazardFor, shelterLine } from '../../shared/safety-plan.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS safety_plan (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function registerSafetyPlan(app, { db, requireUser, requireAdmin }) {
  db.exec(SCHEMA);
  const get = db.prepare('SELECT data, updated_by, updated_at FROM safety_plan WHERE id = 1');
  const put = db.prepare(`INSERT INTO safety_plan (id, data, updated_by, updated_at) VALUES (1, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at`);
  const del = db.prepare('DELETE FROM safety_plan WHERE id = 1');

  const load = () => {
    const row = get.get();
    if (!row) return { plan: defaultPlan(), updatedBy: '', updatedAt: null };
    let data = null;
    try {
      data = JSON.parse(row.data);
    } catch { /* fall back to defaults */ }
    return { plan: cleanPlan(data), updatedBy: row.updated_by, updatedAt: row.updated_at };
  };
  const save = (plan, user) => put.run(JSON.stringify(cleanPlan(plan)), user?.display_name || user?.username || '');

  const out = (req) => {
    const { plan, updatedBy, updatedAt } = load();
    const signedIn = !!req.user;
    return {
      plan: signedIn ? plan : { ...plan, contacts: [] },
      contactsHidden: !signedIn && plan.contacts.length > 0,
      updatedBy,
      updatedAt,
      canEdit: !!req.user?.is_admin,
      canTick: signedIn,
    };
  };

  app.get('/api/safety-plan', async (req) => out(req));

  app.put('/api/safety-plan', { preHandler: requireAdmin, schema: { body: { type: 'object' } } }, async (req) => {
    // lastDrill is logged with its own endpoint; keep the stored one.
    save({ ...req.body, lastDrill: load().plan.lastDrill }, req.user);
    return out(req);
  });

  app.delete('/api/safety-plan', { preHandler: requireAdmin }, async (req) => {
    del.run();
    return out(req);
  });

  app.put('/api/safety-plan/kit/:id', {
    preHandler: requireUser,
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', maxLength: 40 } } },
      body: { type: 'object', required: ['done'], properties: { done: { type: 'boolean' } } },
    },
  }, async (req, reply) => {
    const { plan } = load();
    const item = plan.kit.find((k) => k.id === req.params.id);
    if (!item) return reply.code(404).send({ error: 'That kit item is not on the list.' });
    item.done = req.body.done;
    save(plan, req.user);
    return out(req);
  });

  app.post('/api/safety-plan/drill', {
    preHandler: requireUser,
    schema: { body: { type: ['object', 'null'], properties: { day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } } } },
  }, async (req, reply) => {
    const day = req.body?.day || new Date().toISOString().slice(0, 10);
    if (day > new Date(Date.now() + 36 * 3_600_000).toISOString().slice(0, 10)) return reply.code(400).send({ error: 'A drill can only be logged once it happened.' });
    const { plan } = load();
    save({ ...plan, lastDrill: day }, req.user);
    return out(req);
  });

  // For push notifications: "Shelter: the basement" under a tornado warning.
  return {
    shelterFor(alert) {
      const h = hazardFor(alert);
      return h ? shelterLine(load().plan, h.id) : '';
    },
  };
}
