import { t, shortDay } from './i18n.js';

export const round = (v) => (v == null || Number.isNaN(v) ? '–' : Math.round(v));

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => (deg == null ? '' : DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]);

// Open-Meteo times are local wall-clock strings ("2026-11-02T14:00"), so we
// format them without converting through the browser's timezone.
export function hourLabel(t) {
  const h = Number(t.slice(11, 13));
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

export function clockLabel(t) {
  const h = Number(t.slice(11, 13));
  const m = t.slice(14, 16);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function dayLabel(date, i) {
  if (i === 0) return t('Today');
  const [y, m, d] = date.split('-').map(Number);
  return shortDay(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export function duration(minutes) {
  if (minutes == null) return '';
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
}

export const ICONS = {
  clear: ['☀️', '🌙'],
  'partly-cloudy': ['⛅', '☁️'],
  cloudy: ['☁️', '☁️'],
  // Not 🌫️: on Windows that emoji is a plain grey square that looks like a broken image.
  fog: ['🌁', '🌁'],
  drizzle: ['🌦️', '🌧️'],
  rain: ['🌧️', '🌧️'],
  sleet: ['🧊', '🧊'],
  snow: ['🌨️', '🌨️'],
  thunder: ['⛈️', '⛈️'],
};
export const icon = (name, isDay = true) => (ICONS[name] || ICONS.cloudy)[isDay ? 0 : 1];

export function pressureWord(trend) {
  if (trend == null) return '';
  if (trend <= -2) return 'falling fast';
  if (trend < -0.5) return 'falling';
  if (trend >= 2) return 'rising fast';
  if (trend > 0.5) return 'rising';
  return 'steady';
}

export { nextRainText } from '../../shared/glance.js';
