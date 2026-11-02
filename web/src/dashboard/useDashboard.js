import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { DEFAULT_LAYOUT, normalize } from './layout.js';

// The dashboard layout. Signed-in people keep theirs on the server (so it
// follows them between devices); guests see the house default an admin picked,
// or the built-in one. A copy in localStorage makes the first paint instant.
const keyFor = (user) => `weather-scout:dashboard:${user?.id ?? 'guest'}`;
const readLocal = (user) => {
  try {
    const raw = localStorage.getItem(keyFor(user));
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};
const writeLocal = (user, layout) => {
  try {
    if (layout) localStorage.setItem(keyFor(user), JSON.stringify(layout));
    else localStorage.removeItem(keyFor(user));
  } catch {
    /* private mode */
  }
};

export function useDashboard(user) {
  const [layout, setLayout] = useState(() => readLocal(user) || DEFAULT_LAYOUT);
  const [houseDefault, setHouseDefault] = useState(null);
  const [custom, setCustom] = useState(false); // true when this person saved their own layout
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(''); // '', 'saving', 'saved', 'error'
  const timer = useRef();

  useEffect(() => {
    let live = true;
    const cached = readLocal(user);
    if (cached) setLayout(cached);
    setReady(!!cached);
    const req = user ? api('/api/me/dashboard') : api('/api/dashboard/default').then((r) => ({ layout: null, houseDefault: r.layout }));
    req
      .then((r) => {
        if (!live) return;
        const house = r.houseDefault ? normalize(r.houseDefault) : null;
        setHouseDefault(house);
        setCustom(!!r.layout);
        const next = r.layout ? normalize(r.layout) : house || DEFAULT_LAYOUT;
        setLayout(next);
        writeLocal(user, r.layout ? next : null);
      })
      .catch(() => {})
      .finally(() => live && setReady(true));
    return () => {
      live = false;
      clearTimeout(timer.current);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (fn) => {
      if (!user) return;
      setLayout((prev) => {
        const next = normalize(typeof fn === 'function' ? fn(prev) : fn);
        writeLocal(user, next);
        setCustom(true);
        setSaving('saving');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          api('/api/me/dashboard', { method: 'PUT', body: next })
            .then(() => setSaving('saved'))
            .catch(() => setSaving('error'));
        }, 500);
        return next;
      });
    },
    [user],
  );

  const reset = useCallback(async () => {
    if (!user) return;
    clearTimeout(timer.current);
    const r = await api('/api/me/dashboard', { method: 'DELETE' });
    const house = r.houseDefault ? normalize(r.houseDefault) : null;
    setHouseDefault(house);
    setCustom(false);
    setLayout(house || DEFAULT_LAYOUT);
    writeLocal(user, null);
    setSaving('saved');
  }, [user]);

  // Admins: make the current layout what guests (and new accounts) see.
  const shareAsDefault = useCallback(async () => {
    const r = await api('/api/admin/dashboard/default', { method: 'PUT', body: layout });
    setHouseDefault(normalize(r.layout));
  }, [layout]);

  const clearHouseDefault = useCallback(async () => {
    await api('/api/admin/dashboard/default', { method: 'DELETE' });
    setHouseDefault(null);
  }, []);

  return { layout, update, reset, ready, custom, saving, houseDefault, shareAsDefault, clearHouseDefault };
}
