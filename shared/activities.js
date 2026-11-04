// "Best times outside": scores each daylight hour of the next 36 for a few
// family activities and finds the best stretch for each one. Pure functions,
// shared by the web app (dashboard card) and tests. Works in °F/mph or °C/km/h.

const toF = (t, units) => (t == null ? null : units === 'metric' ? t * 9 / 5 + 32 : t);
const toMph = (w, units) => (w == null ? null : units === 'metric' ? w / 1.609 : w);
const THUNDER = new Set([95, 96, 99]);
const SNOWING = new Set([71, 73, 75, 77, 85, 86]);
const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);

// 1 when x is inside [lo, hi], falling to 0 over `soft` beyond either edge.
const band = (x, lo, hi, soft) => {
  if (x == null) return 0.5;
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? lo - x : x - hi;
  return Math.max(0, 1 - d / soft);
};
const below = (x, hi, soft) => band(x, -Infinity, hi, soft);

const rainy = (h) => (h.precipChance ?? 0) >= 60 || WET_CODES.has(h.code) || THUNDER.has(h.code);

// Each activity: score(hour, ctx) from 0 to 1, and a short reason when it is a no.
export const ACTIVITIES = [
  {
    id: 'walk', emoji: '🚶', name: 'Walk or hike',
    score: (h) => band(h.f, 50, 80, 20) * below(h.precipChance, 25, 40) * below(h.gust, 25, 20),
  },
  {
    id: 'bike', emoji: '🚲', name: 'Bike ride',
    score: (h) => band(h.f, 55, 82, 18) * below(h.precipChance, 15, 35) * below(h.wind, 12, 12) * below(h.gust, 22, 15),
  },
  {
    id: 'playground', emoji: '🛝', name: 'Playground',
    score: (h) => band(h.f, 45, 85, 15) * below(h.precipChance, 25, 40) * below(h.gust, 28, 15) * below(h.uv, 7, 4),
  },
  {
    id: 'kite', emoji: '🪁', name: 'Fly a kite',
    score: (h) => band(h.wind, 8, 20, 4) * below(h.gust, 28, 10) * below(h.precipChance, 15, 30) * band(h.f, 40, 95, 15),
  },
  {
    id: 'picnic', emoji: '🧺', name: 'Picnic',
    score: (h) => band(h.f, 62, 82, 12) * below(h.precipChance, 15, 30) * below(h.wind, 12, 10),
  },
  {
    id: 'swim', emoji: '🏊', name: 'Pool or beach',
    score: (h) => band(h.f, 82, 98, 8) * below(h.precipChance, 20, 30) * band(h.cloudCover, 0, 60, 40),
  },
  {
    id: 'snow', emoji: '⛄', name: 'Snow play',
    score: (h, c) => (c.snowAround ? band(h.f, 15, 33, 8) * below(h.wind, 15, 15) : 0),
    only: (c) => c.snowAround,
  },
  {
    id: 'rainbow', emoji: '🌈', name: 'Rainbow hunt',
    // Sun low in the sky with showers around: the sun behind you, rain in front.
    score: (h, c) => (h.sunLow ? band(h.precipChance, 25, 65, 20) * band(h.cloudCover, 20, 75, 25) * (THUNDER.has(h.code) ? 0.3 : 1) : 0),
    only: (c) => c.showersAround,
  },
];

const hourOf = (time) => Number(time.slice(11, 13));

