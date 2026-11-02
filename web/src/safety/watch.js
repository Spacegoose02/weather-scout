import { shelterAlerts } from '../../../shared/safety-plan.js';

// Which warnings should pop the shelter guide open on their own. Each warning
// opens it once per device; closing it (or "We're safe") remembers that alert,
// so the 10-minute weather refresh doesn't keep throwing it back up. A new
// warning (a new NWS id) opens it again.
const KEY = 'weather-scout:shelter-seen';
const KEEP_MS = 3 * 24 * 3_600_000;

export function readSeen(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === 'number' && now - t < KEEP_MS));
  } catch {
    return {};
  }
}

export function markSeen(ids, now = Date.now()) {
  const seen = { ...readSeen(now) };
  for (const id of ids) if (id) seen[id] = now;
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* private mode */
  }
  return seen;
}

/** The shelter warnings out now, and whether any of them is new to this device. */
export function shelterWatch(alerts, seen = {}) {
  const active = shelterAlerts(alerts);
  return { active, fresh: active.some(({ alert }) => alert.id && !seen[alert.id]) };
}
