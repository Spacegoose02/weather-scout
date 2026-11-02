// Severe weather push notifications (Web Push). Each browser or phone that turns
// alerts on stores a subscription for one place. A background loop checks NWS
// alerts for every subscribed place and sends each new alert once.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

export const LEVELS = ['warning', 'watch', 'advisory'];
const MAX_SUBSCRIPTIONS = 200;

// warning: tornado, severe thunderstorm, flash flood, high wind warnings...
// watch:   tornado watch, winter storm watch...
// advisory: everything else (wind advisory, special weather statement...)
export function alertLevel(alert) {
  const event = alert.event || '';
  if (/warning|emergency/i.test(event) || alert.severity === 'Extreme') return 'warning';
  if (/watch/i.test(event)) return 'watch';
  return 'advisory';
}

// `shelter` is the family's spot from the safety plan ("Shelter: the basement"),
// added under warnings so the notification itself says where to go.
export function alertPayload(alert, place, shelter = '') {
  const where = place ? ` for ${place}` : '';
  const body = alert.headline || alert.kid || 'The National Weather Service issued an alert.';
  return {
    title: `${alertLevel(alert) === 'warning' ? '⚠️ ' : ''}${alert.event}${where}`,
    body: shelter ? `${shelter}. ${body}` : body,
    tag: `alert:${alert.id}`,
    url: shelter ? '/?shelter=1' : '/',
    requireInteraction: alertLevel(alert) === 'warning',
  };
}

// VAPID keys identify this server to the browsers' push services. They come from
// the environment, or are generated once and kept in the data volume.
export function loadVapid(cfg) {
  const { env } = cfg;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const file = path.join(cfg.dataDir, '.vapid.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.publicKey && saved.privateKey) return saved;
  } catch { /* first start */ }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

function vapidSubject(cfg) {
  if (cfg.env.VAPID_SUBJECT) return cfg.env.VAPID_SUBJECT;
  const email = cfg.nwsUserAgent.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  return email ? `mailto:${email}` : 'mailto:weather-scout@localhost';
}

export class PushService {
  constructor(db, cfg, { send = webpush.sendNotification.bind(webpush), log = console } = {}) {
    this.db = db;
    this.cfg = cfg;
    this.log = log;
    this.vapid = loadVapid(cfg);
    this.send = send;
    this.options = { vapidDetails: { subject: vapidSubject(cfg), ...this.vapid }, TTL: 6 * 3600 };
  }

  get publicKey() {
    return this.vapid.publicKey;
  }

  subscribe({ subscription, place, levels }, userId = null) {
    const { endpoint, keys } = subscription || {};
    if (!/^https:\/\//.test(endpoint || '') || !keys?.p256dh || !keys?.auth) throw Object.assign(new Error('That is not a valid push subscription.'), { statusCode: 400 });
    const lv = (levels || ['warning']).filter((l) => LEVELS.includes(l));
    if (!lv.length) throw Object.assign(new Error('Pick at least one kind of alert.'), { statusCode: 400 });
    const lat = Math.round(Number(place?.lat) * 100) / 100;
    const lon = Math.round(Number(place?.lon) * 100) / 100;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Object.assign(new Error('Pick a place for alerts.'), { statusCode: 400 });
    const name = String(place?.name || '').slice(0, 80);
    const exists = this.db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (!exists && this.count() >= MAX_SUBSCRIPTIONS) throw Object.assign(new Error('This server has too many devices signed up for alerts.'), { statusCode: 429 });
    this.db.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, lat, lon, place_name, levels)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
        lat = excluded.lat, lon = excluded.lon, place_name = excluded.place_name, levels = excluded.levels
    `).run(endpoint, keys.p256dh, keys.auth, userId, lat, lon, name, JSON.stringify(lv));
    return this.status(endpoint);
  }

  status(endpoint) {
    const r = this.db.prepare('SELECT lat, lon, place_name, levels, last_sent_at FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    return r ? { subscribed: true, place: { lat: r.lat, lon: r.lon, name: r.place_name }, levels: JSON.parse(r.levels), lastSentAt: r.last_sent_at } : { subscribed: false };
  }

  unsubscribe(endpoint) {
    return this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint).changes > 0;
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n;
  }

  async deliver(row, payload) {
    try {
      await this.send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { ...this.options, urgency: payload.requireInteraction ? 'high' : 'normal' });
      this.db.prepare("UPDATE push_subscriptions SET last_sent_at = datetime('now') WHERE id = ?").run(row.id);
      return true;
    } catch (err) {
      // 404/410: the browser dropped this subscription (app removed, permission revoked).
      if (err.statusCode === 404 || err.statusCode === 410) {
        this.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      } else {
        this.log.warn?.({ err: err.message, status: err.statusCode }, 'push send failed');
      }
      return false;
    }
  }

  async test(endpoint) {
    const row = this.db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (!row) throw Object.assign(new Error('This device is not signed up for alerts.'), { statusCode: 404 });
    const ok = await this.deliver(row, {
      title: '🦝 Rocky here!',
      body: `Weather alerts are on for ${row.place_name || 'your place'}. I'll ping you when the weather service sends one.`,
      tag: 'test',
      url: '/',
    });
    if (!ok) throw Object.assign(new Error('The push service did not accept the test. Try turning alerts off and on again.'), { statusCode: 502 });
    return { ok };
  }

  // One pass: fetch alerts once per subscribed place and send anything new.
  async check(getAlerts) {
    const rows = this.db.prepare('SELECT * FROM push_subscriptions').all();
    const places = new Map();
    for (const r of rows) {
      const k = `${r.lat},${r.lon}`;
      if (!places.has(k)) places.set(k, []);
      places.get(k).push(r);
    }
    const sentBefore = this.db.prepare('SELECT 1 FROM push_sent WHERE subscription_id = ? AND alert_id = ?');
    const markSent = this.db.prepare('INSERT OR IGNORE INTO push_sent (subscription_id, alert_id) VALUES (?, ?)');
    let sent = 0;
    for (const [k, subs] of places) {
      const [lat, lon] = k.split(',').map(Number);
      let alerts;
      try {
        alerts = (await getAlerts({ lat, lon })).alerts || [];
      } catch (err) {
        this.log.warn?.({ err: err.message, place: k }, 'push: could not fetch alerts');
        continue;
      }
      for (const sub of subs) {
        const levels = JSON.parse(sub.levels);
        for (const a of alerts) {
          if (!a.id || !levels.includes(alertLevel(a)) || sentBefore.get(sub.id, a.id)) continue;
          markSent.run(sub.id, a.id);
          if (await this.deliver(sub, alertPayload(a, sub.place_name, this.shelterFor?.(a) || ''))) sent++;
        }
      }
    }
    this.db.prepare("DELETE FROM push_sent WHERE sent_at < datetime('now', '-7 days')").run();
    return { places: places.size, sent };
  }

  start(getAlerts, everyMs) {
    const run = () => this.check(getAlerts).catch((err) => this.log.error?.(err, 'push check failed'));
    this.timer = setInterval(run, everyMs);
    this.timer.unref?.();
    setTimeout(run, 5000).unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }
}
