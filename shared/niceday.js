// Nice-day score: how pleasant each of the next 7 days looks, 0 to 100, from
// temperature (feels-like), mugginess, rain, sky, wind, UV and air quality.
// Pure functions, shared by the web app (dashboard card, kid view) and the
// server (the "nice day tomorrow" personal alert). Works in °F/mph or °C/km/h.

const toF = (t, metric) => (t == null ? null : metric ? t * 9 / 5 + 32 : t);
const toMph = (w, metric) => (w == null ? null : metric ? w / 1.609 : w);
const toIn = (p, metric) => (p == null ? null : metric ? p / 25.4 : p);

// 1 inside [lo, hi], falling to 0 over `soft` beyond either edge.
const band = (x, lo, hi, soft) => {
  if (x == null) return 1;
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? lo - x : x - hi;
  return Math.max(0, 1 - d / soft);
};

const THUNDER = new Set([95, 96, 99]);
const FOG = new Set([45, 48]);
const SKY = { 0: 1, 1: 1, 2: 0.94, 3: 0.82 };

export const TIERS = [
  { min: 90, id: 'perfect', label: 'Perfect', grade: 'A+', color: '#1a9e5c', kid: 'A perfect day! Rocky says get outside and play!' },
  { min: 78, id: 'beautiful', label: 'Beautiful', grade: 'A', color: '#3bb273', kid: 'A beautiful day for the park or a bike ride.' },
  { min: 62, id: 'nice', label: 'Nice', grade: 'B', color: '#8cc63f', kid: 'A nice day. Pick the best hours and head out.' },
  { min: 45, id: 'fair', label: 'Fair', grade: 'C', color: '#e7b416', kid: 'An OK day. Dress right and you can still have fun.' },
  { min: 25, id: 'meh', label: 'Not great', grade: 'D', color: '#e67e22', kid: 'Not the best day outside. Maybe a fort or a board game?' },
  { min: 0, id: 'poor', label: 'Stay-inside day', grade: 'F', color: '#c0392b', kid: 'A stay-inside day. Rocky is making cocoa and reading books.' },
];
export const tierOf = (score) => TIERS.find((t) => score >= t.min) || TIERS.at(-1);

// Midday dew point (11 AM - 5 PM) for days the hourly forecast covers.
function middayDew(hourly, date) {
  const xs = (hourly || []).filter((h) => h.time?.startsWith(date) && h.time.slice(11, 13) >= '11' && h.time.slice(11, 13) <= '17' && h.dewPoint != null);
  return xs.length ? xs.reduce((s, h) => s + h.dewPoint, 0) / xs.length : null;
}

// The worst air quality index forecast during the day (hourly air feed, when given).
function dayAqi(airHourly, date) {
  const xs = (airHourly || []).filter((h) => h.time?.startsWith(date) && h.aqi != null);
  return xs.length ? Math.max(...xs.map((h) => h.aqi)) : null;
}

// One day's score, with the factors so the card can say why.
export function scoreDay(d, { units = 'imperial', hourly, airHourly } = {}) {
  const metric = units === 'metric';
  const feels = toF(d.feelsLikeHigh ?? d.high, metric);
  const high = toF(d.high, metric);
  const dew = toF(middayDew(hourly, d.time), metric);
  const gust = toMph(d.gustMax, metric);
  const wind = toMph(d.windMax, metric);
  const rainIn = toIn(d.precipTotal, metric) ?? 0;
  const chance = d.precipChance ?? 0;
  const aqi = dayAqi(airHourly, d.time);

  const f = {};
  // Comfort: 65-80°F feels-like is ideal. Never quite zero, so a bright cold day still beats a cold, stormy one.
  f.temp = feels == null ? 1 : feels < 65 ? Math.max(0.08, band(feels, 65, 80, 45)) : Math.max(0.05, band(feels, 65, 80, 20));
  // Mugginess: dew point when known, else how much hotter it feels than it is.
  if (dew != null) f.muggy = band(dew, -40, 60, 14);
  else f.muggy = feels != null && high != null && feels - high > 3 ? Math.max(0.5, 1 - (feels - high - 3) / 12) : 1;
  // Rain: the chance, and how much.
  f.rain = Math.max(0.15, 1 - (chance / 100) * 0.7) * (rainIn >= 0.5 ? 0.6 : rainIn >= 0.1 ? 0.8 : 1);
  f.sky = THUNDER.has(d.code) ? 0.55 : FOG.has(d.code) ? 0.8 : SKY[d.code] ?? 1;
  f.wind = band(Math.max(gust ?? 0, (wind ?? 0) * 1.3), 0, 22, 28);
  f.uv = d.uvMax == null ? 1 : d.uvMax >= 10 ? 0.88 : d.uvMax >= 8 ? 0.95 : 1;
  f.air = aqi == null ? 1 : aqi <= 50 ? 1 : aqi <= 100 ? 0.92 : aqi <= 150 ? 0.7 : 0.45;

  const product = Object.values(f).reduce((p, x) => p * x, 1);
  const score = Math.round(100 * Math.pow(product, 0.8));
  return { date: d.time, score, tier: tierOf(score), factors: f, feels: d.feelsLikeHigh ?? d.high, dew: middayDew(hourly, d.time), aqi, why: whyWords(f, { feels, dew, chance, gust, aqi }) };
}

// The one or two biggest reasons a day lost points, in plain words.
export function whyWords(f, { feels, dew, chance, gust, aqi }) {
  const losses = [
    ['temp', feels != null && feels < 65 ? 'chilly' : 'hot'],
    ['muggy', dew != null && dew >= 65 ? 'sticky and humid' : 'humid'],
    ['rain', chance >= 60 ? 'rainy' : 'a chance of rain'],
    ['sky', 'storms or gray skies'],
    ['wind', gust != null && gust >= 35 ? 'very windy' : 'breezy'],
    ['uv', 'strong sun'],
    ['air', aqi != null && aqi > 100 ? 'unhealthy air' : 'hazy air'],
  ].filter(([k]) => f[k] < 0.93).sort((a, b) => f[a[0]] - f[b[0]]).slice(0, 2).map(([, w]) => w);
  return losses.length ? losses.join(', ') : 'comfortable all around';
}

// The next 7 days, the best one and whether tomorrow is a nice one.
export function niceDays(fc, { air = null, days = 7 } = {}) {
  const units = fc?.units?.temp === '°C' ? 'metric' : 'imperial';
  const list = (fc?.daily || []).slice(0, days).map((d) => scoreDay(d, { units, hourly: fc.hourly, airHourly: air?.hourly }));
  const best = list.reduce((a, d) => (a == null || d.score > a.score ? d : a), null);
  return { days: list, best, units };
}
