// Lightning math shared by the server (alerts) and the web app (map, banners,
// kid tips). A strike is { t, lat, lon, src } where t is epoch milliseconds and
// src is 'glm' (NOAA GOES satellite) or 'bo' (Blitzortung.org ground network).
// Kept free of any data source so later features (storm chaser tools, strike
// counts, storm motion) can reuse it as is.

export const WINDOW_MIN = 30; // how long strikes stay on the map, and the 30-30 rule's wait
export const SAFE_MILES = 10; // NWS: lightning can strike 10 miles from the storm
export const ALERT_MILES = [5, 10, 15, 25, 50];
export const DEFAULT_ALERT_MILES = 10;

export const SOURCES = {
  glm: { name: 'GOES satellite (NOAA GLM)', short: 'Satellite', attribution: 'Lightning: NOAA GOES GLM' },
  bo: { name: 'Blitzortung.org ground network', short: 'Ground sensors', attribution: 'Lightning: <a href="https://www.blitzortung.org/">Blitzortung.org</a> and contributors' },
};

const R_MILES = 3958.8;
const rad = (d) => (d * Math.PI) / 180;

export function distanceMiles(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass direction from a to b, in degrees (0 = north).
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const POINT_WORDS = { N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest' };
export const compass = (deg) => POINTS[Math.round(deg / 45) % 8];
export const compassWord = (deg) => POINT_WORDS[compass(deg)];
export const dirWord = (abbr) => POINT_WORDS[abbr] || '';

export const milesToKm = (mi) => mi * 1.609344;

// A rough box around a point, for asking the server for strikes near a place.
export function boxAround({ lat, lon }, miles) {
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.max(0.1, Math.cos(rad(lat))));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

export const inBox = (s, b) => s.lat >= b.south && s.lat <= b.north && (b.west <= b.east ? s.lon >= b.west && s.lon <= b.east : s.lon >= b.west || s.lon <= b.east);

// Map colors by age: a bright white-yellow flash fading to deep red, then gone.
export const AGE_STEPS = [
  { min: 1, color: '#ffffff', ring: '#ffe94d', radius: 7, label: 'just now' },
  { min: 5, color: '#ffe94d', ring: '#b88a00', radius: 5.5, label: '5 min' },
  { min: 10, color: '#ffb020', ring: '#8a5200', radius: 5, label: '10 min' },
  { min: 20, color: '#ff5a1f', ring: '#7a2100', radius: 4.5, label: '20 min' },
  { min: WINDOW_MIN, color: '#c4123a', ring: '#5c0018', radius: 4, label: '30 min' },
];

// Style for a strike `ageMin` minutes old, or null once it has faded out.
export function strikeStyle(ageMin) {
  if (ageMin < 0) ageMin = 0;
  if (ageMin > WINDOW_MIN) return null;
  const step = AGE_STEPS.find((s) => ageMin <= s.min) || AGE_STEPS[AGE_STEPS.length - 1];
  // Fade smoothly over the window so old strikes recede behind new ones.
  const opacity = Math.max(0.25, 1 - (ageMin / WINDOW_MIN) * 0.75);
  return { ...step, opacity };
}

// What is happening around one place. `strikes` can be any list (unsorted, any area).
export function nearby(strikes, place, { miles = DEFAULT_ALERT_MILES, now = Date.now(), windowMin = WINDOW_MIN } = {}) {
  const since = now - windowMin * 60_000;
  let nearest = null;
  let newest = null;
  let count = 0;
  let last10 = 0;
  for (const s of strikes) {
    if (s.t < since || s.t > now + 60_000) continue;
    const d = distanceMiles(place, s);
    if (d > miles) continue;
    count += 1;
    if (s.t >= now - 10 * 60_000) last10 += 1;
    if (!nearest || d < nearest.miles) nearest = { ...s, miles: d };
    if (!newest || s.t > newest.t) newest = { ...s, miles: d };
  }
  const describe = (s) => s && { t: s.t, lat: s.lat, lon: s.lon, src: s.src, miles: Math.round(s.miles * 10) / 10, dir: compass(bearing(place, s)), ageMin: Math.max(0, Math.round((now - s.t) / 60_000)) };
  return {
    miles,
    count,
    last10,
    nearest: describe(nearest),
    newest: describe(newest),
    // 30-30 rule: stay inside until 30 minutes pass with no lightning nearby.
    allClearAt: newest ? new Date(newest.t + WINDOW_MIN * 60_000).toISOString() : null,
    minutesToAllClear: newest ? Math.max(0, Math.ceil((newest.t + WINDOW_MIN * 60_000 - now) / 60_000)) : 0,
  };
}

// Flash-to-bang: sound covers about a mile every 5 seconds.
export const flashToBangMiles = (seconds) => Math.round((seconds / 5) * 10) / 10;

// The kid "count to 30" tip, with an answer for a counted number of seconds.
export function thunderCount(seconds) {
  const miles = flashToBangMiles(seconds);
  if (seconds < 30) {
    return { seconds, miles, inside: true, say: `${seconds} seconds means the storm is about ${miles} miles away. That is close enough for lightning to reach you. Go inside now and stay in for 30 minutes after the last thunder.` };
  }
  return { seconds, miles, inside: false, say: `${seconds} seconds means the storm is about ${miles} miles away. Keep an eye on it. If you can hear thunder at all, it is safest to head inside.` };
}

export const THUNDER_TIP = {
  title: 'Count to 30',
  short: 'See lightning? Count until you hear thunder. If thunder comes before you reach 30, go inside!',
  steps: [
    'When you see a flash, start counting: one-Mississippi, two-Mississippi…',
    'Stop when you hear the thunder.',
    'Under 30? The storm is less than 6 miles away. Go inside right away.',
    'Wait 30 minutes after the last thunder before you go back out.',
  ],
  why: 'Light zooms to your eyes almost instantly, but sound is slow: it takes about 5 seconds to travel one mile.',
  rhyme: 'When thunder roars, go indoors!',
};
