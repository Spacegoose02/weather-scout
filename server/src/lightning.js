// Live lightning: keeps the last 30 minutes of strikes from every enabled source
// in memory and answers "what's in this map view" and "how close is it to me".
// Sources only run while someone is looking at lightning or has a lightning
// alert turned on, so an idle server does not download satellite data all day.
import { GlmFeed } from './providers/glm.js';
import { BlitzFeed } from './providers/blitzortung.js';
import { WINDOW_MIN, SOURCES, ALERT_MILES, DEFAULT_ALERT_MILES, inBox, nearby, boxAround } from '../../shared/lightning.js';

const WINDOW_MS = WINDOW_MIN * 60_000;
const IDLE_MS = 10 * 60_000; // keep the feeds running this long after the last viewer
const MAX_RETURN = 6000;

// Wrap longitudes from a panned-around map into -180..180.
const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

export class LightningService {
  constructor(cfg, { fetchImpl = fetch, log = console, WebSocketImpl, now = () => Date.now(), timers = globalThis } = {}) {
    this.log = log;
    this.now = now;
    this.timers = timers;
    this.deps = { fetchImpl, WebSocketImpl };
    this.strikes = [];
    this.lastViewer = 0;
    this.alertsWanted = () => false;
    this.glm = null;
    this.blitz = null;
    this.configure(cfg.lightning || {});
  }

  // (Re)build the sources from settings. Called again when an admin changes them
  // in Family & settings; strikes from a source that was turned off are dropped.
  configure(lc) {
    const old = this.cfg;
    this.cfg = { ...lc };
    const onStrikes = (list) => this.add(list);
    const { fetchImpl, WebSocketImpl } = this.deps;
    const glmSame = old && old.glm === lc.glm && old.satellite === lc.satellite && old.backfillMin === lc.backfillMin;
    if (!glmSame) this.glm = lc.glm === false ? null : new GlmFeed({ satellite: lc.satellite, backfillMin: lc.backfillMin ?? 10, fetchImpl, log: this.log, onStrikes, parse: lc.parse });
    if (!!old?.blitzortung !== !!lc.blitzortung || !old) {
      this.blitz?.stop();
      this.blitz = lc.blitzortung ? new BlitzFeed({ WebSocketImpl, log: this.log, onStrikes, timers: this.timers }) : null;
    }
    if (old) this.strikes = this.strikes.filter((s) => (s.src === 'glm' ? !!this.glm && glmSame : !!this.blitz));
    if (old && this.active()) this.tick().catch(() => {});
  }

  get enabled() {
    return !!(this.glm || this.blitz);
  }

  add(list) {
    const now = this.now();
    for (const s of list) if (s.t >= now - WINDOW_MS && s.t <= now + 60_000) this.strikes.push(s);
  }

  prune() {
    const since = this.now() - WINDOW_MS;
    if (this.strikes.length && this.strikes.some((s) => s.t < since)) this.strikes = this.strikes.filter((s) => s.t >= since);
  }

  // A viewer asked for lightning: make sure the feeds are running.
  touch() {
    const first = !this.active();
    this.lastViewer = this.now();
    if (first) this.tick().catch(() => {});
  }

  active() {
    return this.now() - this.lastViewer < IDLE_MS || this.alertsWanted();
  }

  // Fresh data from at least one source in the last few minutes.
  healthy() {
    const now = this.now();
    return (this.glm?.lastOk && now - this.glm.lastOk < 5 * 60_000) || !!this.blitz?.connected;
  }

  async tick() {
    this.prune();
    if (!this.enabled || !this.active()) {
      this.blitz?.stop();
      return;
    }
    this.blitz?.start();
    if (this.glm && !this.polling) {
      this.polling = true;
      try { await this.glm.poll(this.now()); } finally { this.polling = false; }
    }
  }

  start(everyMs = 30_000) {
    this.timers.clearInterval(this.timer);
    this.timer = this.timers.setInterval(() => this.tick().catch((err) => this.log.error?.(err, 'lightning update failed')), everyMs);
    this.timer?.unref?.();
    this.timers.setTimeout(() => this.tick().catch(() => {}), 3000)?.unref?.();
  }

  stop() {
    this.timers.clearInterval(this.timer);
    this.blitz?.stop();
  }

  // Strikes in a box, newest first, optionally only those after `since` (ms).
  query({ south, west, north, east }, { since = 0, limit = MAX_RETURN } = {}) {
    this.prune();
    const box = { south, west, north, east };
    const out = [];
    for (let i = this.strikes.length - 1; i >= 0 && out.length < limit; i--) {
      const s = this.strikes[i];
      if (s.t > since && inBox(s, box)) out.push(s);
    }
    return out.sort((a, b) => b.t - a.t);
  }

  near(place, miles = DEFAULT_ALERT_MILES) {
    const b = boxAround(place, miles);
    return nearby(this.query({ ...b, west: wrap(b.west), east: wrap(b.east) }, { limit: 50_000 }), place, { miles, now: this.now() });
  }

  status() {
    const list = [];
    if (this.glm) list.push({ id: 'glm', ...SOURCES.glm, satellite: this.glm.label, ok: !!this.glm.lastOk && this.now() - this.glm.lastOk < 5 * 60_000, updatedAt: this.glm.lastOk ? new Date(this.glm.lastOk).toISOString() : null, error: this.glm.error || undefined });
    if (this.blitz) list.push({ id: 'bo', ...SOURCES.bo, ok: this.blitz.connected, updatedAt: this.blitz.lastStrike ? new Date(this.blitz.lastStrike).toISOString() : null, error: this.blitz.error || undefined });
    return list;
  }
}

const num = { type: 'number' };
const boxSchema = {
  querystring: {
    type: 'object',
    required: ['south', 'west', 'north', 'east'],
    properties: { south: { ...num, minimum: -90, maximum: 90 }, north: { ...num, minimum: -90, maximum: 90 }, west: { ...num, minimum: -360, maximum: 360 }, east: { ...num, minimum: -360, maximum: 360 }, since: { type: 'integer', minimum: 0 } },
  },
};
const nearSchema = {
  querystring: {
    type: 'object',
    required: ['lat', 'lon'],
    properties: { lat: { ...num, minimum: -90, maximum: 90 }, lon: { ...num, minimum: -180, maximum: 180 }, miles: { ...num, minimum: 1, maximum: 100 } },
  },
};


export function registerLightning(app, lightning) {
  const off = (reply) => reply.code(404).send({ error: 'Lightning is turned off on this server.' });
  const meta = () => ({ windowMin: WINDOW_MIN, sources: lightning.status(), alertMiles: ALERT_MILES, now: lightning.now() });

  // Compact on purpose: a busy storm can mean thousands of strikes.
  app.get('/api/lightning', { schema: boxSchema }, async (req, reply) => {
    if (!lightning.enabled) return off(reply);
    lightning.touch();
    const q = req.query;
    const wide = q.east - q.west >= 360;
    const box = { south: q.south, north: q.north, west: wide ? -180 : wrap(q.west), east: wide ? 180 : wrap(q.east) };
    const strikes = lightning.query(box, { since: q.since || 0 });
    return { ...meta(), strikes: strikes.map((s) => [s.t, s.lat, s.lon, s.src]) };
  });

  app.get('/api/lightning/near', { schema: nearSchema }, async (req, reply) => {
    if (!lightning.enabled) return off(reply);
    lightning.touch();
    const miles = req.query.miles || DEFAULT_ALERT_MILES;
    return { ...meta(), ...lightning.near({ lat: req.query.lat, lon: req.query.lon }, miles) };
  });
}
