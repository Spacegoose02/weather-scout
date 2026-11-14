// Across the US: the whole country on one screen.
// - severe storm risk (SPC) and flash flood risk (WPC) today and tomorrow, with the states under each level
// - every active NWS warning, ranked by how dangerous it is
// - the day's biggest storm reports
// - the storm week ahead: the highest SPC risk for each of the next 8 days, and at your place
// All public NOAA data, mostly already cached for other cards.
import * as severe from './providers/severe.js';
import { ERO_LEVELS, eroLevel } from '../../shared/hazards.js';
import { CAT_ORDER, CAT_NAME, catLevel, inGeometry, outlookSummary } from '../../shared/outlook.js';
import { statesIn, stormReports, stormCards, convectiveDay, addDays, STATE_NAME } from './chaser.js';

const MIN = 60_000;
const MAX_WARNINGS = 40;

// The states under each level of an outlook, highest level first: [{ level, name, states }].
export function statesByLevel(features, levelOf, nameOf) {
  const byLevel = new Map();
  for (const f of features || []) {
    const lvl = levelOf(f.properties);
    if (!lvl || !f.geometry) continue;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(f.geometry);
  }
  return [...byLevel.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([level, geoms]) => ({ level, name: nameOf(level), states: statesIn(geoms, { share: 0.05 }).slice(0, 8) }));
}

// SPC categorical outlook -> { top, here, levels } (level 1 = marginal ... 5 = high).
export function severeSummary(outlook, home) {
  const sum = outlookSummary(outlook, home);
  const levels = statesByLevel(outlook?.features, (p) => catLevel(p.label) || null, (l) => `${CAT_NAME[CAT_ORDER[l]]} (${l} of 5)`);
  return { top: sum.top, topLevel: catLevel(sum.top), here: sum.here, hereLevel: sum.here ? catLevel(sum.here) : null, levels };
}

// WPC excessive rainfall outlook -> the same shape (1 = marginal ... 4 = high).
export function floodSummary(ero, home) {
  let top = ERO_LEVELS[0];
  let here = ERO_LEVELS[0];
  for (const f of ero?.features || []) {
    const lvl = eroLevel(f.properties);
    if (!lvl || !f.geometry) continue;
    if (lvl.rank > top.rank) top = lvl;
    if (home && lvl.rank > here.rank && inGeometry(f.geometry, home.lat, home.lon)) here = lvl;
  }
  const levels = statesByLevel(ero?.features, (p) => eroLevel(p)?.rank || null, (r) => `${ERO_LEVELS[r].label} (${r} of 4)`);
  return { top: top.id, topLabel: top.label, topLevel: top.rank, here: home ? here.id : null, hereLevel: home ? here.rank : null, levels };
}

const STATE_ABBR = /,\s*([A-Z]{2})\b|^([A-Z]{2})$/g;
export function statesOfArea(area) {
  const out = new Set();
  for (const m of String(area || '').matchAll(STATE_ABBR)) {
    const ab = m[1] || m[2];
    if (STATE_NAME[ab]) out.add(ab);
  }
  return [...out];
}

// "Tornado Emergency" and "particularly dangerous situation" wording moves a warning to the top.
export function dangerBoost(p) {
  const text = `${p.headline || ''} ${p.event || ''}`;
  if (/tornado emergency|flash flood emergency/i.test(text)) return 20;
  if (/particularly dangerous situation|\bPDS\b|destructive/i.test(text)) return 8;
  if (/observed|confirmed/i.test(text)) return 4;
  return 0;
}

// Active warnings only (not watches or advisories), most dangerous first, then newest.
export function rankedWarnings(national, { max = MAX_WARNINGS } = {}) {
  const list = [];
  for (const f of national?.features || []) {
    const p = f.properties || {};
    if (!/warning|emergency/i.test(p.event || '')) continue;
    list.push({
      id: p.id,
      event: p.event,
      headline: p.headline,
      area: p.area,
      states: statesOfArea(p.area),
      ends: p.ends,
      color: p.color,
      kid: p.kid,
      score: (p.rank || 0) + dangerBoost(p),
      emergency: /emergency/i.test(`${p.event} ${p.headline}`),
    });
  }
  list.sort((a, b) => b.score - a.score || String(b.ends || '').localeCompare(String(a.ends || '')));
  const byEvent = {};
  for (const w of list) byEvent[w.event] = (byEvent[w.event] || 0) + 1;
  const kinds = Object.entries(byEvent).sort((a, b) => b[1] - a[1]).map(([event, count]) => ({ event, count, color: list.find((w) => w.event === event)?.color }));
  return { total: list.length, kinds, top: list.slice(0, max).map(({ score, ...w }) => w) };
}

