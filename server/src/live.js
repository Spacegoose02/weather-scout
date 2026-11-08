// Instant updates: an open line (server-sent events) from each open app to the
// server. Once a minute the server checks every watched place, and the moment a
// warning appears or ends, or a storm turns toward the place, it tells the app,
// which reloads right away instead of waiting for its 10-minute refresh.
// One check per place, however many family members have the app open.

const MIN = 60_000;
export const MAX_CLIENTS = 200;

const alertKey = (list) => (list || []).map((a) => a.id).sort().join('|');

// What changed between two alert lists, for the app's "New: Tornado Warning".
export function alertChange(before, after) {
  const was = new Set((before || []).map((a) => a.id));
  const now = new Set((after || []).map((a) => a.id));
  return {
    added: (after || []).filter((a) => !was.has(a.id)).map((a) => ({ id: a.id, event: a.event, severity: a.severity })),
    ended: (before || []).filter((a) => !now.has(a.id)).map((a) => ({ id: a.id, event: a.event })),
  };
}

export const sseLine = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export class LiveHub {
  constructor({ alerts, storm = async () => null, log = console, intervalMs = MIN, heartbeatMs = 25_000 }) {
    Object.assign(this, { alerts, storm, log, intervalMs, heartbeatMs });
    this.clients = new Set();
    this.places = new Map(); // place key -> { alerts, storm }
    this.timer = null;
    this.beat = null;
  }

  // `send(text)` writes to the client; `place` is { lat, lon, units }.
  add(client) {
    if (this.clients.size >= MAX_CLIENTS) return false;
    client.key = `${client.place.lat},${client.place.lon}`;
    this.clients.add(client);
    this.ensureRunning();
    return true;
  }

  remove(client) {
    this.clients.delete(client);
    if (!this.clients.size) this.stop();
  }

  ensureRunning() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((err) => this.log.warn?.({ err: err.message }, 'live tick failed')), this.intervalMs);
    this.beat = setInterval(() => this.broadcast(': ping\n\n'), this.heartbeatMs);
    this.timer.unref?.();
    this.beat.unref?.();
  }

  // End every open line (on shutdown), so the server can close.
  closeAll() {
    for (const c of this.clients) {
      try {
        c.end?.();
      } catch {
        // already gone
      }
    }
    this.clients.clear();
    this.stop();
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.beat);
    this.timer = null;
    this.beat = null;
  }

  broadcast(text, key = null) {
    for (const c of this.clients) {
      if (key && c.key !== key) continue;
      try {
        c.send(text);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  // Check each watched place once and tell its clients what changed.
  async tick() {
    const byKey = new Map();
    for (const c of this.clients) if (!byKey.has(c.key)) byKey.set(c.key, c.place);
    for (const k of [...this.places.keys()]) if (!byKey.has(k)) this.places.delete(k);
    await Promise.all([...byKey.entries()].map(async ([k, place]) => {
      const prev = this.places.get(k);
      const [al, cell] = await Promise.all([
        this.alerts(place).catch(() => null),
        this.storm(place).catch(() => null),
      ]);
      const next = { alerts: al ? al.alerts || [] : prev?.alerts ?? null, storm: cell ? cell.id : null };
      this.places.set(k, next);
      if (!prev) return; // the first look just sets the baseline
      if (al && alertKey(prev.alerts) !== alertKey(next.alerts)) {
        this.broadcast(sseLine('alerts', { ...alertChange(prev.alerts, next.alerts), count: next.alerts.length }), k);
      }
      if (next.storm && next.storm !== prev.storm) {
        this.broadcast(sseLine('storm', { id: cell.id, level: cell.level, eta: cell.threat?.eta ?? null, moving: cell.moving || null }), k);
      }
    }));
  }
}

export function registerLive(app, { hub, latLonSchema, loc }) {
  app.get('/api/live', { schema: latLonSchema }, (req, reply) => {
    const place = loc(req.query);
    const client = { place, send: (t) => reply.raw.write(t), end: () => reply.raw.end() };
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // let nginx and friends pass it straight through
    });
    if (!hub.add(client)) {
      reply.raw.end(sseLine('busy', { retryMs: 5 * MIN }));
      return;
    }
    // retry: how long the browser waits before reconnecting after a drop.
    reply.raw.write(`retry: 15000\n${sseLine('hello', { place: { lat: place.lat, lon: place.lon }, checkEverySec: Math.round(hub.intervalMs / 1000) })}`);
    req.raw.on('close', () => hub.remove(client));
  });
}
