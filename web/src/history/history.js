// Pure helpers for the "On this day" views.

const sign = (v) => (v > 0 ? `+${v}` : `${v}`);

export const tempText = (v, units) => (v == null ? '–' : `${Math.round(v)}${units?.temp || '°'}`);

export function amountText(v, unit) {
  if (v == null) return '–';
  if (v > 0 && v < 0.005) return 'trace';
  if (unit === 'in') return `${v.toFixed(2)} in`;
  return `${Math.round(v * 10) / 10} ${unit}`;
}

// "8° warmer than normal", "2° below normal", "right at normal".
export function diffText(diff) {
  if (diff == null) return '';
  const d = Math.round(diff);
  if (d === 0) return 'right at normal';
  return `${Math.abs(d)}° ${d > 0 ? 'above' : 'below'} normal`;
}

export const signed = (v) => (v == null ? '' : sign(Math.round(v)));

const RECORD_TEXT = {
  'record-high': '🔥 Forecast ties or breaks the record high',
  'near-record-high': '🔥 Within a couple of degrees of the record high',
  'record-low': '🥶 Forecast ties or breaks the record low',
  'near-record-low': '🥶 Within a couple of degrees of the record low',
};
export const recordText = (flag) => RECORD_TEXT[flag] || '';

// A rank phrase: "Warmer than 71 of 86 past Nov 2nds".
export function rankText(compare, label) {
  if (!compare?.of) return '';
  const n = compare.warmerThan;
  if (n === compare.of) return `Warmer than every ${label} since records began here`;
  if (n === 0) return `Cooler than every ${label} on record here`;
  return `Warmer than ${n} of ${compare.of} past ${label}s`;
}

// Years worth calling out in a short list: last year, 10, 25 and 50 years ago,
// plus the record years.
export function highlightYears(h) {
  const want = new Map();
  const add = (year, why) => {
    if (!year || want.has(year)) return;
    want.set(year, why);
  };
  const thisYear = Number(h.date.slice(0, 4));
  add(thisYear - 1, 'Last year');
  add(thisYear - 10, '10 years ago');
  add(thisYear - 25, '25 years ago');
  add(thisYear - 50, '50 years ago');
  add(h.records?.warmestHigh?.year, 'Record high');
  add(h.records?.coldestLow?.year, 'Record low');
  return h.years
    .filter((y) => want.has(y.year))
    .map((y) => ({ ...y, why: want.get(y.year) }));
}

// Scales for the all-years chart: x by year, y by temperature, with a little
// room above and below.
export function chartScale(years, normal, { width = 600, height = 180, pad = 18 } = {}) {
  const temps = years.flatMap((y) => [y.high, y.low]).filter((v) => v != null);
  if (normal?.high != null) temps.push(normal.high);
  if (normal?.low != null) temps.push(normal.low);
  if (!temps.length) return null;
  const lo = Math.floor(Math.min(...temps) / 5) * 5;
  const hi = Math.ceil(Math.max(...temps) / 5) * 5 || lo + 5;
  const first = Math.min(...years.map((y) => y.year));
  const last = Math.max(...years.map((y) => y.year));
  const x = (year) => pad + ((year - first) / Math.max(1, last - first)) * (width - pad * 2);
  const y = (t) => pad + (1 - (t - lo) / Math.max(1, hi - lo)) * (height - pad * 2);
  const ticks = [];
  for (let t = lo; t <= hi; t += hi - lo > 40 ? 20 : 10) ticks.push(t);
  return { x, y, lo, hi, first, last, width, height, pad, ticks };
}

// The time machine's year dial: a year from the list, or the closest one.
export function yearAt(years, year) {
  if (!years.length) return null;
  return years.reduce((best, y) => (Math.abs(y.year - year) < Math.abs(best.year - year) ? y : best), years[0]);
}
