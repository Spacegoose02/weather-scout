// Forecast odds from ensembles: the same model run 50 to 80 times with slightly
// different starting weather. If 60 of 82 runs bring a half inch of rain, that
// is about a 73% chance. ECMWF (51 runs) and GFS (31 runs) are pooled, each run
// counting the same. Pure functions, shared by the server and the web app.

export const ODDS = {
  rain: { label: 'Rain', imperial: 0.01, metric: 0.25, what: (u) => (u === 'metric' ? 'any rain or snow (0.25 mm or more)' : 'any rain or snow (0.01 in or more)') },
  soaking: { label: '½″+ rain', metricLabel: '12 mm+', imperial: 0.5, metric: 12, what: (u) => (u === 'metric' ? 'at least 12 mm of rain' : 'at least half an inch of rain') },
  heavy: { label: '1″+ rain', metricLabel: '25 mm+', imperial: 1, metric: 25, what: (u) => (u === 'metric' ? 'at least 25 mm of rain' : 'an inch of rain or more') },
  snow: { label: '1″+ snow', metricLabel: '2 cm+', imperial: 1, metric: 2.5, what: (u) => (u === 'metric' ? 'at least 2.5 cm of snow' : 'an inch of snow or more') },
  bigSnow: { label: '6″+ snow', metricLabel: '15 cm+', imperial: 6, metric: 15, what: (u) => (u === 'metric' ? '15 cm of snow or more' : '6 inches of snow or more') },
  freeze: { label: 'Freeze', imperial: 32, metric: 0, what: () => 'a freeze' },
  hot: { label: '90°+', metricLabel: '32°+', imperial: 90, metric: 32, what: (u) => (u === 'metric' ? 'a high of 32° or more' : 'a high of 90° or more') },
  gust: { label: '40 mph gusts', metricLabel: '65 km/h gusts', imperial: 40, metric: 65, what: (u) => (u === 'metric' ? 'gusts of 65 km/h or more' : 'gusts of 40 mph or more') },
};

// Every run of one variable: `temperature_2m`, `temperature_2m_member01`, and the
// same with a model suffix when several ensembles come back together.
export function membersOf(hourly, v) {
  const re = new RegExp(`^${v}(_member\\d+)?(_[a-z0-9_]+)?$`);
  return Object.keys(hourly || {}).filter((k) => {
    if (!re.test(k)) return false;
    const rest = k.slice(v.length);
    // "precipitation" must not swallow "precipitation_probability" and the like.
    return rest === '' || /^_member\d+/.test(rest) || /^_(ecmwf|gfs|icon|gem|bom|ukmo|meteoswiss)/.test(rest);
  }).map((k) => ({ key: k, values: hourly[k] }));
}

const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const r = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Hourly ensemble -> per local day: the chance of each event and the spread of
// highs, lows, rain and snow. `fromTime` (local "YYYY-MM-DDTHH:MM") skips hours
// already past, so today's odds cover the rest of today.
export function dailyOdds(hourly, { units = 'imperial', fromTime = '', days = 7 } = {}) {
  const times = hourly?.time || [];
  const t = membersOf(hourly, 'temperature_2m');
  const pr = membersOf(hourly, 'precipitation');
  const sn = membersOf(hourly, 'snowfall');
  const gu = membersOf(hourly, 'wind_gusts_10m');
  const n = Math.max(t.length, pr.length);
  if (!times.length || !n) return { members: 0, days: [] };
  const byDay = new Map();
  times.forEach((tm, i) => {
    if (fromTime && tm.slice(0, 13) < fromTime.slice(0, 13)) return;
    const d = tm.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  });
  const th = (k) => ODDS[k][units === 'metric' ? 'metric' : 'imperial'];
  const out = [];
  for (const [date, idx] of [...byDay.entries()].slice(0, days)) {
    if (idx.length < 3) continue;
    const per = (list, fn) => list.map((m) => fn(idx.map((i) => m.values[i]).filter((v) => v != null))).filter((v) => v != null);
    const highs = per(t, (v) => (v.length ? Math.max(...v) : null)).sort((a, b) => a - b);
    const lows = per(t, (v) => (v.length ? Math.min(...v) : null)).sort((a, b) => a - b);
    const rain = per(pr, (v) => (v.length ? v.reduce((s, x) => s + x, 0) : null)).sort((a, b) => a - b);
    const snow = per(sn, (v) => (v.length ? v.reduce((s, x) => s + x, 0) : null)).sort((a, b) => a - b);
    const gust = per(gu, (v) => (v.length ? Math.max(...v) : null)).sort((a, b) => a - b);
    const share = (list, test) => (list.length ? Math.round((100 * list.filter(test).length) / list.length) : null);
    out.push({
      date,
      partial: idx.length < 20,
      chance: {
        rain: share(rain, (v) => v >= th('rain')),
        soaking: share(rain, (v) => v >= th('soaking')),
        heavy: share(rain, (v) => v >= th('heavy')),
        snow: share(snow, (v) => v >= th('snow')),
        bigSnow: share(snow, (v) => v >= th('bigSnow')),
        freeze: share(lows, (v) => v <= th('freeze')),
        hot: share(highs, (v) => v >= th('hot')),
        gust: share(gust, (v) => v >= th('gust')),
      },
      high: { low: r(pct(highs, 0.1)), mid: r(pct(highs, 0.5)), high: r(pct(highs, 0.9)) },
      low: { low: r(pct(lows, 0.1)), mid: r(pct(lows, 0.5)), high: r(pct(lows, 0.9)) },
      precip: { mid: r(pct(rain, 0.5), 2), high: r(pct(rain, 0.9), 2) },
      snow: snow.length ? { mid: r(pct(snow, 0.5), 1), high: r(pct(snow, 0.9), 1) } : null,
    });
  }
  return { members: n, days: out };
}

export const oddsWord = (p) => (p == null ? '' : p >= 90 ? 'almost certain' : p >= 70 ? 'likely' : p >= 40 ? 'a good chance' : p >= 20 ? 'a small chance' : p >= 5 ? 'unlikely' : 'very unlikely');

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayName = (date, i) => (i === 0 ? 'today' : i === 1 ? 'tomorrow' : DAY[new Date(`${date}T12:00Z`).getUTCDay()]);

// The few odds worth a sentence, biggest first: "70% chance of at least half an
// inch of rain Thursday". Rare-but-real events (big snow, a freeze in spring)
// count once they pass 20%.
export function oddsHighlights(days, { units = 'imperial', limit = 3 } = {}) {
  const picks = [];
  const order = ['bigSnow', 'heavy', 'snow', 'soaking', 'gust', 'freeze', 'hot'];
  days.forEach((d, i) => {
    for (const k of order) {
      const p = d.chance[k];
      if (p == null || p < 20) continue;
      // A freeze in January or 90° in July is not news; only a toss-up is.
      if ((k === 'freeze' || k === 'hot') && p >= 95) continue;
      // Skip the smaller event when the bigger one already says it.
      if (k === 'snow' && (d.chance.bigSnow ?? 0) >= 20) continue;
      if (k === 'soaking' && (d.chance.heavy ?? 0) >= 20) continue;
      picks.push({ day: i, date: d.date, key: k, chance: p, text: `${p}% chance of ${ODDS[k].what(units)} ${dayName(d.date, i)}` });
    }
  });
  const weight = { bigSnow: 6, heavy: 5, snow: 4, gust: 3, soaking: 3, freeze: 2, hot: 2 };
  return picks.sort((a, b) => b.chance * weight[b.key] - a.chance * weight[a.key] || a.day - b.day).slice(0, limit);
}
