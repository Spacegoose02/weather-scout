// Winter weather from the hourly forecast: how much snow is coming, when roads
// could ice over, and a rough chance of a snow day or delay. Pure functions,
// shared by the server and the web app. Everything runs on the forecast the
// app already has, in the family's units (°F and inches, or °C and cm).

const ICE_CODES = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const isImperial = (fc) => (fc?.units?.temp || '°F') === '°F';

// Freezing and "near freezing" in the forecast's units.
const limits = (fc) => (isImperial(fc) ? { freeze: 32, near: 35, wet: 0.01, snowUnit: 'in', toIn: 1 } : { freeze: 0, near: 1.5, wet: 0.2, snowUnit: 'cm', toIn: 1 / 2.54 });

const round1 = (v) => Math.round(v * 10) / 10;
export const snowText = (amount, unit) => {
  if (!amount || amount < (unit === 'in' ? 0.1 : 0.3)) return 'no snow';
  if (amount < (unit === 'in' ? 0.5 : 1)) return `a dusting (under ${unit === 'in' ? '½ inch' : '1 cm'})`;
  const v = unit === 'in' ? round1(amount) : Math.round(amount);
  return `about ${v} ${unit === 'in' ? (v === 1 ? 'inch' : 'inches') : 'cm'}`;
};

// Snow piling up in the next 24 and 48 hours, plus when it starts and ends.
export function snowTotals(fc, now = Date.now()) {
  const { snowUnit } = limits(fc);
  const hours = (fc?.hourly || []).filter((h) => h.epoch >= now - 30 * 60_000);
  const sum = (ms) => round1(hours.filter((h) => h.epoch < now + ms).reduce((s, h) => s + (h.snow || 0), 0));
  const snowy = hours.filter((h) => (h.snow || 0) > 0);
  const daily = (fc?.daily || []).slice(0, 7).map((d) => ({ date: d.date || d.time, snow: round1(d.snowTotal || 0) }));
  return {
    unit: snowUnit,
    next24: sum(24 * 3600_000),
    next48: sum(48 * 3600_000),
    week: round1(daily.reduce((s, d) => s + d.snow, 0)),
    start: snowy[0]?.time || null,
    end: snowy.at(-1)?.time || null,
    daily,
  };
}

