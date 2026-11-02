// The outing gear checklist: pick what you are doing and when, and the hourly
// forecast for just those hours decides what to bring. Pure functions, so they
// are easy to test. Thresholds work in °F, mph and inches whatever the display
// units are.

export const ACTIVITIES = [
  { id: 'playground', emoji: '🛝', label: 'Playground' },
  { id: 'walk', emoji: '🚶', label: 'Walk' },
  { id: 'hike', emoji: '🥾', label: 'Hike' },
  { id: 'bike', emoji: '🚲', label: 'Bike ride' },
  { id: 'beach', emoji: '🏖️', label: 'Beach or pool' },
  { id: 'sports', emoji: '⚽', label: 'Sports' },
];
export const ACTIVITY = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));
export const DURATIONS = [1, 2, 3, 4, 6, 8];

const isThunder = (code) => code >= 95;
const isSnow = (code) => [71, 73, 75, 77, 85, 86].includes(code);
const isWet = (code) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
const isIce = (code) => [48, 56, 57, 66, 67].includes(code);

// The forecast hours an outing overlaps: any hour that starts before the
// outing ends and ends after it starts.
export function windowHours(hourly, start, hours) {
  const end = start + hours * 3_600_000;
  return (hourly || []).filter((h) => h.epoch < end && h.epoch + 3_600_000 > start);
}

// Weather over the outing window, in imperial units for the rules.
export function windowStats(hours, units) {
  const metric = units?.temp === '°C';
  const t = (v) => (v == null ? null : metric ? v * 9 / 5 + 32 : v);
  const w = (v) => (v == null ? null : metric ? v / 1.609 : v);
  const p = (v) => (v == null ? 0 : metric ? v / 25.4 : v);
  const feels = hours.map((h) => t(h.feelsLike ?? h.temp)).filter((v) => v != null);
  const max = (xs) => (xs.length ? Math.max(...xs) : 0);
  return {
    count: hours.length,
    minFeels: feels.length ? Math.min(...feels) : null,
    maxFeels: feels.length ? Math.max(...feels) : null,
    maxChance: max(hours.map((h) => h.precipChance ?? 0)),
    rain: hours.reduce((s, h) => s + p(h.precip), 0),
    wetCode: hours.some((h) => isWet(h.code)),
    snow: hours.some((h) => isSnow(h.code) || (h.snow ?? 0) > 0),
    ice: hours.some((h) => isIce(h.code)),
    thunder: hours.some((h) => isThunder(h.code)),
    maxUv: max(hours.filter((h) => h.isDay !== false).map((h) => h.uv ?? 0)),
    maxGust: max(hours.map((h) => w(h.windGust ?? h.windSpeed) ?? 0)),
    dark: hours.some((h) => h.isDay === false),
  };
}

const ITEMS = {
  umbrella: ['☂️', 'Umbrella', 'Rain is likely while you are out.'],
  raincoat: ['🧥', 'Rain jacket', 'Rain is likely, and a jacket keeps your hands free.'],
  'raincoat-maybe': ['🧥', 'Rain jacket, just in case', 'There is a small chance of a shower.'],
  boots: ['🥾', 'Rain boots', 'Puddles ahead! Keep your toes dry.'],
  'snow-boots': ['🥾', 'Snow boots', 'Snow is around, so stomp in style.'],
  'winter-coat': ['🧥', 'Warm coat', 'It will feel freezing outside.'],
  jacket: ['🧥', 'Light jacket', 'It will be a bit chilly.'],
  layer: ['🧶', 'Extra layer', 'It gets cooler while you are out, so bring a sweater.'],
  windbreaker: ['🌬️', 'Windbreaker', 'Gusty wind makes it feel colder.'],
  beanie: ['🧢', 'Warm hat', 'Keep your ears warm.'],
  mittens: ['🧤', 'Mittens or gloves', 'Cold fingers are no fun.'],
  sunscreen: ['🧴', 'Sunscreen', 'The sun is strong enough to burn. Put it on before you go.'],
  'sun-hat': ['👒', 'Sun hat', 'Shade for your face and neck.'],
  sunglasses: ['🕶️', 'Sunglasses', 'Bright sun is hard on your eyes.'],
  water: ['💧', 'Water bottle', 'Sip often so you do not get thirsty.'],
  snack: ['🍎', 'Snack', 'A long outing needs fuel.'],
  helmet: ['⛑️', 'Helmet', 'Always wear one on a bike.'],
  lights: ['🔦', 'Lights or a flashlight', 'It will be dark for part of the trip.'],
  reflective: ['🦺', 'Something bright or reflective', 'So drivers can see you in the dark.'],
  towel: ['🏖️', 'Towel', 'For drying off after a swim.'],
  swimsuit: ['🩱', 'Swimsuit', 'Ready for a splash.'],
  'bug-spray': ['🦟', 'Bug spray', 'Bugs love warm days on the trail.'],
  'dry-clothes': ['👕', 'Dry clothes for after', 'You may come back soggy.'],
  'wipe-towel': ['🧻', 'Small towel', 'To dry off wet slides and swings.'],
};

