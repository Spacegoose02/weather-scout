// Junior Storm Chaser (Kid Zone): the live parts.
// - Chase Day: today's Storm Prediction Center outlook, explained for kids
// - Pick your target: storm reports to score a kid's target against
// - Live chase: admin-picked YouTube chaser streams, shown while warnings are up
// - Storm cards: collectible cards made from today's real storm reports
// All public NOAA data. Kept in its own file and table, like kidzone.js.
import { UpstreamError, fetchJson } from './cache.js';
import { parseYoutubeRef, resolveYoutubeChannel, loadYoutubeVideo } from './providers/news.js';
import * as severe from './providers/severe.js';
import { STATES } from '../../shared/chase-states.js';

const MIN = 60_000;
const SPC = 'https://www.spc.noaa.gov';
export const SPC_PROB = (kind, day = 1) => `${SPC}/products/outlook/day${day}otlk_${kind}.lyr.geojson`;
export const SPC_TEXT = 'https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=SWODY1&fmt=text&limit=1';
const MAX_STREAMS = 30;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chase_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('channel', 'video')),
  yt_id TEXT NOT NULL,
  anytime INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---- geometry ---------------------------------------------------------------------
const R_MILES = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
export function miles(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}
const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export function direction(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return DIRS[Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) / 45) % 8];
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Point in a GeoJSON Polygon or MultiPolygon (holes respected).
export function inGeometry(geom, lat, lon) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((rings) => rings.length && inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)));
}

export { STATES };
export const STATE_NAME = Object.fromEntries(STATES.map((s) => [s.abbr, s.name]));

function ringsOf(geom) {
  const polys = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map((p) => p[0]).filter((r) => r?.length);
}
// Which states an outlook area covers: sample a half-degree grid inside it, give each
// point to the nearest state middle, and keep the states with a fair share.
export function statesIn(geoms, { step = 0.5, share = 0.12 } = {}) {
  const tally = new Map();
  let total = 0;
  for (const g of geoms) {
    for (const ring of ringsOf(g)) {
      const lons = ring.map((p) => p[0]);
      const lats = ring.map((p) => p[1]);
      const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
      let hits = 0;
      const add = (lat, lon) => {
        const near = nearestState(lat, lon);
        tally.set(near.name, (tally.get(near.name) || 0) + 1);
        total++;
        hits++;
      };
      for (let lat = s + step / 2; lat < n; lat += step) {
        for (let lon = w + step / 2; lon < e; lon += step) if (inGeometry(g, lat, lon)) add(lat, lon);
      }
      // Too small for the grid: use its middle.
      if (!hits) add(lats.reduce((t, x) => t + x, 0) / lats.length, lons.reduce((t, x) => t + x, 0) / lons.length);
    }
  }
  return [...tally].filter(([, c]) => c / total >= share).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}
function nearestState(lat, lon) {
  let best = STATES[0];
  let bestD = Infinity;
  for (const st of STATES) {
    const d = miles({ lat, lon }, st);
    if (d < bestD) {
      best = st;
      bestD = d;
    }
  }
  return best;
}
export const listWords = (xs) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// ---- convective days -------------------------------------------------------------
// SPC days run 12Z to 12Z, so a storm at 1 AM Central still belongs to "yesterday".
export function convectiveDay(now = Date.now()) {
  return new Date(now - 12 * 3600_000).toISOString().slice(0, 10);
}
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
// Picks for today's chase close at 20Z (3 PM Central in summer), before most storms fire.
export const PICK_CLOSE_HOUR = 20;
export function picksCloseAt(day) {
  return `${day}T${String(PICK_CLOSE_HOUR).padStart(2, '0')}:00:00Z`;
}

// ---- Chase Day (outlook in kid words) ----------------------------------------------
const CAT_ORDER = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];
const CAT_KID = {
  NONE: { level: 0, word: 'no storms', kid: 'No thunderstorms are expected anywhere today.' },
  TSTM: { level: 0, word: 'regular thunderstorms', kid: 'Some everyday thunderstorms, with rumbles and rain but probably nothing severe.' },
  MRGL: { level: 1, word: 'Marginal (level 1 of 5)', kid: 'A storm or two might get strong. Most storms will be ordinary.' },
  SLGT: { level: 2, word: 'Slight (level 2 of 5)', kid: 'A few storms could turn severe, with big hail or strong wind.' },
  ENH: { level: 3, word: 'Enhanced (level 3 of 5)', kid: 'Lots of strong storms are possible. Chasers are getting their gear ready!' },
  MDT: { level: 4, word: 'Moderate (level 4 of 5)', kid: 'Many severe storms are likely. This is a big day for forecasters.' },
  HIGH: { level: 5, word: 'High (level 5 of 5)', kid: 'A huge storm outbreak is expected. This only happens a few times a year.' },
};

