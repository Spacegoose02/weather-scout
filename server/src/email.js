// Email alerts: a second way warnings get through, for family members without
// the app (grandparents, a sitter). An admin adds each person in Family &
// settings with a place; the server emails them when the National Weather
// Service issues a tornado, severe thunderstorm or flash flood warning (and,
// if they want, other warnings and watches) for that place. Each email has a
// link to change or stop them, with no sign-in. Sent through the family's own
// mail server or provider (SMTP), set up in Family & settings.
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

export const KINDS = {
  tornado: { label: 'Tornado warnings', test: (e) => /tornado (warning|emergency)/i.test(e) },
  severe: { label: 'Severe thunderstorm warnings', test: (e) => /severe thunderstorm warning|extreme wind warning/i.test(e) },
  flood: { label: 'Flash flood warnings', test: (e) => /flash flood (warning|emergency)/i.test(e) },
  other: { label: 'Other warnings (hurricane, blizzard, ice storm, high wind and more)', test: (e) => /warning|emergency/i.test(e) && !/tornado|severe thunderstorm|extreme wind|flash flood/i.test(e) },
  watch: { label: 'Tornado and severe thunderstorm watches', test: (e) => /(tornado|severe thunderstorm) watch/i.test(e) },
};
export const DEFAULT_KINDS = ['tornado', 'severe', 'flood'];
const MAX_RECIPIENTS = 50;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS email_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  place_name TEXT NOT NULL DEFAULT '',
  kinds TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  paused INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS email_recipients_email_place ON email_recipients(email, lat, lon);
CREATE TABLE IF NOT EXISTS email_sent (
  recipient_id INTEGER NOT NULL,
  alert_id TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (recipient_id, alert_id)
);
`;

const bad = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const kindOf = (event) => Object.keys(KINDS).find((k) => KINDS[k].test(event || '')) || null;
export const cleanKinds = (list) => [...new Set((Array.isArray(list) ? list : []).filter((k) => KINDS[k]))];

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The mail settings from the config's env: { host, port, secure, auth, from } or null when not set up.
export function mailSettings(env = {}) {
  const host = String(env.SMTP_HOST || '').trim();
  const from = String(env.EMAIL_FROM || '').trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT) || 587;
  const mode = String(env.SMTP_SECURITY || 'auto').toLowerCase();
  const secure = mode === 'ssl' || (mode === 'auto' && port === 465);
  const user = String(env.SMTP_USERNAME || '').trim();
  return {
    host, port, secure,
    requireTLS: mode === 'starttls',
    ignoreTLS: mode === 'none',
    auth: user ? { user, pass: env.SMTP_PASSWORD || '' } : undefined,
    from,
  };
}

// "Until 4:45 PM" in the place's own time, when the alert says.
function untilWords(ends, timeZone) {
  if (!ends) return '';
  const d = new Date(ends);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return `until ${d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', weekday: 'short', timeZone: timeZone || undefined })}`;
  } catch {
    return `until ${d.toUTCString()}`;
  }
}

