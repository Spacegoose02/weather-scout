// When to pop up live storm chaser streams, kept apart from the components so it's easy to test.

// Severe weather worth watching chasers for: warnings and watches for these.
const STORMY = /\b(tornado|severe thunderstorm|hurricane|tropical storm|typhoon|storm surge|extreme wind|derecho|blizzard|ice storm|flash flood|dust storm|snow squall)\b/i;
export const stormyAlerts = (alerts = []) => alerts.filter((a) => STORMY.test(a.event || '') && /warning|watch|emergency/i.test(a.event || ''));

// Pop-up modes: 'storms' (default: only with severe alerts near you), 'always' (any time chasers are live), 'off'.
export const POPUP_MODES = [
  ['storms', 'When storms are near me'],
  ['always', 'Whenever storm chasers are live'],
  ['off', 'Never (I will check the Storm Center)'],
];
export const popupMode = (v) => (POPUP_MODES.some(([id]) => id === v) ? v : 'storms');

// Whether the app should be checking for live streams at all.
export const shouldWatch = (mode, alerts) => mode === 'always' || (mode === 'storms' && stormyAlerts(alerts).length > 0);

// Pop up only for streams the family hasn't already dismissed.
export function freshStreams(streams = [], dismissed = []) {
  const seen = new Set(dismissed);
  return streams.filter((s) => !seen.has(s.videoId));
}

const KEY = 'weather-scout:chasers-dismissed';
export function readDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Forget after 12 hours, so the next storm day pops up again.
    return v.at && Date.now() - v.at < 12 * 3600_000 ? v.ids || [] : [];
  } catch {
    return [];
  }
}
export function writeDismissed(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), ids: [...new Set([...readDismissed(), ...ids])].slice(-100) }));
  } catch {
    /* private mode */
  }
}

export function viewersLabel(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M watching`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K watching`;
  return `${n} watching`;
}

export function liveFor(startedAt, now = Date.now()) {
  const t = Date.parse(startedAt || '');
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 60) return `live for ${mins} min`;
  const h = Math.floor(mins / 60);
  return `live for ${h} hr${h > 1 ? 's' : ''}${mins % 60 ? ` ${mins % 60} min` : ''}`;
}