// Hour-by-hour road ice risk for the next 48 hours:
//   high      freezing rain or sleet, or rain/snow falling at or below freezing
//   possible  wet roads (rain now or in the past few hours) and the temperature
//             dropping to freezing, or near-freezing precipitation
// Snow-covered roads are their own hazard and are counted by the snow total.
export function roadIce(fc, now = Date.now()) {
  const { freeze, near, wet } = limits(fc);
  const all = fc?.hourly || [];
  const hours = all.filter((h) => h.epoch >= now - 30 * 60_000);
  let recentWet = (fc?.recent?.precipLast6h || 0) >= wet;
  const out = [];
  for (const h of hours) {
    const falling = (h.precip || 0) >= wet;
    const t = h.temp;
    let risk = null;
    let why = '';
    if (ICE_CODES.has(h.code)) { risk = 'high'; why = 'freezing rain or sleet'; }
    else if (falling && t != null && t <= freeze && !SNOW_CODES.has(h.code)) { risk = 'high'; why = 'rain freezing on the road'; }
    else if (recentWet && t != null && t <= freeze) { risk = 'possible'; why = 'wet roads refreezing'; }
    else if (falling && t != null && t <= near && !SNOW_CODES.has(h.code)) { risk = 'possible'; why = 'cold rain near freezing'; }
    out.push({ time: h.time, epoch: h.epoch, temp: t, risk, why });
    if (falling && !(t != null && t <= freeze && SNOW_CODES.has(h.code))) recentWet = true;
    else if (t != null && t > near + (isImperial(fc) ? 5 : 3)) recentWet = false; // roads dry off when it warms up
  }
  const risky = out.filter((h) => h.risk);
  const worst = risky.find((h) => h.risk === 'high') || risky[0] || null;
  return { hours: out, first: risky[0] || null, worst, level: worst ? worst.risk : 'none' };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const localDate = (epoch, off) => new Date(epoch + off * 1000);

// The next school morning in local time: today if it is before 7 AM on a
// weekday, otherwise the next weekday.
export function nextSchoolMorning(now, offsetSec = 0) {
  const d = localDate(now, offsetSec);
  let day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (d.getUTCHours() >= 7 || day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    do day = new Date(day.getTime() + 86400_000); while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  }
  const iso = day.toISOString().slice(0, 10);
  const today = d.toISOString().slice(0, 10);
  const tomorrow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString().slice(0, 10);
  return { date: iso, name: iso === today ? 'today' : iso === tomorrow ? 'tomorrow' : DAY_NAMES[day.getUTCDay()] };
}

// A rough snow day / delay chance for the next school morning, from snow and ice
// between 6 PM the evening before and 8 AM, and bitter morning cold. Real
// decisions depend on the district (places that rarely see snow close for less),
// so this is a fun guess, not a promise.
export function snowDayOdds(fc, now = Date.now()) {
  const off = fc?.utcOffsetSeconds || 0;
  const imperial = isImperial(fc);
  const morning = nextSchoolMorning(now, off);
  const start = `${new Date(Date.parse(`${morning.date}T00:00Z`) - 86400_000).toISOString().slice(0, 10)}T18:00`;
  const end = `${morning.date}T08:00`;
  const window = (fc?.hourly || []).filter((h) => h.time >= start && h.time <= end);
  if (window.length < 6) return { ...morning, chance: null, reason: 'The forecast does not reach that morning yet.' };
  const snowIn = window.reduce((s, h) => s + (h.snow || 0), 0) * limits(fc).toIn;
  const ice = window.some((h) => ICE_CODES.has(h.code) || (((h.precip || 0) > 0) && h.temp != null && h.temp <= limits(fc).freeze && !SNOW_CODES.has(h.code)));
  const coldest = Math.min(...window.map((h) => (h.feelsLike ?? h.temp ?? 99)));
  const coldF = imperial ? coldest : coldest * 9 / 5 + 32;
  // Snow late in the window (after 3 AM) is the worst for buses.
  const late = window.filter((h) => h.time.slice(11) >= '03:00').reduce((s, h) => s + (h.snow || 0), 0) * limits(fc).toIn;
  let chance = snowIn >= 8 ? 90 : snowIn >= 6 ? 75 : snowIn >= 4 ? 55 : snowIn >= 2 ? 30 : snowIn >= 1 ? 15 : snowIn >= 0.3 ? 5 : 0;
  if (late >= 1) chance += 10;
  if (ice) chance += 30;
  if (coldF <= -25) chance += 30;
  else if (coldF <= -15) chance += 10;
  chance = Math.min(95, chance);
  const reasons = [];
  if (snowIn >= 0.3) reasons.push(`${snowText(imperial ? snowIn : snowIn * 2.54, imperial ? 'in' : 'cm')} of snow overnight`);
  if (ice) reasons.push('ice on the roads');
  if (coldF <= -15) reasons.push(`a feels-like of ${Math.round(coldest)}${fc?.units?.temp || '°F'} at bus time`);
  return { ...morning, chance, snow: round1(snowIn), ice, coldest: Math.round(coldest), reason: reasons.join(', ') || 'No snow or ice expected overnight.' };
}

export function snowDayWord(chance) {
  if (chance == null) return '';
  if (chance >= 75) return 'Very likely';
  if (chance >= 50) return 'Good chance';
  if (chance >= 25) return 'Maybe a delay';
  if (chance >= 10) return 'Small chance';
  return 'School as usual';
}

export const ICE_LEVELS = {
  high: { label: 'Icy roads likely', color: '#c4123a', kid: 'Roads may be slippery like an ice rink. Grown-ups should drive slowly or stay home.' },
  possible: { label: 'Patchy ice possible', color: '#f08a24', kid: 'Some roads and sidewalks may be slippery. Walk like a penguin!' },
  none: { label: 'No ice expected', color: '#2fa84f', kid: 'Roads should be fine.' },
};
