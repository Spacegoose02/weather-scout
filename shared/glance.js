// The "rain starting in 15 minutes" line, shared by the web app, the widget
// summary (Android widget, Windows widget, watch page) and connected apps.
// `minutely` is the forecast's 15-minute slots for the next 2 hours.
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function nextRain(minutely) {
  if (!minutely?.length) return null;
  const wet = (m) => (m.precip ?? 0) > 0;
  const idx = minutely.findIndex(wet);
  if (idx === -1) return { state: 'dry', minutes: null, word: 'rain' };
  const word = SNOW_CODES.has(minutely[idx].code) ? 'snow' : 'rain';
  if (idx === 0) {
    const stop = minutely.findIndex((m) => !wet(m));
    return stop === -1 ? { state: 'steady', minutes: null, word } : { state: 'stopping', minutes: stop * 15, word };
  }
  return { state: 'starting', minutes: idx * 15, word };
}

export function nextRainText(minutely) {
  const r = nextRain(minutely);
  if (!r) return null;
  const W = r.word === 'snow' ? 'Snow' : 'Rain';
  if (r.state === 'dry') return 'No rain expected in the next 2 hours.';
  if (r.state === 'steady') return `${W} continuing for at least 2 hours.`;
  if (r.state === 'stopping') return `${W} stopping in about ${r.minutes} minutes.`;
  return `${W} starting in about ${r.minutes} minutes.`;
}

// Short form for small screens: "Rain in 15 min", "Dry 2 h", "Rain ends 30 min".
export function nextRainShort(minutely) {
  const r = nextRain(minutely);
  if (!r) return '';
  const W = r.word === 'snow' ? 'Snow' : 'Rain';
  if (r.state === 'dry') return 'Dry next 2 h';
  if (r.state === 'steady') return `${W} for 2 h+`;
  if (r.state === 'stopping') return `${W} ends in ${r.minutes} min`;
  return `${W} in ${r.minutes} min`;
}