// Ingredients Rocky looks for in the forecasters' discussion.
export const INGREDIENTS = [
  { id: 'moisture', emoji: '💧', name: 'Moisture', re: /moist|dew ?point|humid|gulf/i, kid: 'Warm, wet air is the fuel. Storms need lots of water vapor to build their clouds.' },
  { id: 'instability', emoji: '🎈', name: 'Rising air', re: /instab|buoyan|cape|unstable|lapse rate/i, kid: 'When warm air near the ground is lighter than the air above, it shoots up like a hot-air balloon.' },
  { id: 'lift', emoji: '⬆️', name: 'A push up', re: /front|dryline|outflow|trough|low pressure|surface low|cyclone|upslope/i, kid: 'Something has to give the air a push: a front, a dryline or a low-pressure system.' },
  { id: 'shear', emoji: '🌀', name: 'Wind shear', re: /shear|helicity|srh|jet|veer/i, kid: 'Winds that change speed and direction as you go up can make a storm spin. That spin is how supercells form.' },
];
const HAZARD_WORDS = [
  ['tornado', /tornado/i, '🌪️'], ['hail', /hail/i, '🧊'], ['wind', /damaging wind|severe gust|wind gust|wind damage|derecho/i, '💨'], ['supercell', /supercell/i, '⛈️'],
];

export function parseSpcText(text) {
  const s = String(text || '').replace(/\r/g, '');
  const grab = (re) => {
    const m = s.match(re);
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
  };
  const summary = grab(/\.\.\.SUMMARY\.\.\.\s*\n([\s\S]*?)(?:\n\s*\n|\n\.\.\.|$)/);
  const valid = s.match(/VALID (\d{6}Z) - (\d{6}Z)/)?.slice(1) || null;
  return { summary: summary?.slice(0, 800) || null, ingredients: INGREDIENTS.filter((i) => i.re.test(s)).map(({ re, ...rest }) => rest), hazards: HAZARD_WORDS.filter(([, re]) => re.test(s)).map(([id, , emoji]) => ({ id, emoji })), valid };
}

// Probability layers: LABEL "0.05" -> 5%. Hatched areas (SIGN or the newer CIG1-3)
// mean the strongest kind is possible.
export function probSummary(raw, home) {
  let max = 0;
  let sig = false;
  let atHome = 0;
  let homeSig = false;
  const geoms = [];
  for (const f of raw?.features || []) {
    const label = String(f.properties?.LABEL || '');
    const n = Number(label);
    const isSig = /^(SIGN|CIG\d)$/i.test(label);
    if (!f.geometry || (!isSig && !(n > 0))) continue;
    const here = home && inGeometry(f.geometry, home.lat, home.lon);
    if (isSig) {
      sig = true;
      if (here) homeSig = true;
    } else {
      const pct = Math.round(n * 100);
      if (pct > max) {
        max = pct;
        geoms.length = 0;
      }
      if (pct === max) geoms.push(f.geometry);
      if (here) atHome = Math.max(atHome, pct);
    }
  }
  return { max, sig, atHome, homeSig, geoms };
}

