// Backyard-tuned forecast. Every 15 minutes the server notes how far the
// family's own weather station is from the forecast (station minus forecast,
// in °F). That error has two parts worth learning:
//   - right now: today's miss, which fades over the next several hours, and
//   - by time of day: a yard in a valley runs cold at night, a sunny patio
//     runs warm in the afternoon, the same way every day.
// The tuned forecast adds both to the hourly temperatures. Pure functions,
// shared by the server and the web app.

export const KEEP_DAYS = 14;
export const MAX_BIAS_F = 12;
const HOUR = 3600_000;
const RECENT_HOURS = 3;
const FADE_HOURS = 6; // today's miss fades to the time-of-day pattern over ~6 hours
const MIN_DAYS = 2; // a time-of-day pattern needs at least two different days

const clip = (v) => Math.max(-MAX_BIAS_F, Math.min(MAX_BIAS_F, v));
const r1 = (v) => Math.round(v * 10) / 10;
const localHour = (ms, off) => new Date(ms + off * 1000).getUTCHours();
const localDay = (ms, off) => new Date(ms + off * 1000).toISOString().slice(0, 10);

// The forecast temperature at an exact moment, between the two hourly values.
export function forecastAt(hourly, at) {
  const h = (hourly || []).filter((x) => x.temp != null && Number.isFinite(x.epoch));
  for (let i = 1; i < h.length; i++) {
    if (h[i].epoch >= at && h[i - 1].epoch <= at) {
      const f = (at - h[i - 1].epoch) / (h[i].epoch - h[i - 1].epoch || 1);
      return h[i - 1].temp + (h[i].temp - h[i - 1].temp) * f;
    }
  }
  return null;
}

// samples: [{ at (ms), err (°F, station minus forecast) }]
export function biasModel(samples, { now = Date.now(), offsetSec = 0 } = {}) {
  const live = (samples || []).filter((s) => Number.isFinite(s.err) && s.at <= now && s.at >= now - KEEP_DAYS * 24 * HOUR);
  if (!live.length) return { samples: 0, days: 0, recent: null, byHour: Array(24).fill(null), overall: null, mae: null };
  // Today's miss: the last few hours, newest counting most.
  const recentList = live.filter((s) => s.at >= now - RECENT_HOURS * HOUR);
  let recent = null;
  if (recentList.length) {
    let w = 0;
    let sum = 0;
    for (const s of recentList) {
      const k = Math.exp(-(now - s.at) / HOUR);
      w += k;
      sum += k * s.err;
    }
    recent = r1(clip(sum / w));
  }
  // The time-of-day pattern: each local hour's average, once two days have it.
  const buckets = Array.from({ length: 24 }, () => ({ sum: 0, n: 0, days: new Set() }));
  for (const s of live) {
    const b = buckets[localHour(s.at, offsetSec)];
    b.sum += s.err;
    b.n += 1;
    b.days.add(localDay(s.at, offsetSec));
  }
  const byHour = buckets.map((b) => (b.days.size >= MIN_DAYS ? r1(clip(b.sum / b.n)) : null));
  const days = new Set(live.map((s) => localDay(s.at, offsetSec))).size;
  const overall = days >= MIN_DAYS ? r1(clip(live.reduce((s, x) => s + x.err, 0) / live.length)) : null;
  const mae = r1(live.reduce((s, x) => s + Math.abs(x.err), 0) / live.length);
  return { samples: live.length, days, recent, byHour, overall, mae };
}

// How much to add (°F) to the forecast for one hour.
export function biasFor(model, at, { now = Date.now(), offsetSec = 0 } = {}) {
  const pattern = model.byHour[localHour(at, offsetSec)] ?? model.overall;
  if (model.recent == null) return pattern;
  const lead = Math.max(0, (at - now) / HOUR);
  const w = Math.exp(-lead / FADE_HOURS);
  return r1(clip(w * model.recent + (1 - w) * (pattern ?? 0)));
}

// The hourly forecast with a `tuned` temperature next to the model's `temp`.
// `units` is the forecast's units; the bias is learned in °F.
export function tuneHourly(hourly, model, { now = Date.now(), offsetSec = 0, units = 'imperial' } = {}) {
  const scale = units === 'metric' ? 5 / 9 : 1;
  return (hourly || []).filter((h) => h.epoch >= now - HOUR).map((h) => {
    const b = h.temp == null ? null : biasFor(model, h.epoch, { now, offsetSec });
    return { time: h.time, epoch: h.epoch, temp: h.temp, tuned: b == null ? h.temp : Math.round(h.temp + b * scale), bias: b == null ? null : r1(b * scale) };
  });
}

// High and low for each local day in the tuned hours (only days with 12+ hours left).
export function tunedDays(hours) {
  const days = new Map();
  for (const h of hours) {
    const d = h.time.slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(h);
  }
  return [...days.entries()].filter(([, hs]) => hs.length >= 12).map(([date, hs]) => ({
    date,
    high: Math.max(...hs.map((h) => h.temp)),
    low: Math.min(...hs.map((h) => h.temp)),
    tunedHigh: Math.max(...hs.map((h) => h.tuned)),
    tunedLow: Math.min(...hs.map((h) => h.tuned)),
  }));
}

const avg = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

// One sentence about the yard's personality, e.g. "Your yard runs about 3°
// cooler than the forecast at night and 2° warmer in the afternoon."
export function yardText(model, { units = 'imperial' } = {}) {
  if (!model || model.samples === 0) return 'Learning your yard. Check back after your station has reported for a day or two.';
  const scale = units === 'metric' ? 5 / 9 : 1;
  const night = avg([0, 1, 2, 3, 4, 5, 6].map((h) => model.byHour[h]));
  const day = avg([12, 13, 14, 15, 16, 17].map((h) => model.byHour[h]));
  const part = (v, when) => {
    if (v == null) return null;
    const d = Math.round(Math.abs(v * scale));
    if (d < 1) return `right on the forecast ${when}`;
    return `about ${d}° ${v > 0 ? 'warmer' : 'cooler'} than the forecast ${when}`;
  };
  const bits = [part(night, 'at night'), part(day, 'in the afternoon')].filter(Boolean);
  if (!bits.length) {
    if (model.recent == null) return 'Learning your yard. A pattern shows up after two days of readings.';
    const d = Math.round(Math.abs(model.recent * scale));
    return d < 1 ? 'Your station matches the forecast right now. A pattern shows up after two days.' : `Your station is ${d}° ${model.recent > 0 ? 'warmer' : 'cooler'} than the forecast right now. A time-of-day pattern shows up after two days.`;
  }
  return `Your yard runs ${bits.join(' and ')}.`;
}
