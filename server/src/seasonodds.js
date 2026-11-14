// Season odds: fun, record-book odds for the cold season at a place.
// - the chance of a white Christmas (1 inch or more of snow on the ground on Dec 25)
// - when the first fall freeze, the first inch of snow and the last spring freeze usually come
// - whether they have already happened this season (US stations), and how often by today's date
// From the nearest NOAA ThreadEx city station in the US (ACIS), or the Open-Meteo
// ERA5 archive elsewhere. Uses the last 30 complete seasons.
import * as history from './providers/history.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SEASONS = 30;
const FREEZE_F = 32;
const SNOW_IN = 1;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, n) => iso(Date.parse(`${date}T00:00:00Z`) + n * DAY);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const dateWords = (md) => `${MONTHS[Number(md.slice(0, 2)) - 1]} ${Number(md.slice(3))}`;

// Cold seasons run July 1 to June 30 north of the equator (January to December south of it).
export const seasonStart = (year, south) => (south ? `${year}-01-01` : `${year}-07-01`);
// A position in the season -> "MM-DD", using a reference season so leap days don't shift it.
const mdOf = (pos, south) => addDays(seasonStart(south ? 2001 : 2001, south), pos).slice(5);

// One season's dates: first freeze, first 1-inch snowfall, last spring freeze, and Christmas snow.
export function seasonFacts(rows, year, south = false) {
  const start = seasonStart(year, south);
  const end = addDays(seasonStart(year + 1, south), -1);
  const days = rows.filter((r) => r.date >= start && r.date <= end);
  const withLow = days.filter((r) => r.low != null);
  const complete = withLow.length >= 0.8 * 365;
  const pos = (r) => daysBetween(start, r.date);
  const firstFreeze = days.find((r) => r.low != null && r.low <= FREEZE_F);
  const firstSnow = days.find((r) => r.snow != null && r.snow >= SNOW_IN);
  // Last spring freeze: the last freeze before the warm season (Jan-Jun of the calendar year it ends, north).
  const springEnd = south ? null : `${year + 1}-06-30`;
  const spring = south ? [] : days.filter((r) => r.date >= `${year + 1}-01-01` && r.date <= springEnd && r.low != null && r.low <= FREEZE_F);
  const xmas = south ? null : rows.find((r) => r.date === `${year}-12-25`);
  const xmasEve = south ? null : rows.find((r) => r.date === `${year}-12-24`);
  let white = null;
  if (xmas?.depth != null) white = xmas.depth >= 1;
  else if (xmas && xmas.snow != null) white = (xmas.snow || 0) + (xmasEve?.snow || 0) >= 0.5; // archive: no depth, use snowfall
  return {
    year, complete,
    firstFreeze: firstFreeze ? pos(firstFreeze) : null,
    firstSnow: firstSnow ? pos(firstSnow) : null,
    lastFreeze: spring.length ? pos(spring.at(-1)) : null,
    white,
    whiteFrom: xmas?.depth != null ? 'depth' : 'snowfall',
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

// Odds for one kind of date: { typical, earliest, latest, everyYear%, byToday% }.
export function dateOdds(seasons, key, todayPos, south) {
  const valid = seasons.filter((s) => s.complete);
  if (valid.length < 15) return null;
  const hits = valid.filter((s) => s[key] != null).map((s) => s[key]);
  const pct = (n) => Math.round((n / valid.length) * 100);
  return {
    seasons: valid.length,
    happens: pct(hits.length),
    typical: hits.length * 2 >= valid.length ? dateWords(mdOf(median(hits), south)) : null,
    earliest: hits.length ? dateWords(mdOf(Math.min(...hits), south)) : null,
    latest: hits.length ? dateWords(mdOf(Math.max(...hits), south)) : null,
    byToday: todayPos == null ? null : pct(hits.filter((p) => p <= todayPos).length),
  };
}

// The whole card from daily rows (°F, inches) and today's local date.
export function seasonOdds(rows, { today, south = false, lastComplete, source }) {
  const seasons = [];
  for (let y = lastComplete - SEASONS + 1; y <= lastComplete; y++) seasons.push(seasonFacts(rows, y, south));
  const curYear = south ? Number(today.slice(0, 4)) : (today.slice(5) >= '07-01' ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1);
  const todayPos = daysBetween(seasonStart(curYear, south), today);
  const current = seasonFacts(rows, curYear, south);
  const seen = rows.some((r) => r.date >= addDays(today, -3) && r.date < today && r.low != null); // this season's data is live
  const xmasSeasons = seasons.filter((s) => s.white != null);
  const white = !south && xmasSeasons.length >= 15 ? {
    chance: Math.round((xmasSeasons.filter((s) => s.white).length / xmasSeasons.length) * 100),
    seasons: xmasSeasons.length,
    lastWhite: [...xmasSeasons].reverse().find((s) => s.white)?.year ?? null,
    measure: xmasSeasons.every((s) => s.whiteFrom === 'depth') ? 'depth' : 'snowfall',
  } : null;
  const so = (key) => {
    const odds = dateOdds(seasons, key, todayPos, south);
    if (!odds) return null;
    // Already happened this season? (Only when the data reaches the last few days.)
    const at = seen ? current[key] : null;
    return { ...odds, thisSeason: at != null && at <= todayPos ? dateWords(mdOf(at, south)) : null, known: seen };
  };
  return {
    today,
    seasons: `${lastComplete - SEASONS + 1}–${lastComplete + (south ? 0 : 1)}`,
    white,
    firstFreeze: so('firstFreeze'),
    firstSnow: so('firstSnow'),
    lastFreeze: south ? null : so('lastFreeze'),
    source,
  };
}

// "1 in 4 years" style words for kids.
export function oneIn(pct) {
  if (pct == null) return '';
  if (pct >= 95) return 'almost every year';
  if (pct <= 2) return 'hardly ever';
  const n = Math.round(100 / pct);
  return n <= 1 ? 'most years' : `about 1 year in ${n}`;
}

export function registerSeasonOdds(app, { cache, fetchImpl, latLonSchema, loc, forecast, settle }) {
  app.get('/api/history/season', { schema: latLonSchema }, async (req) => {
    const l = loc(req.query);
    const fc = await settle(forecast(l));
    const today = fc?.daily?.[0]?.time || iso(Date.now() + (fc?.utcOffsetSeconds || 0) * 1000);
    const south = l.lat < 0;
    const thisYear = Number(today.slice(0, 4));
    const lastYear = thisYear - 1;
    return cache.wrap(`season:${l.lat},${l.lon}:${today}`, 6 * 60 * MIN, async () => {
      // US: the city's official record, through yesterday, so "already happened" works.
      const firstYear = lastYear - SEASONS - 1;
      const official = await settle(cache.wrap(`season-acis:${l.lat},${l.lon}:${today}`, DAY, () => history.getOfficialSeries(l, `${firstYear}-01-01`, addDays(today, -1), fetchImpl)));
      let rows;
      let source;
      if (official) {
        rows = official.rows;
        source = `NOAA ACIS (${official.station.name})`;
      } else {
        const near = { lat: Math.round(l.lat * 10) / 10, lon: Math.round(l.lon * 10) / 10 };
        const archive = await cache.wrap(`hist-arc:${near.lat},${near.lon}:${lastYear}`, 7 * DAY, () => history.getArchive(near, fetchImpl, { lastYear }));
        rows = history.archiveRows(archive);
        source = 'Open-Meteo Historical (ERA5 reanalysis)';
      }
      // The last season with a full record: the archive ends Dec 31 last year.
      const lastData = rows.at(-1)?.date || `${lastYear}-12-31`;
      const lastComplete = south ? Number(lastData.slice(0, 4)) - (lastData.slice(5) >= '12-31' ? 0 : 1) : Number(lastData.slice(0, 4)) - (lastData.slice(5) >= '06-30' ? 1 : 2);
      const odds = seasonOdds(rows, { today, south, lastComplete, source });
      if (!odds.firstFreeze && !odds.white && !odds.firstSnow) {
        const err = new Error('Not enough history for this place yet.');
        err.statusCode = 404;
        throw err;
      }
      // The next freeze in the forecast, if one is coming.
      const freezeAt = l.units === 'metric' ? 0 : 32;
      const nextFreeze = (fc?.daily || []).find((d) => d.low != null && d.low <= freezeAt);
      const snowSoon = (fc?.daily || []).find((d) => (d.snowTotal || 0) >= (l.units === 'metric' ? 2.5 : 1));
      return { ...odds, forecast: { nextFreeze: nextFreeze ? nextFreeze.time : null, nextSnow: snowSoon ? snowSoon.time : null } };
    });
  });
}