export function chaseDay({ cat, torn, hail, wind, text, day2, home, day, now = Date.now() }) {
  let top = 'NONE';
  let topGeoms = [];
  let homeCat = 'NONE';
  for (const f of cat?.features || []) {
    const label = f.properties?.label || f.properties?.LABEL;
    if (!CAT_ORDER.includes(label) || !f.geometry) continue;
    if (CAT_ORDER.indexOf(label) > CAT_ORDER.indexOf(top)) {
      top = label;
      topGeoms = [];
    }
    if (label === top) topGeoms.push(f.geometry);
    if (home && inGeometry(f.geometry, home.lat, home.lon) && CAT_ORDER.indexOf(label) > CAT_ORDER.indexOf(homeCat)) homeCat = label;
  }
  const t = probSummary(torn, home);
  const h = probSummary(hail, home);
  const w = probSummary(wind, home);
  const where = top === 'NONE' ? [] : statesIn(topGeoms).slice(0, 5);
  const tornWhere = t.max >= 5 ? statesIn(t.geoms).slice(0, 4) : [];
  const info = CAT_KID[top];

  let rating = 'down';
  if (info.level >= 4 || t.max >= 15) rating = 'big';
  else if (info.level >= 2 || t.max >= 5) rating = 'chase';
  else if (info.level === 1) rating = 'maybe';
  const headline = {
    big: 'It\'s a BIG chase day!',
    chase: 'Today is a chase day!',
    maybe: 'Maybe a chase day.',
    down: 'Today is a down day.',
  }[rating];
  const whereText = where.length ? ` The best storms should be around ${listWords(where)}.` : '';
  const parsed = parseSpcText(text);

  const why = [];
  if (rating === 'down') why.push(top === 'TSTM' ? 'There may be some thunderstorms, but the ingredients for big storms are not lined up. Chasers call this a down day: time to fix the car and study radar!' : 'The sky is calm for chasers today. Chasers call this a down day: time to fix the car and study radar!');
  else why.push(`The Storm Prediction Center gave today a ${info.word} risk. ${info.kid}`);
  const sameWhere = tornWhere.join() === where.join();
  if (t.max >= 2) why.push(`The chance of a tornado near any one spot is as high as ${t.max} out of 100${tornWhere.length && !sameWhere ? `, around ${listWords(tornWhere)}` : ''}.${t.sig ? ' Forecasters even drew a striped area where strong tornadoes could happen.' : ''}`);
  if (h.max >= 15) why.push(`Hail chance up to ${h.max}%.${h.sig ? ' Some hail could be bigger than golf balls!' : ''}`);
  if (w.max >= 15) why.push(`Damaging wind chance up to ${w.max}%.${w.sig ? ' Some gusts could top 75 mph!' : ''}`);

  // Your house: always calm and about safety, never about going out to chase.
  let home_ = null;
  if (home) {
    const level = CAT_KID[homeCat].level;
    home_ = {
      category: homeCat,
      level,
      tornado: t.atHome,
      text: level >= 2 || t.atHome >= 5
        ? 'Strong storms could come near your house today. Real chasers are grown-ups with lots of training, and the best chasers know when to stay home. If a warning comes, go to your safe spot right away.'
        : level === 1
          ? 'A strong storm could pop up near you, but most likely it will be ordinary. A grown-up will keep an eye on the alerts.'
          : top === 'NONE' || homeCat === 'NONE' ? 'No severe storms are expected at your house today.' : 'Just ordinary storms near you, if any.',
    };
  }

  const tomorrow = day2 ? (() => {
    let best = 'NONE';
    for (const f of day2.features || []) {
      const label = f.properties?.label || f.properties?.LABEL;
      if (CAT_ORDER.indexOf(label) > CAT_ORDER.indexOf(best)) best = label;
    }
    const g = (day2.features || []).filter((f) => (f.properties?.label || f.properties?.LABEL) === best && f.geometry).map((f) => f.geometry);
    const names = best === 'NONE' || best === 'TSTM' ? [] : statesIn(g).slice(0, 4);
    return { category: best, level: CAT_KID[best].level, text: CAT_KID[best].level >= 1 ? `Tomorrow: ${CAT_KID[best].word} risk${names.length ? ` around ${listWords(names)}` : ''}.` : 'Tomorrow looks quiet for chasers.' };
  })() : null;

  const say = [headline, ...why.slice(0, 2)].join(' ') + whereText;
  return {
    day,
    rating,
    headline,
    category: top,
    level: info.level,
    riskName: info.word,
    where,
    say,
    why,
    probabilities: { tornado: { max: t.max, sig: t.sig }, hail: { max: h.max, sig: h.sig }, wind: { max: w.max, sig: w.sig } },
    ingredients: parsed.ingredients,
    hazards: parsed.hazards,
    summary: parsed.summary,
    home: home_,
    tomorrow,
    picksOpen: now < Date.parse(picksCloseAt(day)),
    picksCloseAt: picksCloseAt(day),
    source: 'NOAA Storm Prediction Center',
  };
}

