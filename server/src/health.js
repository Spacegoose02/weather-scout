// Health & comfort: pressure swings (migraine, sinus and joint sensitivity), dew point
// comfort and heat stress (WBGT, in shade and in the sun).
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

const nextDate = (d) => new Date(Date.parse(`${d}T12:00Z`) + 86400_000).toISOString().slice(0, 10);
const weekday = (t) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${t.slice(0, 10)}T12:00Z`).getUTCDay()];

// Fast pressure changes are a common migraine, sinus and joint-pain trigger. We look
// at the biggest change over any 6-hour window in the next 24 hours, and at the net
// change over the whole day, which catches a slow but deep drop.
const SWING = { warning: 6, watch: 4 }; // hPa in 6 hours
const DAY_SWING = { warning: 10, watch: 6 }; // hPa in 24 hours
const LEVEL_RANK = { unknown: -1, calm: 0, watch: 1, warning: 2 };
const worse = (a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);
const swingLevel = (size, bands) => (size >= bands.warning ? 'warning' : size >= bands.watch ? 'watch' : 'calm');

// Biggest change between two points no more than `spanMs` apart.
function biggestSwing(points, spanMs) {
  let best = null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length && points[j].epoch - points[i].epoch <= spanMs; j++) {
      const change = points[j].pressure - points[i].pressure;
      if (!best || Math.abs(change) > Math.abs(best.change)) best = { change, from: points[i], to: points[j] };
    }
  }
  return best;
}

// What a swing like this tends to mean for people who feel the weather.
export function pressureEffects(level, change, { humidity = null, temp = null, metric = false } = {}) {
  if (level === 'unknown' || change == null) return [];
  const falling = change < 0;
  const coldDamp = humidity != null && temp != null && humidity >= 70 && (metric ? temp <= 10 : temp <= 50);
  if (level === 'calm') {
    return [{ id: 'migraine', name: 'Migraine', level: 'calm', text: 'Low weather risk. Steady pressure is the easy kind.' }];
  }
  const big = level === 'warning';
  return [
    {
      id: 'migraine',
      name: 'Migraine',
      level,
      text: falling
        ? `${big ? 'High' : 'Some'} weather risk. Falling pressure is the most common weather migraine trigger. Keep your usual plan close, drink water and keep meals and sleep regular.`
        : `${big ? 'Moderate' : 'Some'} weather risk. Fast rises bother fewer people than drops, but they can still set off a headache.`,
    },
    {
      id: 'sinus',
      name: 'Sinus',
      level: falling ? level : 'calm',
      text: falling
        ? `Sinus pressure and stuffiness often build as the pressure falls${humidity != null && humidity >= 80 ? ', and the air is damp too' : ''}. A saline rinse or a warm shower can help.`
        : 'Rising pressure usually eases sinus pressure.',
    },
    {
      id: 'joints',
      name: 'Joints',
      level: falling ? (coldDamp ? worse(level, 'watch') : level === 'warning' ? 'watch' : 'calm') : 'calm',
      text: falling
        ? `${coldDamp ? 'Cold, damp air with falling pressure' : 'Falling pressure'} is when achy joints and old injuries tend to complain. Gentle movement and warmth help.`
        : 'Rising pressure and drier air tend to be kinder to joints.',
    },
  ];
}

export function pressureWatch(forecast, now = Date.now()) {
  const metric = forecast.units?.temp === '°C';
  const future = (forecast.hourly || []).filter((h) => h.pressure != null && h.epoch >= now - 3600_000);
  const next24 = future.filter((h) => h.epoch <= now + 24 * 3600_000);
  const pastPts = (forecast.recent?.pressure || []).filter((h) => h.epoch < now - 3600_000);
  // One line from yesterday to two days out, for the chart.
  const series = [...pastPts, ...future].map(({ time, epoch, pressure }) => ({ time, epoch, pressure }));
  const best = biggestSwing(next24, 6 * 3600_000);
  const trend3h = forecast.current?.pressureTrend3h ?? null;
  const nowP = forecast.current?.pressure ?? null;
  if (!best) return { level: 'unknown', change: null, trend3h, now: nowP, series, outlook: [], effects: [], message: 'Not enough pressure data right now.' };

  const size = Math.abs(best.change);
  const dayChange = next24.length >= 2 ? next24.at(-1).pressure - next24[0].pressure : 0;
  const swing6 = swingLevel(size, SWING);
  const swing24 = swingLevel(Math.abs(dayChange), DAY_SWING);
  const level = worse(swing6, swing24);
  // When the slow day-long change is the bigger story, describe that one.
  const useDay = LEVEL_RANK[swing24] > LEVEL_RANK[swing6];
  const change = useDay ? dayChange : best.change;
  const from = useDay ? next24[0] : best.from;
  const to = useDay ? next24.at(-1) : best.to;
  const dir = change < 0 ? 'drop' : 'rise';
  const amount = round1(Math.abs(change));
  const span = useDay ? 'over the next day' : `in ${Math.max(1, Math.round((to.epoch - from.epoch) / 3600_000))} hours`;
  const today = (forecast.current?.time || '').slice(0, 10);
  const dayWord = !today || from.time.startsWith(today) ? '' : from.time.slice(0, 10) === nextDate(today) ? ' tomorrow' : ` on ${weekday(from.time)}`;
  const when = from.epoch <= now ? 'starting now' : `starting around ${clock(from.time)}${dayWord}`;
  const message = {
    warning: `Big pressure ${dir} of ${amount} hPa ${span}, ${when}. If pressure changes give you headaches, sinus pain or sore joints, plan for it.`,
    watch: `Noticeable pressure ${dir} of ${amount} hPa ${span}, ${when}. Sensitive folks may feel it.`,
    calm: 'Pressure stays steady for the next day.',
  }[level];

  // A simple day-by-day outlook: the worst 6-hour swing within each day. Days with
  // only a few forecast hours left are skipped rather than called calm too early.
  const all = [...pastPts, ...future];
  const outlook = [];
  for (const date of [...new Set(future.map((h) => h.time.slice(0, 10)))]) {
    if (future.filter((h) => h.time.startsWith(date)).length < 6) continue;
    const sw = biggestSwing(all.filter((h) => h.time.startsWith(date)), 6 * 3600_000);
    if (!sw) continue;
    outlook.push({ date, level: swingLevel(Math.abs(sw.change), SWING), change: round1(sw.change), at: sw.from.time });
    if (outlook.length === 3) break;
  }

  const c = forecast.current || {};
  return {
    level,
    change: round1(change),
    from: from.time,
    to: to.time,
    trend3h,
    now: nowP,
    dayChange: round1(dayChange),
    series,
    outlook,
    effects: pressureEffects(level, change, { humidity: c.humidity, temp: c.temp, metric }),
    message,
  };
}

// Dew point says how sticky the air feels far better than relative humidity, which
// changes all day just because the temperature does. Bands in °F.
const DEW_BANDS = [
  [35, 'Very dry', 'dry', 'Dry skin, chapped lips and static shocks. A humidifier and lip balm help.'],
  [50, 'Dry', 'green', 'Crisp and comfortable.'],
  [56, 'Comfortable', 'green', 'Pleasant air for almost everyone.'],
  [61, 'A little humid', 'yellow', 'Starting to notice the moisture.'],
  [66, 'Sticky', 'orange', 'Sweat dries slowly, so you heat up faster when active.'],
  [71, 'Muggy', 'red', 'Uncomfortable. Hard exercise feels much harder.'],
  [Infinity, 'Oppressive', 'purple', 'Tropical air. Sweat barely cools you, so take heat breaks seriously.'],
];

export function dewComfort(dewPoint, metric) {
  if (dewPoint == null) return null;
  const f = metric ? (dewPoint * 9) / 5 + 32 : dewPoint;
  const [, label, color, advice] = DEW_BANDS.find(([max]) => f < max);
  return { label, color, advice, scale: Math.max(0, Math.min(1, (f - 20) / 60)) };
}

export function dewWatch(forecast, now = Date.now()) {
  const metric = forecast.units?.temp === '°C';
  const c = forecast.current || {};
  const next = (forecast.hourly || []).filter((h) => h.dewPoint != null && h.epoch >= now - 3600_000 && h.epoch <= now + 24 * 3600_000);
  if (c.dewPoint == null && !next.length) return null;
  let peak = null;
  let low = null;
  for (const h of next) {
    if (!peak || h.dewPoint > peak.dewPoint) peak = h;
    if (!low || h.dewPoint < low.dewPoint) low = h;
  }
  const nowDp = c.dewPoint ?? next[0]?.dewPoint;
  const rise = peak ? peak.dewPoint - nowDp : 0;
  const step = metric ? 4 : 7; // a jump of about 4 °C / 7 °F is easy to feel
  let trend = 'steady';
  if (peak && rise >= step) trend = 'rising';
  else if (low && nowDp - low.dewPoint >= step) trend = 'falling';
  return {
    now: round1(nowDp),
    humidity: c.humidity ?? null,
    comfort: dewComfort(nowDp, metric),
    peak: peak && { dewPoint: round1(peak.dewPoint), time: peak.time, comfort: dewComfort(peak.dewPoint, metric) },
    trend,
    trendNote: trend === 'rising'
      ? `Getting more humid, up to ${Math.round(peak.dewPoint)}${forecast.units?.temp || ''} around ${clock(peak.time)}.`
      : trend === 'falling'
        ? `Drier air on the way, down to ${Math.round(low.dewPoint)}${forecast.units?.temp || ''} around ${clock(low.time)}.`
        : 'About the same for the next day.',
  };
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

// Extra WBGT from standing in the sun. Sunlight heats the black globe well above the
// air temperature, and wind carries that heat away again. This follows the shape of
// the Liljegren model (WBGT = 0.7 wet bulb + 0.2 globe + 0.1 air) closely enough for
// "shade vs sun" advice: about +2.5 °C in strong sun with light wind, +1 °C when breezy.
export function sunBoost(solar, wind, { metric = false } = {}) {
  if (!solar || solar <= 0) return 0;
  const ms = wind == null ? 2 : metric ? wind / 3.6 : wind * 0.447;
  const globeRise = (0.013 * solar) / Math.sqrt(Math.max(0.5, ms));
  const wetBulbRise = 0.0004 * solar;
  const c = Math.min(4, 0.2 * globeRise + 0.7 * wetBulbRise);
  return metric ? c : c * 1.8;
}

export function wbgtSun(h, metric) {
  const shade = wbgtShade(h.temp, h.humidity, metric);
  if (shade == null) return null;
  return round1(shade + sunBoost(h.solar, h.windSpeed, { metric }));
}

export function heatStress(forecast, now = Date.now()) {
  const metric = forecast.units?.temp === '°C';
  const c = forecast.current || {};
  const nowWbgt = wbgtShade(c.temp, c.humidity, metric);
  const nowSun = c.solar != null && c.solar > 0 ? wbgtSun(c, metric) : null;
  const next = (forecast.hourly || []).filter((h) => h.epoch >= now - 3600_000 && h.epoch <= now + 24 * 3600_000);
  let peak = null;
  const hours = [];
  for (const h of next) {
    const shade = wbgtShade(h.temp, h.humidity, metric);
    if (shade == null) continue;
    const sun = h.solar > 0 ? wbgtSun(h, metric) : shade;
    hours.push({ time: h.time, isDay: h.isDay, shade, sun, category: heatCategory(sun, metric) });
    if (!peak || sun > peak.wbgt) peak = { wbgt: sun, shade, time: h.time };
  }
  // The coolest daylight hour is the best time for practice, a run or yard work.
  // Only worth pointing out when some part of the day is hot enough to matter.
  const day = hours.filter((h) => h.isDay);
  const best = day.length && peak && heatCategory(peak.wbgt, metric).label !== 'Low' ? day.reduce((a, b) => (b.sun < a.sun ? b : a)) : null;
  const risky = hours.filter((h) => ['High', 'Very high', 'Extreme'].includes(h.category.label));
  return {
    now: nowWbgt == null ? null : { wbgt: nowWbgt, category: heatCategory(nowWbgt, metric) },
    sun: nowSun == null ? null : { wbgt: nowSun, category: heatCategory(nowSun, metric) },
    peak: peak && { ...peak, category: heatCategory(peak.wbgt, metric) },
    best: best && { time: best.time, wbgt: best.sun, category: best.category },
    riskyHours: risky.length,
    riskyFrom: risky[0]?.time ?? null,
    riskyTo: risky.at(-1)?.time ?? null,
    hourly: hours,
    note: 'Estimated from temperature, humidity, sunshine and wind. Shade has no sun boost. Use an on-site WBGT meter for official practice decisions.',
  };
}

export function healthReport(forecast, now = Date.now()) {
  return { pressure: pressureWatch(forecast, now), heat: heatStress(forecast, now), dew: dewWatch(forecast, now) };
}
