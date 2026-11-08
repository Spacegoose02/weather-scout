// Hurricane impacts for a place: the National Hurricane Center's wind speed
// probabilities (the chance of tropical-storm-force, 58 mph and hurricane-force
// winds at each coastal town over 5 days) and the peak storm surge expected
// along each stretch of coast, read from the storm's public advisory.
// Both come from NHC text products linked in CurrentStorms.json; no key.
import { UpstreamError } from './cache.js';
import { geocode } from './providers/openmeteo.js';
import { milesBetween } from './providers/tropics.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NHC = /^https:\/\/www\.nhc\.noaa\.gov\//;
export const NEAR_STORM_MILES = 1500;
export const NEAR_TOWN_MILES = 60;

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

// NHC pages wrap the product in HTML; keep the text.
export function productText(html) {
  const pre = String(html).match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  return (pre ? pre[1] : String(html)).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\r/g, '');
}

// "Anclote River to Englewood, including Tampa Bay...10-15 ft" lines from the
// STORM SURGE section of a public advisory.
export function parseSurge(text) {
  const t = String(text);
  const start = t.search(/^STORM SURGE:/m);
  if (start < 0) return [];
  const rest = t.slice(start);
  const end = rest.slice(12).search(/\n\s*\n[A-Z][A-Z ]{2,}:/);
  const section = end < 0 ? rest : rest.slice(0, end + 12);
  const intro = section.search(/high tide\.\.\./i);
  const body = (intro >= 0 ? section.slice(intro + 'high tide...'.length) : section).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const para of body) {
    for (const piece of para.split(/(?<=\bft)\s+/)) {
      const m = piece.match(/^(.+?)\.\.\.(\d+)(?:-(\d+))?\s*ft$/i);
      if (!m || m[1].length > 140) continue;
      out.push({ area: m[1].trim(), low: Number(m[2]), high: Number(m[3] || m[2]) });
    }
  }
  return out.sort((a, b) => b.high - a.high);
}

const pct = (v) => (v === 'X' || v == null ? 0 : Number(v));

// Rows of the Wind Speed Probabilities product ("PWS"): each town's 5-day
// cumulative chance of 34, 50 and 64 kt winds (39, 58 and 74 mph).
export function parseWindOdds(text) {
  const rows = new Map();
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9 .'/()-]*?[A-Z0-9.)])\s{2,}(34|50|64)\s+((?:\s*(?:X|\d+)(?:\(\s*(?:X|\d+)\))?)+)\s*$/);
    if (!m) continue;
    const vals = [...m[3].matchAll(/(X|\d+)(?:\(\s*(X|\d+)\))?/g)];
    const cum = vals.filter((v) => v[2] != null);
    const total = cum.length ? pct(cum.at(-1)[2]) : pct(vals[0]?.[1]);
    const name = m[1].trim();
    const r = rows.get(name) || { name, p34: 0, p50: 0, p64: 0 };
    r[`p${m[2]}`] = total;
    rows.set(name, r);
  }
  return [...rows.values()];
}

// "FT PIERCE FL" -> { query: 'Fort Pierce', state: 'Florida' }
export function townQuery(name) {
  const words = name.split(/\s+/);
  const st = STATES[words.at(-1)] ? words.pop() : null;
  const expand = { FT: 'Fort', PT: 'Point', MT: 'Mount', ST: 'St.', CP: 'Cape', IS: 'Island', BCH: 'Beach' };
  const q = words.map((w) => expand[w] || (w.length <= 2 && /^[A-Z]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ');
  return { query: q, state: st ? STATES[st] : null };
}

export class HurricaneImpacts {
  constructor(cache, fetchImpl, { storms, log = console } = {}) {
    Object.assign(this, { cache, fetchImpl, storms, log });
  }

  async text(url) {
    if (!url || !NHC.test(url)) return null;
    return this.cache.wrap(`nhctext:${url}`, 20 * MIN, async () => {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new UpstreamError('National Hurricane Center', res.status);
      return productText(await res.text());
    });
  }

  // Where a PWS town is. Cached a month; unknown towns are cached as null.
  async locate(name) {
    return this.cache.wrap(`pwsgeo:${name}`, 30 * DAY, async () => {
      const { query, state } = townQuery(name);
      const hits = await geocode(query, this.fetchImpl).catch(() => []);
      const hit = state ? hits.find((h) => h.country === 'US' && h.name.includes(state)) : hits[0];
      return hit ? { lat: hit.lat, lon: hit.lon } : null;
    });
  }

  async forStorm(storm, place) {
    const soft = (p) => p.catch((err) => { this.log.warn?.({ err: err.message, storm: storm.id }, 'hurricane text failed'); return null; });
    const [adv, pws] = await Promise.all([soft(this.text(storm.advisoryUrl)), soft(this.text(storm.windOddsUrl))]);
    const surge = adv ? parseSurge(adv) : [];
    const odds = pws ? parseWindOdds(pws).filter((r) => r.p34 > 0).sort((a, b) => b.p34 - a.p34) : [];
    // Find the closest listed town to the place (only towns with any chance, at most 60 geocodes).
    let near = null;
    for (const r of odds.slice(0, 60)) {
      const at = await this.locate(r.name);
      if (!at) continue;
      const miles = Math.round(milesBetween(place, at));
      if (miles <= NEAR_TOWN_MILES && (!near || miles < near.miles)) near = { ...r, miles };
    }
    return { surge: surge.slice(0, 12), wind: { near, top: odds.slice(0, 8) } };
  }

  async near(place) {
    const all = (await this.storms())?.storms || [];
    const close = all.map((s) => ({ ...s, miles: Math.round(milesBetween(place, s)) })).filter((s) => s.miles <= NEAR_STORM_MILES).sort((a, b) => a.miles - b.miles).slice(0, 3);
    return Promise.all(close.map(async (s) => ({ id: s.id, name: s.name, kind: s.kind, category: s.category, miles: s.miles, advisoryUrl: s.advisoryUrl, ...(await this.forStorm(s, place)) })));
  }
}

export function registerHurricane(app, { impacts, latLonSchema, loc }) {
  app.get('/api/tropics/impacts', { schema: latLonSchema }, async (req) => ({
    storms: await impacts.near(loc(req.query)),
    source: 'National Hurricane Center wind speed probabilities and public advisories',
  }));
}

// Words for a wind chance, for the card.
export const WIND_LEVELS = [
  { key: 'p34', mph: 39, label: 'Tropical-storm-force winds (39+ mph)' },
  { key: 'p50', mph: 58, label: 'Damaging winds (58+ mph)' },
  { key: 'p64', mph: 74, label: 'Hurricane-force winds (74+ mph)' },
];