// The storm week ahead: one entry per SPC day 1-8 with the highest risk anywhere and at home.
export function weekAhead({ cats, probs, home, now = Date.now() }) {
  const today = convectiveDay(now);
  const days = [];
  for (let d = 1; d <= 3; d++) {
    const o = cats[d];
    const s = o ? outlookSummary(o, home) : null;
    days.push({
      day: d, date: addDays(today, d - 1), kind: 'category', available: !!o,
      top: s?.top ?? null, topLevel: s ? catLevel(s.top) : null,
      here: s?.here ?? null, hereLevel: s?.here ? catLevel(s.here) : (home && s ? 0 : null),
      states: o ? statesIn(o.features.filter((f) => catLevel(f.properties.label) >= 2).map((f) => f.geometry), { share: 0.08 }).slice(0, 5) : [],
    });
  }
  for (const d of severe.EXTENDED_DAYS) {
    const o = probs[d];
    let top = 0;
    let here = 0;
    for (const f of o?.features || []) {
      top = Math.max(top, f.properties.chance);
      if (home && inGeometry(f.geometry, home.lat, home.lon)) here = Math.max(here, f.properties.chance);
    }
    days.push({
      day: d, date: addDays(today, d - 1), kind: 'chance', available: !!o,
      top: o ? top : null, here: o && home ? here : null,
      states: o ? statesIn(o.features.map((f) => f.geometry), { share: 0.08 }).slice(0, 5) : [],
    });
  }
  // The day to watch: the biggest risk at home, else anywhere (category 2+ or any 15% area).
  const score = (x) => (x.kind === 'category' ? (x.topLevel || 0) * 10 : x.top >= 30 ? 30 : x.top >= 15 ? 20 : 0);
  const watch = days.filter((x) => score(x) >= 20).sort((a, b) => score(b) - score(a) || a.day - b.day)[0] || null;
  return { today, days, watch: watch ? watch.day : null };
}

export function registerNational(app, { cache, fetchImpl, hazards, nwsUserAgent, latLonSchema, loc, settle }) {
  const catOutlook = (d) => cache.wrap(`spc:${d}`, 15 * MIN, () => severe.getOutlook(d, fetchImpl));
  const extOutlook = (d) => cache.wrap(`spc-ext:${d}`, 60 * MIN, () => severe.getExtendedOutlook(d, fetchImpl));
  const optionalHome = { querystring: { ...latLonSchema.querystring, required: [] } };
  const homeOf = (q) => (q.lat != null && q.lon != null ? loc(q) : null);

  app.get('/api/national', { schema: optionalHome }, async (req) => {
    const home = homeOf(req.query);
    const day = convectiveDay();
    const [spc1, spc2, ero1, ero2, national, reports] = await Promise.all([
      settle(catOutlook(1)), settle(catOutlook(2)), hazards.ero(1), hazards.ero(2),
      settle(cache.wrap('alerts-national', 2 * MIN, () => severe.getNationalAlerts({ userAgent: nwsUserAgent, fetchImpl }))),
      settle(stormReports({ cache, fetchImpl }, day)),
    ]);
    const deck = reports ? stormCards(reports, day, { max: 10 }) : null;
    return {
      day,
      severe: { today: spc1 ? severeSummary(spc1, home) : null, tomorrow: spc2 ? severeSummary(spc2, home) : null },
      flood: { today: ero1 ? floodSummary(ero1, home) : null, tomorrow: ero2 ? floodSummary(ero2, home) : null },
      warnings: national ? { ...rankedWarnings(national), counts: national.counts } : null,
      reports: deck ? { counts: deck.counts, top: deck.cards } : null,
      outlook: spc1 || null,
      reportPoints: reports ? reports.map(({ type, lat, lon, location, state, time }) => ({ type, lat, lon, location, state, time })) : null,
      checkedAt: new Date().toISOString(),
      sources: ['NOAA Storm Prediction Center', 'NOAA Weather Prediction Center', 'National Weather Service'],
    };
  });

  app.get('/api/outlook/week', { schema: optionalHome }, async (req) => {
    const home = homeOf(req.query);
    const [c1, c2, c3, ...ext] = await Promise.all([
      settle(catOutlook(1)), settle(catOutlook(2)), settle(catOutlook(3)),
      ...severe.EXTENDED_DAYS.map((d) => settle(extOutlook(d))),
    ]);
    const probs = Object.fromEntries(severe.EXTENDED_DAYS.map((d, i) => [d, ext[i]]));
    return { ...weekAhead({ cats: { 1: c1, 2: c2, 3: c3 }, probs, home }), source: 'NOAA Storm Prediction Center' };
  });

  // One Day 4-8 map, for the outlook card's map.
  app.get('/api/outlook/extended', {
    schema: { querystring: { type: 'object', required: ['day'], properties: { day: { type: 'integer', minimum: 4, maximum: 8 } } } },
  }, async (req) => extOutlook(req.query.day));
}
