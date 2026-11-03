// Strike lists in the browser: turning the API's compact rows into objects,
// adding new rows to what the map already has, and dropping faded ones.
import { WINDOW_MIN } from '../../../shared/lightning.js';

export const fromRows = (rows = []) => rows.map(([t, lat, lon, src]) => ({ t, lat, lon, src }));
const key = (s) => `${s.t}|${s.lat}|${s.lon}|${s.src}`;

// Newest first, no duplicates, nothing older than the window.
export function mergeStrikes(have, incoming, now = Date.now()) {
  const since = now - WINDOW_MIN * 60_000;
  const seen = new Set();
  const out = [];
  for (const s of [...incoming, ...have]) {
    if (s.t < since) continue;
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.sort((a, b) => b.t - a.t);
}

export const newestTime = (list) => list.reduce((m, s) => Math.max(m, s.t), 0);

// "12 strikes in view" plus how many were in the last 5 minutes.
export function countText(list, now = Date.now()) {
  if (!list.length) return 'No lightning in view (last 30 min)';
  const recent = list.filter((s) => s.t >= now - 5 * 60_000).length;
  return `⚡ ${list.length.toLocaleString()} strike${list.length === 1 ? '' : 's'} in view${recent ? `, ${recent.toLocaleString()} in the last 5 min` : ''}`;
}
