// Tonight's sky for the stargazing card: when it gets dark, which bright planets
// are up, where to look and when, plus moonrise and moonset. Positions come from
// astronomy-engine (VSOP87 / NOVAS-grade math, good to about an arcminute), so
// "low in the southwest at 7:40 PM" is something a kid can actually go and find.
import * as Astro from 'astronomy-engine';

const MIN = 60_000;
const HOUR = 60 * MIN;
const STEP = 10 * MIN;
const MIN_ALT = 8; // degrees above the horizon before trees and houses stop hiding it

const PLANETS = [
  { id: 'mercury', name: 'Mercury', emoji: '☿️', color: '#b7a99a', kid: 'The smallest planet and the closest to the Sun. It never strays far from sunset or sunrise.' },
  { id: 'venus', name: 'Venus', emoji: '✨', color: '#f4e3b2', kid: 'The brightest planet. People often think it is an airplane because it shines so much!' },
  { id: 'mars', name: 'Mars', emoji: '🔴', color: '#e07a5f', kid: 'The red planet. Its dust is full of rust, which makes it look orange-red.' },
  { id: 'jupiter', name: 'Jupiter', emoji: '🪐', color: '#f2cc8f', kid: 'The biggest planet. With binoculars you can spot up to four of its moons as tiny dots.' },
  { id: 'saturn', name: 'Saturn', emoji: '🪐', color: '#e9d8a6', kid: 'The planet with the famous rings. A small telescope shows them!' },
];

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

export function heightWords(alt) {
  if (alt >= 65) return 'almost straight overhead';
  if (alt >= 40) return 'high in the';
  if (alt >= 20) return 'halfway up in the';
  return 'low in the';
}

const where = (alt, az) => (alt >= 65 ? 'almost straight overhead' : `${heightWords(alt)} ${compass(az)}`);

function position(body, date, obs) {
  const eq = Astro.Equator(body, date, obs, true, true);
  const hor = Astro.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth, ra: eq.ra, dec: eq.dec };
}

const iso = (t) => (t == null ? null : new Date(t).toISOString());
const searchTime = (r) => (r ? r.date.getTime() : null);

// The dark window: astronomical-ish darkness (Sun 12° below the horizon). If it is
// already dark we start now. Summer nights far north never get that dark, so we
// fall back to civil twilight (6°) before giving up.
export function darkWindow(obs, now) {
  for (const depth of [-12, -6]) {
    const sunNow = position(Astro.Body.Sun, new Date(now), obs).alt;
    const from = sunNow <= depth ? now : searchTime(Astro.SearchAltitude(Astro.Body.Sun, obs, -1, new Date(now), 1.2, depth));
    if (from == null) continue;
    const until = searchTime(Astro.SearchAltitude(Astro.Body.Sun, obs, +1, new Date(from), 1.2, depth));
    if (until == null) continue;
    return { from, until, twilight: depth === -12 ? 'nautical' : 'civil', darkNow: sunNow <= depth };
  }
  return null;
}

function track(body, obs, from, until) {
  let best = null;
  let first = null;
  let last = null;
  for (let t = from; t <= until; t += STEP) {
    const p = position(body, new Date(t), obs);
    if (p.alt >= MIN_ALT) {
      if (first == null) first = t;
      last = t;
    }
    if (!best || p.alt > best.alt) best = { ...p, t };
  }
  return { best, first, last };
}

function planetReport(planet, obs, win) {
  const body = Astro.Body[planet.name];
  const { best, first, last } = track(body, obs, win.from, win.until);
  const visible = best.alt >= MIN_ALT;
  const bestDate = new Date(best.t);
  const mag = +Astro.Illumination(body, bestDate).mag.toFixed(1);
  const constellation = Astro.Constellation(best.ra, best.dec).name;
  // Planets brighter than about magnitude 2 are easy to see from a town; dimmer
  // ones (Mercury near the Sun, faint Mars) need a dark yard and some luck.
  const easy = visible && mag <= 1.8;
  return {
    id: planet.id,
    name: planet.name,
    emoji: planet.emoji,
    color: planet.color,
    visible,
    easy,
    magnitude: mag,
    brightness: mag <= -2 ? 'dazzling' : mag <= 0 ? 'very bright' : mag <= 1.8 ? 'bright' : 'faint',
    constellation,
    best: visible ? { time: iso(best.t), altitude: Math.round(best.alt), azimuth: Math.round(best.az), where: where(best.alt, best.az) } : null,
    upFrom: iso(first),
    upUntil: iso(last),
    kid: planet.kid,
  };
}

function moonReport(obs, now, win) {
  const rise = searchTime(Astro.SearchRiseSet(Astro.Body.Moon, obs, +1, new Date(now), 1.5));
  const set = searchTime(Astro.SearchRiseSet(Astro.Body.Moon, obs, -1, new Date(now), 1.5));
  const ill = Astro.Illumination(Astro.Body.Moon, new Date(now));
  const mid = win ? (win.from + win.until) / 2 : now;
  const p = position(Astro.Body.Moon, new Date(mid), obs);
  return {
    rise: iso(rise),
    set: iso(set),
    illumination: Math.round(ill.phase_fraction * 100),
    upAtMidnight: p.alt > 0,
    // A bright Moon washes out faint stars (the planets still shine through).
    brightSky: ill.phase_fraction > 0.6 && p.alt > 0,
  };
}

export function tonightSky({ lat, lon }, now = Date.now()) {
  const obs = new Astro.Observer(lat, lon, 0);
  const win = darkWindow(obs, now);
  const moon = moonReport(obs, now, win);
  if (!win) {
    return { location: { lat, lon }, dark: null, planets: [], moon, note: 'The Sun stays up (or just below the horizon) all night here right now, so the sky never gets dark.' };
  }
  const planets = PLANETS.map((p) => planetReport(p, obs, win));
  planets.sort((a, b) => Number(b.visible) - Number(a.visible) || a.magnitude - b.magnitude);
  return {
    location: { lat, lon },
    dark: { from: iso(win.from), until: iso(win.until), twilight: win.twilight, now: win.darkNow },
    planets,
    moon,
    generatedAt: iso(now),
  };
}
