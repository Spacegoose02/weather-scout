// Tiny in-memory TTL cache with request coalescing, so many family members
// opening the app at once only cost one upstream request.
export class TtlCache {
  constructor({ max = 500 } = {}) {
    this.max = max;
    this.map = new Map();
    this.inflight = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs, freshMs) {
    if (this.map.size >= this.max && !this.map.has(key)) this.map.delete(this.map.keys().next().value);
    const now = Date.now();
    this.map.set(key, { value, expires: now + ttlMs, fresh: freshMs == null ? null : now + freshMs });
  }

  async wrap(key, ttlMs, fn) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /**
   * Like wrap, but an answer older than `freshMs` (and younger than `staleMs`) is
   * still served right away while a fresh one is fetched in the background, so
   * nobody waits on the upstream once the server has a copy.
   */
  async wrapStale(key, freshMs, staleMs, fn) {
    const hit = this.map.get(key);
    const now = Date.now();
    if (hit && hit.expires >= now) {
      if (hit.fresh != null && hit.fresh < now && !this.inflight.has(key)) this._load(key, staleMs, freshMs, fn).catch(() => {});
      return hit.value;
    }
    if (this.inflight.has(key)) return this.inflight.get(key);
    return this._load(key, staleMs, freshMs, fn);
  }

  _load(key, ttlMs, freshMs, fn) {
    const p = (async () => {
      try {
        const value = await fn();
        this.set(key, value, ttlMs, freshMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}

export class UpstreamError extends Error {
  constructor(source, status, message) {
    super(message || `${source} responded ${status}`);
    this.source = source;
    this.status = status;
  }
}

export async function fetchJson(url, { headers = {}, source = 'upstream', timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new UpstreamError(source, res.status);
  return res.json();
}
