// Junior Storm Chaser, live features: saved state and game rules.
// Kid data keeps it under data.chase = {
//   targets: [{ day, lat, lon, pickedAt, result? }],   // pick-your-target game
//   cards:   { [cardId]: card },                      // storm card binder
//   briefDays: ['YYYY-MM-DD'],                         // days Rocky's chase briefing was heard
//   watched: ['YYYY-MM-DD'],                           // days a live chase was watched
// }

export const MAX_TARGETS = 120;
export const MAX_CARDS = 150;
// Lower 48 only: that's where the Storm Prediction Center draws outlooks.
export const CONUS = { south: 24, north: 50, west: -125, east: -66 };
export const inConus = (lat, lon) => lat >= CONUS.south && lat <= CONUS.north && lon >= CONUS.west && lon <= CONUS.east;

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
// SPC's own colors for report dots: red tornado, blue wind, green hail.
export const REPORT_COLOR = { tornado: '#e53935', wind: '#1e66d0', hail: '#2e9e44' };
export const REPORT_NAME = { tornado: 'Tornado', wind: 'Wind damage', hail: 'Hail' };

const uniqDays = (a = [], b = []) => [...new Set([...a, ...b])].filter((d) => typeof d === 'string').sort().slice(-60);

// Same idea as mergeKid: nothing earned on one device is lost on another.
export function mergeChase(a = {}, b = {}) {
  const targets = new Map();
  for (const t of [...(a.targets || []), ...(b.targets || [])]) {
    if (!t?.day) continue;
    const prev = targets.get(t.day);
    const better = !prev || (t.result?.final && !prev.result?.final) || (t.result && !prev.result);
    if (better) targets.set(t.day, t);
  }
  const cards = { ...(a.cards || {}), ...(b.cards || {}) };
  const ids = Object.keys(cards).sort().slice(-MAX_CARDS);
  return {
    ...a,
    ...b,
    targets: [...targets.values()].sort((x, y) => x.day.localeCompare(y.day)).slice(-MAX_TARGETS),
    cards: Object.fromEntries(ids.map((id) => [id, cards[id]])),
    briefDays: uniqDays(a.briefDays, b.briefDays),
    watched: uniqDays(a.watched, b.watched),
  };
}

export const chaseOf = (data) => mergeChase(data?.chase || {}, {});

export function targetFor(chase, day) {
  return (chase.targets || []).find((t) => t.day === day) || null;
}

export function setTarget(chase, { day, lat, lon }, now = new Date()) {
  const targets = (chase.targets || []).filter((t) => t.day !== day);
  targets.push({ day, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, pickedAt: now.toISOString() });
  return { ...chase, targets: targets.sort((x, y) => x.day.localeCompare(y.day)).slice(-MAX_TARGETS) };
}

export function setResult(chase, day, result) {
  return { ...chase, targets: (chase.targets || []).map((t) => (t.day === day ? { ...t, result } : t)) };
}

export function totals(chase) {
  const scored = (chase.targets || []).filter((t) => t.result && t.result.reports > 0);
  const points = scored.reduce((n, t) => n + (t.result.points || 0), 0);
  const best = scored.reduce((b, t) => (b == null || t.result.miles < b ? t.result.miles : b), null);
  return { played: (chase.targets || []).length, scored: scored.length, points, best };
}

// Chaser rank from total target points.
export const RANKS = [
  [0, '🐣', 'Rookie Spotter'],
  [10, '🔭', 'Storm Watcher'],
  [30, '🚙', 'Junior Chaser'],
  [60, '🧭', 'Storm Navigator'],
  [100, '🌪️', 'Master Chaser'],
];
export function rankFor(points) {
  let r = RANKS[0];
  for (const x of RANKS) if (points >= x[0]) r = x;
  const next = RANKS[RANKS.indexOf(r) + 1] || null;
  return { emoji: r[1], name: r[2], next: next ? { at: next[0], name: next[2], emoji: next[1] } : null };
}

export function pointsWord(result) {
  if (!result) return '';
  if (!result.reports) return 'No storm reports yet.';
  const m = result.miles;
  if (m <= 25) return 'BULLSEYE! You were right in the storms!';
  if (m <= 50) return 'So close! You could have seen those storms.';
  if (m <= 100) return 'Nice target! Not far from the action.';
  if (m <= 200) return 'Good try. The storms were a drive away.';
  if (m <= 400) return 'The storms fired pretty far from your target.';
  return 'Way off this time. Chasers miss lots of days too!';
}

export function addCard(chase, card) {
  if (chase.cards?.[card.id]) return chase;
  const keep = {
    id: card.id, day: card.day, type: card.type, emoji: card.emoji, name: card.name, place: card.place, state: card.state,
    lat: card.lat, lon: card.lon, time: card.time, stat: card.stat, power: card.power, rarity: card.rarity, fact: card.fact,
    stormOfTheDay: !!card.stormOfTheDay,
  };
  return mergeChase(chase, { cards: { [card.id]: keep } });
}

export function binderStats(chase) {
  const cards = Object.values(chase.cards || {});
  const by = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  for (const c of cards) by[c.rarity] = (by[c.rarity] || 0) + 1;
  return { total: cards.length, by, types: new Set(cards.map((c) => c.type)).size };
}

// Badge ids each piece of chase progress unlocks (for kid.earn).
export function chaseBadges(chase) {
  const out = [];
  const t = totals(chase);
  const b = binderStats(chase);
  if ((chase.briefDays || []).length >= 3) out.push('chase-forecaster');
  if (t.scored >= 1) out.push('chase-target');
  if ((chase.targets || []).some((x) => x.result?.reports > 0 && x.result.miles <= 25)) out.push('chase-bullseye');
  if (t.played >= 10) out.push('chase-season');
  if (t.points >= 100) out.push('chase-master');
  if ((chase.watched || []).length >= 1) out.push('chase-live');
  if (b.total >= 1) out.push('chase-card');
  if (b.total >= 25) out.push('chase-binder');
  if (b.by.legendary >= 1) out.push('chase-legendary');
  return out;
}

// "3:15 PM" in the kid's own time zone.
export const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

const R = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
export function milesBetween(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const listWords = (xs) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