// The email itself: threat first, then the place, then what to do and the links.
export function alertEmail(alert, r, { appUrl = '', shelter = '', timeZone } = {}) {
  const place = r.place_name || `${r.lat}, ${r.lon}`;
  const warning = /warning|emergency/i.test(alert.event);
  const until = untilWords(alert.ends, timeZone);
  const subject = `${warning ? '⚠️ ' : ''}${alert.event} for ${place}${until ? ` ${until}` : ''}`;
  const action = /tornado/i.test(alert.event) && warning
    ? 'Go to your shelter now: the lowest floor, an inside room away from windows.'
    : /flash flood/i.test(alert.event)
      ? 'Move to higher ground. Never drive or walk through flooded roads.'
      : /severe thunderstorm/i.test(alert.event)
        ? 'Get indoors and stay away from windows. Hail and damaging wind are possible.'
        : 'Follow the instructions from the National Weather Service and local officials.';
  const manage = appUrl ? `${appUrl}/api/email-alerts/manage/${r.token}` : '';
  const lines = [
    `${alert.event} for ${place}${until ? `, ${until}` : ''}.`,
    '',
    shelter ? `${shelter}.` : null,
    action,
    '',
    alert.headline || '',
    alert.description ? `\n${String(alert.description).slice(0, 1500)}` : null,
    '',
    appUrl ? `Live radar and details: ${appUrl}/#map` : null,
    'This is an extra alert from your family’s Weather Scout. Keep a weather radio or phone alerts on too, and act on official warnings right away.',
    manage ? `Change or stop these emails: ${manage}` : 'To stop these emails, ask the person who runs your Weather Scout.',
  ].filter((x) => x !== null);
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:16px;color:#1d2433">
<div style="border-left:6px solid ${warning ? '#d6202f' : '#e0a800'};padding:8px 14px;background:${warning ? '#fff1f1' : '#fff9e6'}">
<p style="margin:0;font-size:20px;font-weight:700">${escapeHtml(alert.event)}</p>
<p style="margin:4px 0 0;font-size:16px">for <b>${escapeHtml(place)}</b>${until ? ` ${escapeHtml(until)}` : ''}</p>
</div>
${shelter ? `<p style="font-size:17px;font-weight:700">${escapeHtml(shelter)}.</p>` : ''}
<p style="font-size:16px">${escapeHtml(action)}</p>
${alert.headline ? `<p style="color:#444">${escapeHtml(alert.headline)}</p>` : ''}
${alert.description ? `<details><summary>The full warning</summary><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(String(alert.description).slice(0, 1500))}</pre></details>` : ''}
${appUrl ? `<p><a href="${escapeHtml(appUrl)}/#map" style="display:inline-block;background:#1f6feb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">See the live radar</a></p>` : ''}
<p style="font-size:13px;color:#666">This is an extra alert from your family’s Weather Scout. Keep a weather radio or phone alerts on too, and act on official warnings right away.</p>
<p style="font-size:13px;color:#666">${manage ? `<a href="${escapeHtml(manage)}">Change or stop these emails</a>` : 'To stop these emails, ask the person who runs your Weather Scout.'}</p>
</body></html>`;
  return { subject, text: lines.join('\n'), html, manage };
}

export class EmailAlertService {
  constructor(db, cfg, { log = console, transport } = {}) {
    this.db = db;
    this.cfg = cfg;
    this.log = log;
    this.transportOverride = transport; // tests
    db.exec(SCHEMA);
  }

  get settings() {
    return mailSettings(this.cfg.env);
  }

  get enabled() {
    return !!this.settings;
  }

  appUrl() {
    return String(this.cfg.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  }

  transport(settings = this.settings) {
    if (this.transportOverride) return this.transportOverride;
    if (!settings) throw bad('Email is not set up yet. Add a mail server in Family & settings.', 409);
    const { from, ...opts } = settings;
    return nodemailer.createTransport({ ...opts, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  }

  async send(to, { subject, text, html, manage }, settings = this.settings) {
    const headers = manage ? { 'List-Unsubscribe': `<${manage}?stop=1>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {};
    await this.transport(settings).sendMail({ from: settings?.from || 'weather-scout@localhost', to, subject, text, html, headers });
  }

  // ---- recipients ----
  view(r) {
    return { id: r.id, email: r.email, name: r.name, place: { lat: r.lat, lon: r.lon, name: r.place_name }, kinds: JSON.parse(r.kinds), paused: !!r.paused, lastSentAt: r.last_sent_at, createdAt: r.created_at };
  }

  list() {
    return this.db.prepare('SELECT * FROM email_recipients ORDER BY name, email').all().map((r) => this.view(r));
  }

  add({ email, name, place, kinds }, userId = null) {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL.test(e) || e.length > 200) throw bad('That email address doesn’t look right.');
    const lat = Math.round(Number(place?.lat) * 100) / 100;
    const lon = Math.round(Number(place?.lon) * 100) / 100;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw bad('Pick a place for these alerts.');
    const k = cleanKinds(kinds ?? DEFAULT_KINDS);
    if (!k.length) throw bad('Pick at least one kind of warning.');
    if (this.db.prepare('SELECT COUNT(*) AS n FROM email_recipients').get().n >= MAX_RECIPIENTS) throw bad(`Up to ${MAX_RECIPIENTS} people can get email alerts.`, 429);
    if (this.db.prepare('SELECT 1 FROM email_recipients WHERE email = ? AND lat = ? AND lon = ?').get(e, lat, lon)) throw bad('That person already gets alerts for this place.', 409);
    const token = crypto.randomBytes(24).toString('base64url');
    const info = this.db.prepare('INSERT INTO email_recipients (email, name, lat, lon, place_name, kinds, token, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e, String(name || '').trim().slice(0, 60), lat, lon, String(place?.name || '').slice(0, 80), JSON.stringify(k), token, userId);
    return this.view(this.byId(info.lastInsertRowid));
  }

  byId(id) {
    const r = this.db.prepare('SELECT * FROM email_recipients WHERE id = ?').get(Number(id));
    if (!r) throw bad('No one with that id gets email alerts.', 404);
    return r;
  }

  byToken(token) {
    if (!/^[\w-]{20,64}$/.test(String(token || ''))) return null;
    return this.db.prepare('SELECT * FROM email_recipients WHERE token = ?').get(token) || null;
  }

  update(id, { kinds, paused, name }) {
    const r = this.byId(id);
    const k = kinds === undefined ? JSON.parse(r.kinds) : cleanKinds(kinds);
    if (!k.length) throw bad('Pick at least one kind of warning, or remove this person.');
    this.db.prepare('UPDATE email_recipients SET kinds = ?, paused = ?, name = ? WHERE id = ?')
      .run(JSON.stringify(k), paused === undefined ? r.paused : paused ? 1 : 0, name === undefined ? r.name : String(name).trim().slice(0, 60), r.id);
    return this.view(this.byId(r.id));
  }

  remove(id) {
    const r = this.byId(id);
    this.db.prepare('DELETE FROM email_recipients WHERE id = ?').run(r.id);
    this.db.prepare('DELETE FROM email_sent WHERE recipient_id = ?').run(r.id);
    return { ok: true };
  }

  async test(id) {
    const r = this.byId(id);
    const fake = { id: 'test', event: 'Test alert', headline: 'This is a test. There is no warning right now.', ends: null };
    const mail = alertEmail(fake, r, { appUrl: this.appUrl() });
    try {
      await this.send(r.email, { ...mail, subject: `🦝 Test from Weather Scout for ${r.place_name || 'your place'}` });
    } catch (err) {
      if (err.statusCode) throw err;
      throw bad(`The mail server did not accept it: ${err.message}`, 502);
    }
    return { ok: true, message: `Sent a test email to ${r.email}.` };
  }

  // Test the mail settings (saved or a draft from the settings form) by mailing the admin's own address.
  async testSettings(env, to) {
    const s = mailSettings(env);
    if (!s) return { ok: false, message: 'Fill in the mail server and the From address first.' };
    if (!EMAIL.test(String(to || ''))) return { ok: false, message: 'Add a recipient below first; the test goes to the first one on the list.' };
    try {
      await this.send(to, { subject: '🦝 Weather Scout email test', text: 'Your Weather Scout can send email. Warnings will arrive like this.', html: '<p>Your Weather Scout can send email. Warnings will arrive like this.</p>', manage: '' }, s);
      return { ok: true, message: `Sent a test to ${to}.` };
    } catch (err) {
      return { ok: false, message: `The mail server said: ${err.message}` };
    }
  }

  // One pass: look up each place's alerts once and email anything new and wanted.
  async check(getAlerts, { shelterFor, timeZoneFor } = {}) {
    if (!this.enabled && !this.transportOverride) return { sent: 0, skipped: true };
    const rows = this.db.prepare('SELECT * FROM email_recipients WHERE paused = 0').all();
    const places = new Map();
    for (const r of rows) {
      const k = `${r.lat},${r.lon}`;
      if (!places.has(k)) places.set(k, []);
      places.get(k).push(r);
    }
    const sentBefore = this.db.prepare('SELECT 1 FROM email_sent WHERE recipient_id = ? AND alert_id = ?');
    const markSent = this.db.prepare('INSERT OR IGNORE INTO email_sent (recipient_id, alert_id) VALUES (?, ?)');
    let sent = 0;
    for (const [k, list] of places) {
      const [lat, lon] = k.split(',').map(Number);
      let alerts;
      try {
        alerts = (await getAlerts({ lat, lon })).alerts || [];
      } catch (err) {
        this.log.warn?.({ err: err.message, place: k }, 'email alerts: could not fetch alerts');
        continue;
      }
      const tz = timeZoneFor ? await timeZoneFor({ lat, lon }).catch(() => undefined) : undefined;
      for (const r of list) {
        const kinds = JSON.parse(r.kinds);
        for (const a of alerts) {
          const kind = kindOf(a.event);
          if (!a.id || !kind || !kinds.includes(kind) || sentBefore.get(r.id, a.id)) continue;
          markSent.run(r.id, a.id);
          try {
            await this.send(r.email, alertEmail(a, r, { appUrl: this.appUrl(), shelter: shelterFor?.(a) || '', timeZone: tz }));
            this.db.prepare("UPDATE email_recipients SET last_sent_at = datetime('now') WHERE id = ?").run(r.id);
            sent++;
          } catch (err) {
            this.log.warn?.({ err: err.message, to: r.id }, 'email alert failed');
          }
        }
      }
    }
    this.db.prepare("DELETE FROM email_sent WHERE sent_at < datetime('now', '-7 days')").run();
    return { places: places.size, sent };
  }

  start(getAlerts, everyMs, opts) {
    this.stop();
    const run = () => this.check(getAlerts, opts).catch((err) => this.log.error?.(err, 'email alert check failed'));
    this.timer = setInterval(run, everyMs);
    this.timer.unref?.();
    setTimeout(run, 10_000).unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }
}

