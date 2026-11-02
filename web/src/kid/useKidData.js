import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Kid Zone progress (bingo marks, forecaster guesses, badges, stamps...).
// Signed-in kids keep it on the server so it follows them between devices;
// guests keep it in this browser.
const keyFor = (user) => `weather-scout:kid:${user?.id ?? 'guest'}`;
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
  const [toast, setToast] = useState(null);
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

  // Award one or more badges; shows a toast for any that are new.
  const earn = useCallback(
    (...ids) => {
      update((prev) => {
        const badges = { ...(prev.badges || {}) };
        const fresh = ids.filter((id) => !badges[id]);
        if (!fresh.length) return {};
        fresh.forEach((id) => {
          badges[id] = today;
        });
        setToast(fresh);
        return { badges };
      });
    },
    [update, today],
  );

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return { data, update, earn, toast };
}

export function mergeKid(local, server) {
  const out = { ...local, ...server };
  out.badges = { ...(local.badges || {}), ...(server.badges || {}) };
  out.stamps = { ...(local.stamps || {}), ...(server.stamps || {}) };
  const guesses = new Map();
  for (const g of [...(local.guesses || []), ...(server.guesses || [])]) {
    const prev = guesses.get(g.date);
    if (!prev || (g.result && !prev.result)) guesses.set(g.date, g);
  }
  out.guesses = [...guesses.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
  out.factDays = [...new Set([...(local.factDays || []), ...(server.factDays || [])])].sort().slice(-30);
  return out;
}
