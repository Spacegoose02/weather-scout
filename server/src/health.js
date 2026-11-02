// Health & comfort: pressure swings (migraine/joint sensitivity) and heat stress (WBGT).
// Pure functions over a normalized forecast, so they are easy to test.

const toC = (t, metric) => (metric ? t : ((t - 32) * 5) / 9);
const fromC = (c, metric) => (metric ? c : (c * 9) / 5 + 32);
const round1 = (n) => Math.round(n * 10) / 10;
// "2026-11-02T15:00" (local wall clock) -> "3 PM"
const clock = (t) => {
  const h = Number(t.slice(11, 13));
  const m = t.slice(14, 16);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}`;
};

// Fast pressure changes are a common migraine and joint-pain trigger. We look at the
// biggest change over any 6-hour window in the next 24 hours.
export function pressureWatch(forecast, now = Date.now()) {
  const hours = (forecast.hourly || []).filter((h) => h.pressure != null && h.epoch >= now - 3600_000 && h.epoch <= now + 24 * 3600_000);
  let best = null;
  for (let i = 0; i < hours.length; i++) {
    for (let j = i + 1; j < hours.length && hours[j].epoch - hours[i].epoch <= 6 * 3600_000; j++) {
      const change = hours[j].pressure - hours[i].pressure;
      if (!best || Math.abs(change) > Math.abs(best.change)) best = { change, from: hours[i], to: hours[j] };
    }
  }
  const trend3h = forecast.current?.pressureTrend3h ?? null;
  if (!best) return { level: 'unknown', change: null, trend3h, message: 'Not enough pressure data right now.' };
  const size = Math.abs(best.change);
  const level = size >= 6 ? 'warning' : size >= 4 ? 'watch' : 'calm';
  const dir = best.change < 0 ? 'drop' : 'rise';
  const when = best.from.epoch <= now ? 'over the next few hours' : `starting around ${clock(best.from.time)}`;
  const message = {
    warning: `Big pressure ${dir} of ${round1(size)} hPa ${when}. If pressure changes give you headaches or sore joints, plan for it.`,
    watch: `Noticeable pressure ${dir} of ${round1(size)} hPa ${when}. Sensitive folks may feel it.`,
    calm: 'Pressure stays steady for the next day.',
  }[level];
  return { level, change: round1(best.change), from: best.from.time, to: best.to.time, trend3h, message };
}

// Wet-bulb globe temperature estimate for shade (Australian Bureau of Meteorology
// approximation from temperature and humidity). Full sun reads about 2-3 °F higher.
export function wbgtShade(temp, humidity, metric) {
  if (temp == null || humidity == null) return null;
  const t = toC(temp, metric);
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return round1(fromC(0.567 * t + 0.393 * e + 3.94, metric));
}

// Heat-stress flags used by the US military and many school athletic programs (°F).
const HEAT_BANDS = [
  [80, 'Low', 'green', 'Normal activity. Drink water.'],
  [85, 'Moderate', 'yellow', 'Take breaks in the shade and drink water often.'],
  [88, 'High', 'orange', 'Shorten hard outdoor activity and rest often.'],
  [90, 'Very high', 'red', 'Limit hard outdoor activity to short spells.'],
  [Infinity, 'Extreme', 'black', 'Stop hard outdoor activity.'],
];

export function heatCategory(wbgt, metric) {
  if (wbgt == null) return null;
  const f = metric ? (wbgt * 9) / 5 + 32 : wbgt;
  const [, label, color, advice] = HEAT_BANDS.find(([max]) => f < max);
  return { label, color, advice };
}

export function heatStress(forecast, now = Date.now()) {
  const metric = forecast.units?.temp === '°C';
  const c = forecast.current || {};
  const nowWbgt = wbgtShade(c.temp, c.humidity, metric);
  const next = (forecast.hourly || []).filter((h) => h.epoch >= now - 3600_000 && h.epoch <= now + 24 * 3600_000);
  let peak = null;
  for (const h of next) {
    const w = wbgtShade(h.temp, h.humidity, metric);
    if (w != null && (!peak || w > peak.wbgt)) peak = { wbgt: w, time: h.time };
  }
  return {
    now: nowWbgt == null ? null : { wbgt: nowWbgt, category: heatCategory(nowWbgt, metric) },
    peak: peak && { ...peak, category: heatCategory(peak.wbgt, metric) },
    note: 'Shade estimate from temperature and humidity. In full sun it reads about 2 to 3 °F (1 to 2 °C) higher.',
  };
}

export function healthReport(forecast, now = Date.now()) {
  return { pressure: pressureWatch(forecast, now), heat: heatStress(forecast, now) };
}