export function clock(time) {
  const h = hourOf(time);
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

function dayWord(time, today) {
  const d = time.slice(0, 10);
  if (d === today) return 'Today';
  const next = new Date(`${today}T12:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return d === next.toISOString().slice(0, 10) ? 'Tomorrow' : new Date(`${d}T12:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

const why = (h, units) => {
  const t = Math.round(units === 'metric' ? (h.f - 32) * 5 / 9 : h.f);
  return `${t}°, ${h.precipChance ?? 0}% rain${h.wind != null ? `, wind ${Math.round(units === 'metric' ? h.wind * 1.609 : h.wind)} ${units === 'metric' ? 'km/h' : 'mph'}` : ''}`;
};

// The worst thing about an hour, for "not a good day for it" lines.
function blocker(h, act) {
  if (THUNDER.has(h.code)) return 'thunderstorms around';
  if (rainy(h)) return 'rain';
  if (act.id === 'kite' && (h.wind ?? 0) < 6) return 'not enough wind';
  if ((h.gust ?? 0) >= 30) return 'too gusty';
  if (act.id === 'swim' && h.f < 80) return 'not warm enough';
  if (h.f < 40) return 'too cold';
  if (h.f > 92) return 'too hot';
  if ((h.wind ?? 0) > 18) return 'too windy';
  return 'so-so weather';
}

// forecast: normalized forecast (hourly rows with time, epoch, temp, feelsLike,
// precipChance, windSpeed, windGust, uv, cloudCover, code, isDay, snow).
export function planActivities(forecast, { units = 'imperial', now = Date.now(), hours = 36 } = {}) {
  const rows = (forecast?.hourly || []).filter((h) => h.epoch >= now - 30 * 60_000).slice(0, hours);
  if (!rows.length) return [];
  const today = rows[0].time.slice(0, 10);
  const daily = forecast.daily || [];
  const sunTimes = daily.flatMap((d) => [d.sunrise, d.sunset]).filter(Boolean).map((t) => Date.parse(`${t}Z`));
  const local = (h) => Date.parse(`${h.time}Z`);
  const hrs = rows.map((h) => ({
    ...h,
    f: toF(h.feelsLike ?? h.temp, units),
    wind: toMph(h.windSpeed, units),
    gust: toMph(h.windGust, units),
    sunLow: !!h.isDay && sunTimes.some((s) => Math.abs(local(h) - s) <= 2.5 * 3600_000),
  }));
  const snowFell = (forecast.recent?.precipLast24h ?? 0) > 0 && (daily[0]?.snowTotal ?? 0) > 0;
  const ctx = {
    snowAround: snowFell || hrs.some((h) => (h.snow || 0) > 0 || SNOWING.has(h.code)) || (daily[0]?.snowTotal ?? 0) > 0,
    showersAround: hrs.some((h) => h.isDay && (h.precipChance ?? 0) >= 25 && (h.precipChance ?? 0) <= 70),
  };

  const out = [];
  for (const act of ACTIVITIES) {
    if (act.only && !act.only(ctx)) continue;
    const scored = hrs.map((h) => ({ h, s: h.isDay ? act.score(h, ctx) : 0 }));
    // Best stretch of 1 to 4 good hours in a row, by average score.
    let best = null;
    for (let i = 0; i < scored.length; i++) {
      if (scored[i].s < 0.55) continue;
      let j = i;
      let sum = 0;
      while (j < scored.length && j - i < 4 && scored[j].s >= 0.55) {
        if (scored[j].h.time.slice(0, 10) !== scored[i].h.time.slice(0, 10)) break;
        sum += scored[j].s;
        j++;
      }
      const avg = sum / (j - i);
      const len = j - i;
      const value = avg + len * 0.04; // a longer window is a little better
      if (!best || value > best.value) best = { i, j, avg, value };
    }
    const daytime = hrs.filter((h) => h.isDay);
    if (!best) {
      const worst = daytime.length ? blocker(daytime[Math.floor(daytime.length / 2)], act) : 'it is dark';
      out.push({ id: act.id, emoji: act.emoji, name: act.name, rating: 'no', label: 'Not in the next day and a half', reason: worst });
      continue;
    }
    const first = scored[best.i].h;
    const last = scored[best.j - 1].h;
    const endTime = new Date(Date.parse(`${last.time}Z`) + 3600_000).toISOString().slice(0, 16);
    out.push({
      id: act.id,
      emoji: act.emoji,
      name: act.name,
      rating: best.avg >= 0.8 ? 'great' : 'ok',
      start: first.time,
      end: endTime,
      label: `${dayWord(first.time, today)} ${clock(first.time)}–${clock(endTime)}`,
      reason: why(first, units),
      score: Math.round(best.avg * 100),
    });
  }
  // Great first, then ok, then no; earlier windows first within a rating.
  const rank = { great: 0, ok: 1, no: 2 };
  return out.sort((a, b) => rank[a.rating] - rank[b.rating] || (a.start || '').localeCompare(b.start || ''));
}
