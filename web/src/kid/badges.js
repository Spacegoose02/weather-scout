// Badges earned outside the Kid Zone games: journal streaks, Learn quizzes and
// the cloud spotter. Progress lives next to the Kid Zone data
// (data.progress = { journalBest, journalPages, quizzes: {}, perfect: {}, clouds: {} })
// and only ever grows, so it is safe to save from anywhere in the app.
import { api } from '../api.js';
import { CLOUD_TYPES } from '../learn/topics.js';
import { BADGES } from './logic.js';

const size = (o) => Object.keys(o || {}).length;
const stormQuizzes = (p) => Object.keys(p.quizzes || {}).filter((k) => k.startsWith('storm-')).length;

// [have, need] for each progress badge, used both to award and to draw progress bars.
export const RULES = {
  'journal-first': (p) => [p.journalPages || 0, 1],
  'streak-3': (p) => [p.journalBest || 0, 3],
  'streak-7': (p) => [p.journalBest || 0, 7],
  'streak-30': (p) => [p.journalBest || 0, 30],
  'journal-25': (p) => [p.journalPages || 0, 25],
  'quiz-first': (p) => [size(p.quizzes), 1],
  'quiz-perfect': (p) => [size(p.perfect), 1],
  'quiz-5': (p) => [size(p.quizzes), 5],
  'storm-smart': (p) => [stormQuizzes(p), 3],
  'cloud-spotter': (p) => [size(p.clouds), 1],
  'cloud-collector': (p) => [size(p.clouds), 5],
  'cloud-master': (p) => [size(p.clouds), CLOUD_TYPES.length],
};
export const SUPER_SCOUT_AT = 10;

export function badgeProgress(id, data) {
  if (id === 'super-scout') return [Object.keys(data.badges || {}).filter((b) => b !== 'super-scout').length, SUPER_SCOUT_AT];
  const rule = RULES[id];
  return rule ? rule(data.progress || {}) : null;
}

// Badge ids the data has earned but not been given yet.
export function dueBadges(data) {
  const have = data.badges || {};
  const due = Object.keys(RULES).filter((id) => {
    if (have[id]) return false;
    const [n, need] = RULES[id](data.progress || {});
    return n >= need;
  });
  const total = Object.keys(have).filter((b) => b !== 'super-scout').length + due.length;
  if (!have['super-scout'] && total >= SUPER_SCOUT_AT) due.push('super-scout');
  return due;
}

// Same shape as the server's merge: numbers keep the max, maps are unioned.
export function mergeProgress(have = {}, add = {}) {
  const out = { ...have };
  for (const [k, v] of Object.entries(add || {})) {
    if (v && typeof v === 'object') {
      const inner = { ...(out[k] || {}) };
      for (const [ik, iv] of Object.entries(v)) inner[ik] = typeof iv === 'number' && typeof inner[ik] === 'number' ? Math.max(iv, inner[ik]) : inner[ik] ?? iv;
      out[k] = inner;
    } else {
      out[k] = typeof v === 'number' && typeof out[k] === 'number' ? Math.max(v, out[k]) : out[k] ?? v;
    }
  }
  return out;
}

// ---- the badge bus ---------------------------------------------------------------
// Any screen can call trackProgress(); the celebration popup (mounted once in App)
// and the Kid Zone hook listen for the event.
export const BADGE_EVENT = 'weather-scout:badges';
export const kidKey = (user) => `weather-scout:kid:${user?.id ?? 'guest'}`;
let currentUser = null;
export const setBadgeUser = (user) => {
  currentUser = user || null;
};

export const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const readLocal = (user) => {
  try {
    return JSON.parse(localStorage.getItem(kidKey(user)) || '{}');
  } catch {
    return {};
  }
};
// What this browser knows of the current kid's progress (for "spotted ✓" marks).
export const localProgress = () => readLocal(currentUser).progress || {};
const writeLocal = (user, data) => {
  try {
    localStorage.setItem(kidKey(user), JSON.stringify(data));
  } catch {
    /* private mode */
  }
};

export function announce(user, data, fresh) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BADGE_EVENT, { detail: { userId: user?.id ?? null, data, fresh } }));
}

// Record progress (e.g. { clouds: { cumulus: day } }) and award any badges it unlocks.
// Returns the ids of brand-new badges.
export async function trackProgress(patch, { day = localDay(), user = currentUser } = {}) {
  const local = readLocal(user);
  let data = { ...local, progress: mergeProgress(local.progress, patch) };
  let fresh = [];
  if (user) {
    try {
      data = (await api('/api/me/kid/merge', { method: 'POST', body: { progress: patch } })).data;
      const due = dueBadges(data);
      if (due.length) {
        const r = await api('/api/me/kid/merge', { method: 'POST', body: { badges: Object.fromEntries(due.map((id) => [id, day])) } });
        data = r.data;
        fresh = r.fresh;
      }
      writeLocal(user, { ...readLocal(user), progress: data.progress, badges: data.badges });
      announce(user, data, fresh);
      return fresh;
    } catch {
      // Offline: keep it locally; the Kid Zone will sync it up next time.
    }
  }
  fresh = dueBadges(data);
  data.badges = { ...(data.badges || {}), ...Object.fromEntries(fresh.map((id) => [id, day])) };
  writeLocal(user, data);
  announce(user, data, fresh);
  return fresh;
}

export const badgeById = Object.fromEntries(BADGES.map((b) => [b.id, b]));

// "See my shelf" from the celebration: App switches to the Kid Zone, which opens
// its Badges tab (right away if it is already showing, or when it mounts).
export const SHELF_EVENT = 'weather-scout:badge-shelf';
let shelfWanted = false;
export function requestShelf() {
  shelfWanted = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SHELF_EVENT));
}
export function takeShelfRequest() {
  const w = shelfWanted;
  shelfWanted = false;
  return w;
}
