// Severe weather push notifications (Web Push). Each browser or phone that turns
// alerts on stores a subscription for one place. A background loop checks NWS
// alerts for every subscribed place and sends each new alert once.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { WINDOW_MIN, dirWord } from '../../shared/lightning.js';

export const LEVELS = ['warning', 'watch', 'advisory'];
const MAX_SUBSCRIPTIONS = 200;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
// A briefing that could not go out on time (server down) is still sent up to
// this long after the chosen time, and skipped after that.
const BRIEFING_GRACE_MIN = 90;

const minutesOf = (hhmm) => {
  const m = TIME.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Local date and minutes-after-midnight at a place, from its UTC offset.
export function localClock(offsetSeconds, now = Date.now()) {
  const d = new Date(now + offsetSeconds * 1000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// Is a briefing due for this subscription right now?
export function briefingDue(row, offsetSeconds, now = Date.now()) {
  const at = minutesOf(row.briefing_time);
  if (at == null || offsetSeconds == null) return false;
  const { date, minutes } = localClock(offsetSeconds, now);
  return row.briefing_sent !== date && minutes >= at && minutes < at + BRIEFING_GRACE_MIN;
}

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

const ago = (min) => (min <= 0 ? 'just now' : `${min} minute${min === 1 ? '' : 's'} ago`);

// "Lightning 4 miles away": sent once when a storm's lightning first comes inside the circle.
export function lightningPayload(near, place) {
  const s = near.nearest;
  const miles = s.miles < 1 ? 'less than 1 mile' : `${Math.round(s.miles)} mile${Math.round(s.miles) === 1 ? '' : 's'}`;
  const where = place ? ` of ${place}` : '';
  return {
    title: `⚡ Lightning ${s.miles < 1 ? 'overhead' : `${Math.round(s.miles)} mi away`}`,
    body: `Lightning struck ${miles} ${dirWord(s.dir)}${where} ${ago(s.ageMin)}. Head indoors and stay in until 30 minutes after the last thunder.`.replace(/\s+/g, ' '),
    tag: 'lightning',
    url: '/?lightning=1',
    requireInteraction: s.miles <= 10,
  };
}

// The 30-30 rule's second half: 30 minutes with no lightning inside the circle.
export function lightningClearPayload(miles, place) {
  return {
    title: '✅ Lightning all clear',
    body: `No lightning within ${miles} miles${place ? ` of ${place}` : ''} for ${WINDOW_MIN} minutes. It is OK to head back outside. If you hear thunder again, go back in.`,
    tag: 'lightning',
    url: '/?lightning=1',
    requireInteraction: false,
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

// Tapping the briefing opens the app on that device's briefing place.
export const briefingLink = (row) => `/?${new URLSearchParams({ briefing: '1', lat: row.lat, lon: row.lon, place: row.place_name || '' })}`;

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

  subscribe({ subscription, place, levels, briefingTime, lightningMiles }, userId = null) {
    const { endpoint, keys } = subscription || {};
    if (!/^https:\/\//.test(endpoint || '') || !keys?.p256dh || !keys?.auth) throw Object.assign(new Error('That is not a valid push subscription.'), { statusCode: 400 });
    const lv = (levels || ['warning']).filter((l) => LEVELS.includes(l));
    const briefing = briefingTime ? (TIME.test(briefingTime) ? briefingTime : null) : null;
    if (briefingTime && !briefing) throw Object.assign(new Error('Pick a time for the morning briefing, like 07:00.'), { statusCode: 400 });
    const lightning = Number.isInteger(lightningMiles) && lightningMiles > 0 ? Math.min(100, lightningMiles) : null;
    if (!lv.length && !briefing && !lightning) throw Object.assign(new Error('Pick at least one kind of alert, or the morning briefing.'), { statusCode: 400 });
    const lat = Math.round(Number(place?.lat) * 100) / 100;
    const lon = Math.round(Number(place?.lon) * 100) / 100;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Object.assign(new Error('Pick a place for alerts.'), { statusCode: 400 });
    const name = String(place?.name || '').slice(0, 80);
    const exists = this.db.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    if (!exists && this.count() >= MAX_SUBSCRIPTIONS) throw Object.assign(new Error('This server has too many devices signed up for alerts.'), { statusCode: 429 });
    // Changing the place or time clears the stored offset and "sent today" mark,
    // so a new time later today still gets its briefing.
    this.db.prepare(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, lat, lon, place_name, levels, briefing_time, lightning_miles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
        utc_offset = CASE WHEN lat = excluded.lat AND lon = excluded.lon THEN utc_offset ELSE NULL END,
        briefing_sent = CASE WHEN briefing_time IS excluded.briefing_time AND lat = excluded.lat AND lon = excluded.lon THEN briefing_sent ELSE NULL END,
        lightning_alert_at = CASE WHEN lat = excluded.lat AND lon = excluded.lon AND lightning_miles IS excluded.lightning_miles THEN lightning_alert_at ELSE NULL END,
        lat = excluded.lat, lon = excluded.lon, place_name = excluded.place_name, levels = excluded.levels, briefing_time = excluded.briefing_time,
        lightning_miles = excluded.lightning_miles
    `).run(endpoint, keys.p256dh, keys.auth, userId, lat, lon, name, JSON.stringify(lv), briefing, lightning);
    return this.status(endpoint);
  }

  status(endpoint) {
    const r = this.db.prepare('SELECT lat, lon, place_name, levels, last_sent_at, briefing_time, lightning_miles FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
    return r
      ? { subscribed: true, place: { lat: r.lat, lon: r.lon, name: r.place_name }, levels: JSON.parse(r.levels), lastSentAt: r.last_sent_at, briefingTime: r.briefing_time || null, lightningMiles: r.lightning_miles || null }
      : { subscribed: false };
  }

  unsubscribe(endpoint) {
    return this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint).changes > 0;
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n;
  }

  lightningCount() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE lightning_miles > 0').get().n;
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

  async testBriefing(endpoint, getBriefing) {
    const row = this.db.prepare('SELECT s.*, u.display_name FROM push_subscriptions s LEFT JOIN users u ON u.id = s.user_id WHERE s.endpoint = ?').get(endpoint);
    if (!row) throw Object.assign(new Error('This device is not signed up for notifications.'), { statusCode: 404 });
    const { briefing: b } = await getBriefing({ lat: row.lat, lon: row.lon, place: row.place_name, name: row.display_name || '' });
    const ok = await this.deliver(row, { title: b.title, body: b.short, tag: 'briefing', url: briefingLink(row) });
    if (!ok) throw Object.assign(new Error('The push service did not accept the test. Try turning notifications off and on again.'), { statusCode: 502 });
    return { ok, briefing: b };
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

  // Rocky's morning briefing. getBriefing({ lat, lon, place, name }) returns
  // { utcOffsetSeconds, briefing } for a place (the forecast is cached, so this is cheap).
  // A place is only looked up when one of its devices might be due.
  async checkBriefings(getBriefing, now = Date.now()) {
    const rows = this.db.prepare(`
      SELECT s.*, u.display_name FROM push_subscriptions s LEFT JOIN users u ON u.id = s.user_id
      WHERE s.briefing_time IS NOT NULL
    `).all();
    const places = new Map();
    for (const r of rows) {
      // Unknown offset: look it up. Known: only when the clock says it is time.
      if (r.utc_offset != null && !briefingDue(r, r.utc_offset, now)) continue;
      const k = `${r.lat},${r.lon}`;
      if (!places.has(k)) places.set(k, []);
      places.get(k).push(r);
    }
    const setOffset = this.db.prepare('UPDATE push_subscriptions SET utc_offset = ? WHERE id = ?');
    const markSent = this.db.prepare('UPDATE push_subscriptions SET briefing_sent = ? WHERE id = ?');
    let sent = 0;
    for (const [k, subs] of places) {
      const [lat, lon] = k.split(',').map(Number);
      let offset;
      for (const sub of subs) {
        let b;
        try {
          b = await getBriefing({ lat, lon, place: sub.place_name, name: sub.display_name || '' });
        } catch (err) {
          this.log.warn?.({ err: err.message, place: k }, 'push: could not build the morning briefing');
          break;
        }
        offset = b.utcOffsetSeconds ?? 0;
        if (sub.utc_offset !== offset) setOffset.run(offset, sub.id);
        if (!briefingDue(sub, offset, now)) continue;
        markSent.run(localClock(offset, now).date, sub.id);
        const payload = { title: b.briefing.title, body: b.briefing.short, tag: 'briefing', url: briefingLink(sub), requireInteraction: false };
        if (await this.deliver(sub, payload)) sent++;
      }
    }
    return { places: places.size, sent };
  }

  // Lightning near each device's place: one alert when strikes first come inside
  // its circle (fresh ones, last 10 minutes), then one all-clear after 30 quiet
  // minutes. Nothing is sent while the lightning data itself is stale, so an
  // outage never looks like an all-clear.
  async checkLightning(lightning, now = Date.now()) {
    if (!lightning?.enabled || !lightning.healthy()) return { sent: 0, skipped: true };
    const rows = this.db.prepare('SELECT * FROM push_subscriptions WHERE lightning_miles > 0').all();
    const setAlert = this.db.prepare('UPDATE push_subscriptions SET lightning_alert_at = ?, lightning_last_strike = ? WHERE id = ?');
    let sent = 0;
    for (const sub of rows) {
      const near = lightning.near({ lat: sub.lat, lon: sub.lon }, sub.lightning_miles);
      const newest = near.newest?.t ?? null;
      if (sub.lightning_alert_at == null) {
        if (!near.last10 || !near.nearest) continue;
        setAlert.run(now, newest, sub.id);
        if (await this.deliver(sub, lightningPayload(near, sub.place_name))) sent++;
        continue;
      }
      const last = Math.max(sub.lightning_last_strike || 0, newest || 0, sub.lightning_alert_at);
      if (now - last >= WINDOW_MIN * 60_000) {
        setAlert.run(null, null, sub.id);
        if (await this.deliver(sub, lightningClearPayload(sub.lightning_miles, sub.place_name))) sent++;
      } else if (last !== sub.lightning_last_strike) {
        setAlert.run(sub.lightning_alert_at, last, sub.id);
      }
    }
    return { sent };
  }

  start(getAlerts, everyMs, getBriefing, lightning) {
    const run = () => this.check(getAlerts).catch((err) => this.log.error?.(err, 'push check failed'));
    this.timer = setInterval(run, everyMs);
    this.timer.unref?.();
    setTimeout(run, 5000).unref?.();
    if (getBriefing) {
      const brief = () => this.checkBriefings(getBriefing).catch((err) => this.log.error?.(err, 'briefing check failed'));
      this.briefTimer = setInterval(brief, 60_000);
      this.briefTimer.unref?.();
      setTimeout(brief, 8000).unref?.();
    }
    if (lightning?.enabled) {
      const bolt = () => this.checkLightning(lightning).catch((err) => this.log.error?.(err, 'lightning alert check failed'));
      this.boltTimer = setInterval(bolt, 60_000);
      this.boltTimer.unref?.();
    }
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.briefTimer);
    clearInterval(this.boltTimer);
  }
}
