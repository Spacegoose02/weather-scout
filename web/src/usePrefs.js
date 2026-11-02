import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const KEY = 'weather-scout:prefs';
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};
const writeLocal = (p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
};

// Preferences live on the server for signed-in people (so they follow you
// between devices) and in localStorage for guests.
export function usePrefs(user) {
  const [prefs, setPrefs] = useState(() => readLocal());
  const timer = useRef();

  useEffect(() => {
    if (user) setPrefs({ ...readLocal(), ...user.preferences });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (patch) => {
      setPrefs((prev) => {
        const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
        writeLocal(next);
        if (user) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => api('/api/me/preferences', { method: 'PUT', body: next }).catch(() => {}), 600);
        }
        return next;
      });
    },
    [user],
  );

  return [prefs, update];
}
