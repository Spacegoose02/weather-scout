// Weather journal helpers: the sky stickers, streaks and a friendly comparison
// with what the forecast said.

export const SKY = [
  { id: 'sunny', emoji: '☀️', label: 'Sunny' },
  { id: 'partly', emoji: '⛅', label: 'Some clouds' },
  { id: 'cloudy', emoji: '☁️', label: 'Cloudy' },
  { id: 'drizzle', emoji: '🌦️', label: 'Drizzle' },
  { id: 'rain', emoji: '🌧️', label: 'Rain' },
  { id: 'storm', emoji: '⛈️', label: 'Thunder' },
  { id: 'snow', emoji: '❄️', label: 'Snow' },
  { id: 'fog', emoji: '🌫️', label: 'Fog' },
  { id: 'windy', emoji: '🌬️', label: 'Windy' },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow' },
  { id: 'frost', emoji: '🧊', label: 'Frost' },
  { id: 'hot', emoji: '🥵', label: 'Hot' },
];
export const SKY_EMOJI = Object.fromEntries(SKY.map((s) => [s.id, s.emoji]));

const DAY = 86_400_000;
const dayNum = (d) => Math.round(Date.parse(`${d}T12:00:00Z`) / DAY);

// Days in a row with a journal page, counting back from today. A streak is
// still alive in the morning before today's page is written.
export function streak(entries, today) {
  const days = new Set(entries.map((e) => dayNum(e.day)));
  let d = dayNum(today);
  if (!days.has(d)) d -= 1;
  let n = 0;
  while (days.has(d)) {
    n += 1;
    d -= 1;
  }
  return n;
}

// Longest run of days in a row anywhere in the journal (for streak badges).
export function bestStreak(entries) {
  const days = [...new Set(entries.map((e) => dayNum(e.day)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// "You measured 3° warmer than the forecast."
export function compareForecast(entry, unit = '°') {
  const f = entry?.forecast;
  if (!f || entry.high == null || f.high == null) return null;
  const diff = Math.round(entry.high - f.high);
  if (Math.abs(diff) <= 1) return `Your high matched the forecast (${Math.round(f.high)}${unit}). Nice measuring!`;
  return `Your high was ${Math.abs(diff)}${unit} ${diff > 0 ? 'warmer' : 'cooler'} than the forecast said (${Math.round(f.high)}${unit}).`;
}

// The local date (YYYY-MM-DD) for the place being viewed, from the forecast.
export const localToday = (forecast) => (forecast?.current?.time || new Date().toISOString()).slice(0, 10);
