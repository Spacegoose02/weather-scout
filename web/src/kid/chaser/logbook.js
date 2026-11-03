// Storm Chaser Logbook: storms you watched (safely, from home), what you saw,
// points for each sighting and chaser ranks. Entries live in kid data as
// data.chaseLog = [{ id, day, time, saw: [...], hail, from, note, photoId, weather }].

export const SIGHTINGS = [
  { id: 'lightning', emoji: '⚡', label: 'Lightning', points: 2 },
  { id: 'thunder', emoji: '🔊', label: 'Thunder', points: 1 },
  { id: 'downpour', emoji: '🌧️', label: 'Downpour', points: 1 },
  { id: 'hail', emoji: '🧊', label: 'Hail', points: 3 },
  { id: 'gusts', emoji: '💨', label: 'Strong gusts', points: 2 },
  { id: 'anvil', emoji: '🔨', label: 'Anvil cloud', points: 2 },
  { id: 'shelf', emoji: '🍰', label: 'Shelf cloud', points: 3 },
  { id: 'wall', emoji: '🧱', label: 'Wall cloud', points: 4 },
  { id: 'mammatus', emoji: '🫧', label: 'Mammatus', points: 3 },
  { id: 'funnel', emoji: '🌀', label: 'Funnel cloud', points: 5 },
  { id: 'tornado', emoji: '🌪️', label: 'Tornado (far away!)', points: 8 },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow after', points: 2 },
];
export const sightingById = Object.fromEntries(SIGHTINGS.map((s) => [s.id, s]));

export const WATCHED_FROM = [
  { id: 'window', emoji: '🪟', label: 'A window at home' },
  { id: 'porch', emoji: '🏡', label: 'Covered porch (no thunder yet)' },
  { id: 'car', emoji: '🚗', label: 'In the car with a grown-up' },
  { id: 'school', emoji: '🏫', label: 'School' },
  { id: 'radar', emoji: '📡', label: 'On radar only' },
];

export const RANKS = [
  { at: 0, emoji: '🐣', name: 'Storm Watcher' },
  { at: 5, emoji: '🌦️', name: 'Cloud Rookie' },
  { at: 15, emoji: '🎒', name: 'Junior Chaser' },
  { at: 35, emoji: '📡', name: 'Storm Tracker' },
  { at: 60, emoji: '👑', name: 'Supercell Scout' },
  { at: 100, emoji: '🌪️', name: 'Master Storm Chaser' },
];

// Points for one entry: each sighting, +1 for a photo, +1 for a note.
export function entryPoints(e) {
  const seen = [...new Set(e.saw || [])].reduce((n, id) => n + (sightingById[id]?.points || 0), 0);
  return seen + (e.photoId ? 1 : 0) + (e.note?.trim() ? 1 : 0);
}

export function logStats(log = []) {
  const points = log.reduce((n, e) => n + entryPoints(e), 0);
  const kinds = new Set(log.flatMap((e) => e.saw || []));
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].at) i += 1;
  const rank = RANKS[i];
  const next = RANKS[i + 1] || null;
  return { points, storms: log.length, kinds, rank, next, toNext: next ? next.at - points : 0, photos: log.filter((e) => e.photoId).length };
}

// Logbook badges this log has earned (ids).
export function logBadges(log = []) {
  const s = logStats(log);
  const out = [];
  if (s.storms >= 1) out.push('log-first');
  if (s.storms >= 10) out.push('log-10');
  if (s.photos >= 1) out.push('log-photo');
  if (s.kinds.has('hail')) out.push('log-hail');
  if (s.kinds.has('wall') || s.kinds.has('shelf')) out.push('log-structure');
  if (s.points >= RANKS.find((r) => r.name === 'Storm Tracker').at) out.push('log-tracker');
  return out;
}

export const LOG_MAX = 200;
export function addEntry(log = [], entry) {
  return [entry, ...log.filter((e) => e.id !== entry.id)].sort((a, b) => `${b.day}${b.time || ''}`.localeCompare(`${a.day}${a.time || ''}`)).slice(0, LOG_MAX);
}

export const PHOTO_SPOT = 'chase-log';
