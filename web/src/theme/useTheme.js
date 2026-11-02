import { useEffect, useState } from 'react';
import { resolveTheme, themeById } from './themes.js';
import './theme.css';

const dark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

// Puts the chosen theme on <html data-theme> and keeps "Match my device" and
// "Let Rocky pick" up to date as the device setting or the weather changes.
export function useTheme(choice, weather) {
  const [systemDark, setSystemDark] = useState(dark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const resolved = resolveTheme(choice, { weather, systemDark });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeById(resolved.id).color);
  }, [resolved.id]);

  return resolved;
}