// ---- storm reports -----------------------------------------------------------------
const yymmdd = (day) => day.slice(2).replaceAll('-', '');
export function reportsUrl(day, now = Date.now()) {
  const today = convectiveDay(now);
  if (day === today) return `${SPC}/climo/reports/today_filtered.csv`;
  if (day === addDays(today, -1)) return `${SPC}/climo/reports/yesterday_filtered.csv`;
  return `${SPC}/climo/reports/${yymmdd(day)}_rpts_filtered.csv`;
}

// The SPC CSV has three sections (tornado, wind, hail), each with its own header.
// Comments are dropped: they can mention injuries, and kids only need the facts.
export function parseReports(csv, day) {
  const out = [];
  let type = null;
  for (const line of String(csv || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts[0] === 'Time') {
      type = /F_Scale/i.test(parts[1]) ? 'tornado' : /Speed/i.test(parts[1]) ? 'wind' : /Size/i.test(parts[1]) ? 'hail' : null;
      continue;
    }
    if (!type || parts.length < 7) continue;
    const [time, mag, location, county, state, lat, lon] = parts;
    const la = Number(lat);
    const lo = Number(lon);
    if (!/^\d{3,4}$/.test(time) || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const hhmm = time.padStart(4, '0');
    // Times are UTC; 00Z-11Z belong to the next calendar day.
    const date = Number(hhmm.slice(0, 2)) < 12 ? addDays(day, 1) : day;
    let magnitude = null;
    if (type === 'hail') {
      if (!/^\d+$/.test(mag)) continue;
      magnitude = Number(mag) / 100;
    }
    if (type === 'wind' && /^\d+$/.test(mag)) magnitude = Number(mag);
    else if (type === 'tornado') {
      const ef = String(mag).match(/^E?F?(\d)$/i);
      magnitude = ef ? Number(ef[1]) : null;
    }
    out.push({
      type, magnitude, lat: la, lon: lo,
      time: `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`,
      location: clean(location), county: clean(county), state: clean(state).toUpperCase().slice(0, 2),
    });
  }
  return out;
}
const clean = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 60);

// Points for a target: closer to a real storm report is better, tornadoes count most.
export function scoreTarget(target, reports) {
  if (!reports.length) return { reports: 0, nearest: null, miles: null, points: 0, within50: 0, tornadoesWithin50: 0 };
  let best = null;
  let within50 = 0;
  let tornadoesWithin50 = 0;
  for (const r of reports) {
    const d = miles(target, r);
    if (d <= 50) {
      within50++;
      if (r.type === 'tornado') tornadoesWithin50++;
    }
    // A tornado report counts as if it were a bit closer than a hail or wind report.
    const eff = r.type === 'tornado' ? d * 0.8 : d;
    if (!best || eff < best.eff) best = { r, d, eff };
  }
  const d = best.d;
  let points = d <= 25 ? 10 : d <= 50 ? 7 : d <= 100 ? 5 : d <= 200 ? 3 : d <= 400 ? 1 : 0;
  if (tornadoesWithin50) points += 3;
  if (within50 >= 10) points += 2;
  return {
    reports: reports.length,
    nearest: { type: best.r.type, location: best.r.location, state: best.r.state, time: best.r.time, magnitude: best.r.magnitude, direction: direction(target, best.r) },
    miles: Math.round(d),
    points,
    within50,
    tornadoesWithin50,
  };
}

// ---- storm cards -------------------------------------------------------------------
export const HAIL_SIZES = [
  [4.5, 'a softball'], [4, 'a grapefruit'], [3, 'a teacup'], [2.75, 'a baseball'], [2.5, 'a tennis ball'], [2, 'an egg'],
  [1.75, 'a golf ball'], [1.5, 'a ping pong ball'], [1.25, 'a half dollar'], [1, 'a quarter'], [0.88, 'a nickel'], [0, 'a penny'],
];
export const hailLike = (inches) => HAIL_SIZES.find(([n]) => inches >= n)?.[1] || 'a pea';

