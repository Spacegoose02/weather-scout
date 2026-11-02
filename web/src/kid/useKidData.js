import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { BADGE_EVENT, SUPER_SCOUT_AT, announce, kidKey, mergeProgress } from './badges.js';

// Kid Zone progress (bingo marks, forecaster guesses, badges, stamps...).
// Signed-in kids keep it on the server so it follows them between devices;
// guests keep it in this browser.
const keyFor = kidKey;
const readLocal = (user) => {
  try {
    return JSON.parse(localStorage.getItem(keyFor(user)) || '{}');
  } catch {
    return {};
  }
};
const writeLocal = (user, data) => {
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(data));
  } catch {
    /* private mode */
  }
};

export function useKidData(user, today) {
  const [data, setData] = useState(() => readLocal(user));
  const timer = useRef();
  const loaded = useRef(!user);

  useEffect(() => {
    setData(readLocal(user));
    loaded.current = !user;
    if (!user) return;
    let live = true;
    api('/api/me/kid')
      .then((r) => {
        if (!live) return;
        // Merge so nothing earned while offline is lost.
        setData((local) => mergeKid(local, r.data || {}));
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
    return () => {
      live = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (fn) => {
      setData((prev) => {
        const next = { ...prev, ...fn(prev) };
        writeLocal(user, next);
        if (user && loaded.current) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => api('/api/me/kid', { method: 'PUT', body: next }).catch(() => {}), 500);
        }
        return next;
      });
    },
    [user],
  );

  // Badges and progress earned elsewhere (journal, Learn quizzes, cloud spotter).
  useEffect(() => {
    const onBadges = (e) => {
      if ((e.detail.userId ?? null) !== (user?.id ?? null)) return;
      const d = e.detail.data || {};
      setData((prev) => ({ ...prev, badges: { ...(prev.badges || {}), ...(d.badges || {}) }, progress: mergeProgress(prev.progress, d.progress) }));
    };
    window.addEventListener(BADGE_EVENT, onBadges);
    return () => window.removeEventListener(BADGE_EVENT, onBadges);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Award one or more badges; the celebration pops up for any that are new.
  const earn = useCallback(
    (...ids) => {
      update((prev) => {
        const badges = { ...(prev.badges || {}) };
        const fresh = ids.filter((id) => !badges[id]);
        if (!fresh.length) return {};
        fresh.forEach((id) => {
          badges[id] = today;
        });
        if (!badges['super-scout'] && Object.keys(badges).length >= SUPER_SCOUT_AT) {
          badges['super-scout'] = today;
          fresh.push('super-scout');
        }
        queueMicrotask(() => announce(user, { badges }, fresh));
        return { badges };
      });
    },
    [update, today, user],
  );

  return { data, update, earn };
}

export function mergeKid(local, server) {
  const out = { ...local, ...server };
  out.badges = { ...(local.badges || {}), ...(server.badges || {}) };
  out.stamps = { ...(local.stamps || {}), ...(server.stamps || {}) };
  out.progress = mergeProgress(local.progress, server.progress);
  const guesses = new Map();
  for (const g of [...(local.guesses || []), ...(server.guesses || [])]) {
    const prev = guesses.get(g.date);
    if (!prev || (g.result && !prev.result)) guesses.set(g.date, g);
  }
  out.guesses = [...guesses.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
  out.factDays = [...new Set([...(local.factDays || []), ...(server.factDays || [])])].sort().slice(-30);
  return out;
}