// The no-sign-in page each email links to: change which warnings, pause, or stop.
export function managePage(r, { message = '', appUrl = '', stopped = false } = {}) {
  const kinds = r ? JSON.parse(r.kinds) : [];
  const body = stopped
    ? '<h1>Emails stopped</h1><p>You will not get any more Weather Scout emails at this address.</p>'
    : !r
    ? '<h1>That link has expired</h1><p>These email alerts were already stopped, or the link was changed. Ask the person who runs your Weather Scout if you want them back.</p>'
    : `<h1>🦝 Weather Scout email alerts</h1>
<p>For <b>${escapeHtml(r.email)}</b> at <b>${escapeHtml(r.place_name || `${r.lat}, ${r.lon}`)}</b>.</p>
${message ? `<p class="ok">${escapeHtml(message)}</p>` : ''}
<form method="post">
<fieldset><legend>Email me about</legend>
${Object.entries(KINDS).map(([k, v]) => `<label><input type="checkbox" name="kind" value="${k}"${kinds.includes(k) ? ' checked' : ''}> ${escapeHtml(v.label)}</label>`).join('\n')}
</fieldset>
<label><input type="checkbox" name="paused" value="1"${r.paused ? ' checked' : ''}> Pause all emails for now</label>
<p><button type="submit" name="action" value="save">Save</button></p>
</form>
<form method="post"><p><button type="submit" name="action" value="stop" class="stop">Stop all emails</button></p></form>
${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open Weather Scout</a></p>` : ''}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email alerts</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:16px;color:#1d2433;background:#f7f9fc}label{display:block;margin:8px 0}fieldset{border:1px solid #ccd;border-radius:8px}button{font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#1f6feb;color:#fff}.stop{background:#c4123a}.ok{background:#e7f7ec;padding:8px;border-radius:8px}@media(prefers-color-scheme:dark){body{background:#11151c;color:#e6e9ef}fieldset{border-color:#445}}</style>
</head><body>${body}</body></html>`;
}

export function registerEmailAlerts(app, { email, requireAdmin }) {
  const recipientBody = {
    type: 'object', required: ['email', 'place'],
    properties: {
      email: { type: 'string', maxLength: 200 }, name: { type: 'string', maxLength: 60 },
      place: { type: 'object', required: ['lat', 'lon'], properties: { lat: { type: 'number' }, lon: { type: 'number' }, name: { type: 'string', maxLength: 80 } } },
      kinds: { type: 'array', items: { type: 'string', maxLength: 20 }, maxItems: 10 },
    },
  };
  app.get('/api/admin/email-alerts', { preHandler: requireAdmin }, async () => ({
    enabled: email.enabled, appUrl: email.appUrl(), recipients: email.list(), kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])), defaults: DEFAULT_KINDS,
  }));
  app.post('/api/admin/email-alerts', { preHandler: requireAdmin, schema: { body: recipientBody } }, async (req, reply) => reply.code(201).send(email.add(req.body, req.user.id)));
  app.patch('/api/admin/email-alerts/:id', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', properties: { kinds: { type: 'array', items: { type: 'string', maxLength: 20 }, maxItems: 10 }, paused: { type: 'boolean' }, name: { type: 'string', maxLength: 60 } } } },
  }, async (req) => email.update(req.params.id, req.body));
  app.delete('/api/admin/email-alerts/:id', { preHandler: requireAdmin }, async (req) => email.remove(req.params.id));
  app.post('/api/admin/email-alerts/:id/test', { preHandler: requireAdmin }, async (req) => email.test(req.params.id));

  // The manage page, reachable from the email with no sign-in (the token is the key).
  app.register(async (scope) => {
    scope.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (req, body, done) => {
      const params = new URLSearchParams(body);
      done(null, { action: params.get('action'), kinds: params.getAll('kind'), paused: params.get('paused') === '1', oneClick: params.get('List-Unsubscribe') === 'One-Click' });
    });
    const page = (reply, r, message, stopped = false) => reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').header('x-robots-tag', 'noindex').send(managePage(r, { message, appUrl: email.appUrl(), stopped }));
    scope.get('/api/email-alerts/manage/:token', async (req, reply) => page(reply, email.byToken(req.params.token)));
    scope.post('/api/email-alerts/manage/:token', async (req, reply) => {
      const r = email.byToken(req.params.token);
      if (!r) return page(reply.code(404), null);
      const b = req.body || {};
      // One-click unsubscribe from the mail app (RFC 8058), or the Stop button.
      if (b.oneClick || b.action === 'stop' || req.query?.stop === '1') {
        email.remove(r.id);
        return page(reply, null, '', true);
      }
      const kinds = cleanKinds(b.kinds);
      if (!kinds.length) return page(reply, r, 'Pick at least one kind of warning, or use Stop all emails.');
      email.update(r.id, { kinds, paused: !!b.paused });
      return page(reply, email.byId(r.id), b.paused ? 'Saved. Emails are paused.' : 'Saved.');
    });
  });
}