const item = (id) => ({ id, emoji: ITEMS[id][0], label: ITEMS[id][1], why: ITEMS[id][2] });

// What to bring for an activity over a window of forecast hours.
// Returns { items, warnings, stats }, or null when the forecast does not reach
// that far.
export function gearFor(hourly, { start, hours, activity = 'walk', units } = {}) {
  const span = windowHours(hourly, start, hours);
  if (!span.length) return null;
  const s = windowStats(span, units);
  const keys = new Set();
  const warnings = [];
  const add = (...ids) => ids.forEach((id) => keys.add(id));

  // Rain. A bike, sports or a windy day makes an umbrella useless.
  const rainy = s.maxChance >= 50 || s.wetCode;
  const noUmbrella = ['bike', 'sports', 'beach'].includes(activity) || s.maxGust >= 30;
  if (rainy) {
    add('raincoat');
    if (!noUmbrella) add('umbrella');
    if ((s.rain >= 0.1 || s.wetCode) && activity !== 'beach') add('boots');
    if (activity === 'playground') add('wipe-towel');
    if (['hike', 'bike', 'sports'].includes(activity) && hours >= 2) add('dry-clothes');
  } else if (s.maxChance >= 30) {
    add('raincoat-maybe');
  }

  // Cold.
  if (s.snow) add('snow-boots', 'beanie', 'mittens');
  if (s.minFeels != null && s.minFeels < 35) add('winter-coat', 'beanie', 'mittens');
  else if (s.minFeels != null && s.minFeels < 55 && !keys.has('raincoat')) add('jacket');
  if (s.minFeels != null && s.maxFeels - s.minFeels >= 12 && s.minFeels < 65 && !keys.has('winter-coat')) add('layer');
  if (s.maxGust >= 25 && s.minFeels != null && s.minFeels < 65 && !keys.has('winter-coat') && !keys.has('raincoat')) add('windbreaker');
  if (keys.has('boots') && keys.has('snow-boots')) keys.delete('boots');

  // Sun. UV only counts in daylight hours.
  const uvBar = activity === 'beach' ? 2 : 3;
  if (s.maxUv >= uvBar) add('sunscreen');
  if (s.maxUv >= 6 || (activity === 'beach' && s.maxUv >= 3)) add('sun-hat', 'sunglasses');

  // Water and food.
  const active = ['hike', 'bike', 'sports'].includes(activity);
  if ((s.maxFeels ?? 0) >= 80 || active || hours >= 3 || activity === 'beach') add('water');
  if (hours >= 3 || (activity === 'hike' && hours >= 2)) add('snack');

  // The activity itself.
  if (activity === 'bike') add('helmet');
  if (activity === 'beach') add('swimsuit', 'towel');
  if (activity === 'hike' && (s.maxFeels ?? 0) >= 60) add('bug-spray');
  if (s.dark && ['walk', 'hike', 'bike'].includes(activity)) add('lights', 'reflective');
  else if (s.dark) add('lights');

  // Things no gear fixes.
  if (s.thunder) warnings.push(activity === 'beach' ? 'Thunderstorms are possible. Get out of the water and head indoors at the first rumble.' : 'Thunderstorms are possible. When thunder roars, go indoors!');
  if (s.minFeels != null && s.minFeels < 15) warnings.push('It will feel dangerously cold. Keep the trip short and cover every bit of skin.');
  if ((s.maxFeels ?? 0) >= 103) warnings.push('It will be dangerously hot. Go early or late, and take lots of shade breaks.');
  else if ((s.maxFeels ?? 0) >= 90) warnings.push('It will be hot, so plan shade and water breaks.');
  if (s.ice) warnings.push('Ice is possible, so sidewalks and trails may be slippery.');
  if (s.maxGust >= 40) warnings.push(activity === 'bike' ? 'Wind gusts are strong enough to push a bike around. Maybe walk today.' : 'Wind gusts will be strong. Watch for falling branches.');

  return { items: [...keys].map(item), warnings, stats: s };
}

// "9 AM", or "Tue 9 AM" when it is not today, in the place's own time zone.
export function hourLabel(epoch, timeZone, now = Date.now()) {
  const opts = (o) => {
    try {
      return new Date(epoch).toLocaleString([], { ...o, timeZone });
    } catch {
      return new Date(epoch).toLocaleString([], o);
    }
  };
  const time = opts({ hour: 'numeric' });
  return dayKey(epoch, timeZone) === dayKey(now, timeZone) ? time : `${opts({ weekday: 'short' })} ${time}`;
}

export function dayKey(epoch, timeZone) {
  try {
    return new Date(epoch).toLocaleDateString('en-CA', { timeZone });
  } catch {
    return new Date(epoch).toLocaleDateString('en-CA');
  }
}

// Start times to choose from: the current hour, then each hour for a day.
export function startOptions(hourly, now = Date.now()) {
  return (hourly || []).filter((h) => h.epoch + 3_600_000 > now).slice(0, 24).map((h, i) => ({ epoch: i === 0 ? Math.max(h.epoch, now) : h.epoch, now: i === 0 }));
}