const RARITY = ['common', 'rare', 'epic', 'legendary'];
export function rarityOf(r) {
  if (r.type === 'tornado') return r.magnitude != null && r.magnitude >= 2 ? 'legendary' : 'epic';
  if (r.type === 'hail') return r.magnitude >= 2.75 ? 'legendary' : r.magnitude >= 1.75 ? 'epic' : r.magnitude >= 1 ? 'rare' : 'common';
  if (r.type === 'wind') return r.magnitude >= 80 ? 'legendary' : r.magnitude >= 70 ? 'epic' : r.magnitude >= 60 ? 'rare' : 'common';
  return 'common';
}
// A 0-100 power bar, so cards can be compared at a glance.
export function powerOf(r) {
  if (r.type === 'tornado') return r.magnitude == null ? 70 : Math.min(100, 60 + r.magnitude * 8);
  if (r.type === 'hail') return Math.min(100, Math.round((r.magnitude / 4.5) * 100));
  if (r.type === 'wind') return r.magnitude == null ? 40 : Math.min(100, Math.round(((r.magnitude - 40) / 60) * 100));
  return 30;
}
const TYPE_INFO = {
  tornado: { emoji: '🌪️', name: 'Tornado', fact: 'A tornado is a spinning column of air that reaches from a storm cloud down to the ground.' },
  hail: { emoji: '🧊', name: 'Hailstorm', fact: 'Hailstones grow as strong updrafts toss them up and down through freezing air inside the storm.' },
  wind: { emoji: '💨', name: 'Wind storm', fact: 'Rain-cooled air crashing down from a storm spreads out along the ground as a gust front.' },
};
export function statLine(r) {
  if (r.type === 'tornado') return r.magnitude != null ? `Rated EF${r.magnitude}` : 'Rating: still being surveyed';
  if (r.type === 'hail') return `${r.magnitude.toFixed(2)}" hail, as big as ${hailLike(r.magnitude)}`;
  return r.magnitude != null ? `${r.magnitude} mph gust` : 'Damaging wind';
}

// "4 SW Chickasha" -> "Chickasha"
export const townOf = (location) => String(location || '').replace(/^\d+(\.\d+)?\s+[NSEW]{1,3}\s+/, '');

export function stormCards(reports, day, { max = 9 } = {}) {
  const score = (r) => RARITY.indexOf(rarityOf(r)) * 1000 + powerOf(r);
  const picked = [];
  const seen = new Set();
  for (const r of [...reports].sort((a, b) => score(b) - score(a))) {
    // One card per kind of storm per county, so the deck isn't ten copies of one storm.
    const k = `${r.type}:${r.state}:${r.county}`;
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(r);
    if (picked.length >= max) break;
  }
  const counts = { tornado: 0, hail: 0, wind: 0 };
  for (const r of reports) counts[r.type]++;
  return {
    day,
    counts,
    cards: picked.map((r, i) => ({
      id: `${day}-${r.type}-${r.time.slice(11, 16).replace(':', '')}-${r.lat.toFixed(2)}-${r.lon.toFixed(2)}`,
      day,
      type: r.type,
      emoji: TYPE_INFO[r.type].emoji,
      name: `${townOf(r.location) || r.county} ${TYPE_INFO[r.type].name}`,
      place: [r.location, r.county && `${r.county} County`, STATE_NAME[r.state] || r.state].filter(Boolean).join(', '),
      state: r.state,
      lat: r.lat,
      lon: r.lon,
      time: r.time,
      magnitude: r.magnitude,
      stat: statLine(r),
      power: powerOf(r),
      rarity: rarityOf(r),
      fact: TYPE_INFO[r.type].fact,
      stormOfTheDay: i === 0,
    })),
  };
}

// ---- live chase streams ---------------------------------------------------------------
// The NWS warnings that make a chase "live": tornado and severe thunderstorm warnings.
export function warningSummary(national) {
  const tornado = [];
  const severe_ = [];
  for (const f of national?.features || []) {
    const p = f.properties || {};
    if (/tornado warning/i.test(p.event)) tornado.push(p);
    else if (/severe thunderstorm warning/i.test(p.event)) severe_.push(p);
  }
  const states = new Set();
  for (const p of [...tornado, ...severe_]) {
    for (const m of String(p.area || '').matchAll(/,\s*([A-Z]{2})\b/g)) if (STATE_NAME[m[1]]) states.add(STATE_NAME[m[1]]);
  }
  return { tornado: tornado.length, severe: severe_.length, active: tornado.length + severe_.length > 0, states: [...states].slice(0, 6) };
}

// Is this YouTube page live right now? Returns the live video id, or null.
export function liveVideoFrom(html) {
  const s = String(html || '');
  if (!/"isLiveNow":true|"isLive":true/.test(s)) return null;
  return s.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1]
    || s.match(/"videoId":"([\w-]{11})"/)?.[1]
    || null;
}

