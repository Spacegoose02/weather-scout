// Blitzortung.org: a worldwide volunteer network of ground lightning sensors.
// Strikes arrive over a WebSocket within seconds and are located to a few
// hundred meters. The data is free for private, non-commercial use only and
// must be credited to "Blitzortung.org and contributors", so this feed is off
// until the server's owner turns it on (BLITZORTUNG_ENABLED=true) for a
// personal home server. See https://www.blitzortung.org/en/cover_your_area.php

export const BLITZ_HOSTS = ['wss://ws1.blitzortung.org/', 'wss://ws7.blitzortung.org/', 'wss://ws8.blitzortung.org/'];

// The live map's messages are packed with a small LZW-style code.
export function decodeBlitz(input) {
  const chars = String(input).split('');
  if (!chars.length) return '';
  const dict = {};
  let c = chars[0];
  let prev = c;
  const out = [c];
  let code = 256;
  for (let i = 1; i < chars.length; i++) {
    const n = chars[i].charCodeAt(0);
    const entry = n < 256 ? chars[i] : dict[n] ?? prev + c;
    out.push(entry);
    c = entry.charAt(0);
    dict[code] = prev + c;
    code += 1;
    prev = entry;
  }
  return out.join('');
}

// One message into a strike { t, lat, lon, src: 'bo' }, or null.
export function parseBlitz(message) {
  const text = String(message);
  let o = null;
  // Packed messages also start with "{", so try plain JSON first, then unpack.
  for (const attempt of [() => JSON.parse(text), () => JSON.parse(decodeBlitz(text))]) {
    try { o = attempt(); break; } catch { /* next */ }
  }
  if (!o) return null;
  const lat = Number(o?.lat);
  const lon = Number(o?.lon);
  const ns = Number(o?.time);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ns) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { t: Math.round(ns / 1e6), lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, src: 'bo' };
}

// Keeps one WebSocket open while someone needs lightning, moving to the next
// server (with a growing pause) when one drops.
export class BlitzFeed {
  constructor({ WebSocketImpl = globalThis.WebSocket, hosts = BLITZ_HOSTS, log = console, onStrikes = () => {}, timers = globalThis } = {}) {
    this.WS = WebSocketImpl;
    this.hosts = hosts;
    this.log = log;
    this.onStrikes = onStrikes;
    this.timers = timers;
    this.ws = null;
    this.host = 0;
    this.failures = 0;
    this.wanted = false;
    this.connected = false;
    this.lastStrike = null;
    this.error = '';
    this.batch = [];
  }

  start() {
    this.wanted = true;
    if (!this.ws && !this.retry) this.connect();
  }

  stop() {
    this.wanted = false;
    this.timers.clearTimeout(this.retry);
    this.retry = null;
    this.timers.clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.flush();
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    try { ws?.close(); } catch { /* already closed */ }
  }

  connect() {
    if (!this.WS) {
      this.error = 'This Node.js has no WebSocket support.';
      return;
    }
    const url = this.hosts[this.host % this.hosts.length];
    let ws;
    try {
      ws = new this.WS(url);
    } catch (err) {
      this.error = err.message;
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.failures = 0;
      this.error = '';
      ws.send('{"a":111}');
    };
    ws.onmessage = (ev) => {
      const s = parseBlitz(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (!s) return;
      this.lastStrike = Date.now();
      this.batch.push(s);
      // Hand strikes over in small batches instead of one at a time.
      if (!this.flushTimer) this.flushTimer = this.timers.setTimeout(() => { this.flushTimer = null; this.flush(); }, 1000);
    };
    ws.onerror = (ev) => { this.error = ev?.message || 'connection error'; };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.connected = false;
      if (this.wanted) {
        this.host += 1;
        this.scheduleRetry();
      }
    };
  }

  scheduleRetry() {
    if (!this.wanted) return;
    this.failures += 1;
    const delay = Math.min(5 * 60_000, 2000 * 2 ** Math.min(this.failures, 8));
    this.retry = this.timers.setTimeout(() => { this.retry = null; if (this.wanted) this.connect(); }, delay);
    this.retry?.unref?.();
  }

  flush() {
    if (!this.batch.length) return;
    const b = this.batch;
    this.batch = [];
    this.onStrikes(b);
  }
}