async function fetchPage(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'accept-language': 'en', 'user-agent': 'Mozilla/5.0 (WeatherScout)' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new UpstreamError('YouTube', res.status);
  return res.text();
}

export function registerChaser(app, { db, cache, fetchImpl, requireAdmin, latLonSchema, loc, nwsUserAgent }) {
  db.exec(SCHEMA);
  const spcJson = (url) => fetchJson(url, { source: 'Storm Prediction Center', fetchImpl, timeoutMs: 15000 });
  const spcText = async (url) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new UpstreamError('Storm Prediction Center', res.status);
    return res.text();
  };
  const soft = (p) => p.catch(() => null);

  // ---- Chase Day ----------------------------------------------------------------
  app.get('/api/chaser/day', { schema: { querystring: { ...latLonSchema.querystring, required: [] } } }, async (req) => {
    const home = req.query.lat != null ? loc(req.query) : null;
    const now = Date.now();
    const day = convectiveDay(now);
    const layers = await cache.wrap('chaser:layers', 15 * MIN, async () => {
      const [cat, torn, hail, wind, text, day2] = await Promise.all([
        cache.wrap('spc:1', 15 * MIN, () => severe.getOutlook(1, fetchImpl)),
        soft(spcJson(SPC_PROB('torn'))), soft(spcJson(SPC_PROB('hail'))), soft(spcJson(SPC_PROB('wind'))),
        soft(spcText(SPC_TEXT)),
        soft(cache.wrap('spc:2', 15 * MIN, () => severe.getOutlook(2, fetchImpl))),
      ]);
      return { cat, torn, hail, wind, text, day2 };
    });
    return chaseDay({ ...layers, home, day, now });
  });

  // ---- storm reports (for the target game map and scoring) -------------------------
  const daySchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
  const getReports = (day) => {
    const now = Date.now();
    const live = day >= addDays(convectiveDay(now), -1);
    return cache.wrap(`chaser:reports:${day}`, live ? 5 * MIN : 12 * 60 * MIN, async () => {
      try {
        return parseReports(await spcText(reportsUrl(day, now)), day);
      } catch (e) {
        if (e.status === 404) return [];
        throw e;
      }
    });
  };
  const checkDay = (day, reply) => {
    if (day > convectiveDay()) {
      reply.code(400).send({ error: 'That day has not happened yet.' });
      return false;
    }
    return true;
  };

  app.get('/api/chaser/reports', { schema: { querystring: { type: 'object', properties: { day: daySchema } } } }, async (req, reply) => {
    const day = req.query.day || convectiveDay();
    if (!checkDay(day, reply)) return reply;
    const reports = await getReports(day);
    return { day, final: day < convectiveDay(), reports, source: 'NOAA Storm Prediction Center storm reports' };
  });

  app.get('/api/chaser/score', {
    schema: {
      querystring: {
        type: 'object', required: ['day', 'lat', 'lon'],
        properties: { day: daySchema, lat: { type: 'number', minimum: 15, maximum: 60 }, lon: { type: 'number', minimum: -135, maximum: -60 } },
      },
    },
  }, async (req, reply) => {
    const { day, lat, lon } = req.query;
    if (!checkDay(day, reply)) return reply;
    const reports = await getReports(day);
    return { day, final: day < convectiveDay(), ...scoreTarget({ lat, lon }, reports) };
  });

  // ---- storm cards ----------------------------------------------------------------
  app.get('/api/chaser/cards', { schema: { querystring: { type: 'object', properties: { day: daySchema } } } }, async (req, reply) => {
    let day = req.query.day || convectiveDay();
    if (!checkDay(day, reply)) return reply;
    let reports = await getReports(day);
    // Early in the morning today has no reports yet, so show yesterday's deck.
    if (!reports.length && !req.query.day) {
      day = addDays(day, -1);
      reports = await getReports(day).catch(() => []);
    }
    return { ...stormCards(reports, day), today: convectiveDay(), source: 'NOAA Storm Prediction Center storm reports' };
  });

  // ---- live chase streams -----------------------------------------------------------
  const list = db.prepare('SELECT id, title, kind, yt_id AS ytId, anytime, enabled, position FROM chase_streams ORDER BY position, id');
  const count = db.prepare('SELECT COUNT(*) AS n FROM chase_streams');
  const insert = db.prepare('INSERT INTO chase_streams (title, kind, yt_id, anytime, position) VALUES (?, ?, ?, ?, ?)');
  const patch = db.prepare('UPDATE chase_streams SET title = COALESCE(?, title), anytime = COALESCE(?, anytime), enabled = COALESCE(?, enabled), position = COALESCE(?, position) WHERE id = ?');
  const remove = db.prepare('DELETE FROM chase_streams WHERE id = ?');
  const rows = () => list.all().map((r) => ({ ...r, anytime: !!r.anytime, enabled: !!r.enabled }));

  const liveCheck = (s) => cache.wrap(`chaser:live:${s.kind}:${s.ytId}`, 3 * MIN, async () => {
    try {
      const url = s.kind === 'channel' ? `https://www.youtube.com/channel/${s.ytId}/live` : `https://www.youtube.com/watch?v=${s.ytId}`;
      const vid = liveVideoFrom(await fetchPage(url, fetchImpl));
      return { live: !!vid, videoId: vid || (s.kind === 'video' ? s.ytId : null) };
    } catch {
      return { live: null, videoId: s.kind === 'video' ? s.ytId : null };
    }
  });

  app.get('/api/chaser/live', async () => {
    const national = await soft(cache.wrap('alerts-national', 2 * MIN, () => severe.getNationalAlerts({ userAgent: nwsUserAgent, fetchImpl })));
    const warnings = national ? warningSummary(national) : { tornado: 0, severe: 0, active: false, states: [], unavailable: true };
    const enabled = rows().filter((s) => s.enabled);
    const show = enabled.filter((s) => warnings.active || s.anytime);
    const checked = await Promise.all(show.map(async (s) => ({ s, ...(await liveCheck(s)) })));
    const streams = checked
      .filter((x) => x.live === true || (x.live === null && x.videoId))
      .map(({ s, videoId, live }) => ({ id: s.id, title: s.title, videoId, confirmedLive: live === true }));
    return { warnings, streams, configured: enabled.length, checkedAt: new Date().toISOString() };
  });

  app.get('/api/admin/chase-streams', { preHandler: requireAdmin }, async () => ({ streams: rows() }));

  app.post('/api/admin/chase-streams', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', required: ['url'], properties: { url: { type: 'string', minLength: 3, maxLength: 300 }, title: { type: 'string', maxLength: 80 }, anytime: { type: 'boolean' } }, additionalProperties: false } },
  }, async (req, reply) => {
    if (count.get().n >= MAX_STREAMS) return reply.code(409).send({ error: `That's ${MAX_STREAMS} streams already. Remove one first.` });
    const { url, anytime = false } = req.body;
    let title = (req.body.title || '').trim();
    let kind;
    let ytId;
    try {
      const ref = parseYoutubeRef(url);
      if (ref?.type === 'video') {
        kind = 'video';
        ytId = ref.id;
        if (!title) title = (await loadYoutubeVideo(ref.id, fetchImpl).catch(() => null))?.author || 'Live chase';
      } else if (ref?.type === 'playlist') {
        return reply.code(400).send({ error: 'Use a channel or a single live video, not a playlist.' });
      } else {
        kind = 'channel';
        ytId = await resolveYoutubeChannel(url, fetchImpl);
        if (!title) title = String(url).match(/@[\w.-]+/)?.[0] || 'Storm chaser';
      }
    } catch (e) {
      return reply.code(400).send({ error: e.message || 'Could not find that YouTube channel or video.' });
    }
    const r = insert.run(title.slice(0, 80), kind, ytId, anytime ? 1 : 0, count.get().n);
    return { stream: rows().find((s) => s.id === Number(r.lastInsertRowid)) };
  });

  app.patch('/api/admin/chase-streams/:id', {
    preHandler: requireAdmin,
    schema: { body: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 80 }, anytime: { type: 'boolean' }, enabled: { type: 'boolean' }, position: { type: 'integer', minimum: 0, maximum: 1000 } }, additionalProperties: false } },
  }, async (req, reply) => {
    const b = req.body;
    const bool = (v) => (v === undefined ? null : v ? 1 : 0);
    const r = patch.run(b.title ?? null, bool(b.anytime), bool(b.enabled), b.position ?? null, Number(req.params.id));
    return r.changes ? { ok: true } : reply.code(404).send({ error: 'No such stream.' });
  });

  app.delete('/api/admin/chase-streams/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const r = remove.run(Number(req.params.id));
    return r.changes ? { ok: true } : reply.code(404).send({ error: 'No such stream.' });
  });
}
