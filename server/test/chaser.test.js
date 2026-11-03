import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chaseDay, convectiveDay, parseReports, parseSpcText, scoreTarget, stormCards, warningSummary, liveVideoFrom,
  inGeometry, statesIn, reportsUrl, hailLike, probSummary,
} from '../src/chaser.js';
import { mockFetch, testApp, cookieFrom } from './helpers.js';

// A box over central Oklahoma and southern Kansas.
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const OK_BOX = box(-99.5, 34.5, -95.5, 38.5);
const BIG_BOX = box(-104, 30, -88, 42);
const cat = { features: [
  { properties: { label: 'TSTM' }, geometry: BIG_BOX },
  { properties: { label: 'SLGT' }, geometry: box(-101, 33, -94, 40) },
  { properties: { label: 'ENH' }, geometry: OK_BOX },
] };
const torn = { features: [
  { properties: { LABEL: '0.05' }, geometry: box(-101, 33, -94, 40) },
  { properties: { LABEL: '0.10' }, geometry: OK_BOX },
  { properties: { LABEL: 'SIGN' }, geometry: OK_BOX },
] };
const TEXT = `SPC AC 021630

Day 1 Convective Outlook
VALID 021630Z - 031200Z

...THERE IS AN ENHANCED RISK OF SEVERE THUNDERSTORMS ACROSS PARTS OF OKLAHOMA...

...SUMMARY...
Severe thunderstorms with large hail, damaging winds and a few
tornadoes are expected across the southern Plains this afternoon.

...Southern Plains...
Rich Gulf moisture with dewpoints in the upper 60s will spread north
ahead of a dryline. Strong instability and deep-layer shear will
support supercells.
`;

test('point in polygon and naming the states in an area', () => {
  assert.equal(inGeometry(OK_BOX, 35.5, -97.5), true);
  assert.equal(inGeometry(OK_BOX, 40, -80), false);
  assert.equal(inGeometry({ type: 'MultiPolygon', coordinates: [OK_BOX.coordinates] }, 35.5, -97.5), true);
  assert.deepEqual(statesIn([OK_BOX]).sort(), ['Kansas', 'Oklahoma']);
  // Too small to hold a state's middle: the nearest state is used.
  assert.deepEqual(statesIn([box(-92.6, 38.3, -92.4, 38.5)]), ['Missouri']);
});

test('SPC discussion: summary, ingredients and hazards', () => {
  const p = parseSpcText(TEXT);
  assert.match(p.summary, /^Severe thunderstorms with large hail/);
  assert.deepEqual(p.ingredients.map((i) => i.id), ['moisture', 'instability', 'lift', 'shear']);
  assert.ok(p.hazards.some((h) => h.id === 'tornado'));
  assert.ok(p.hazards.some((h) => h.id === 'supercell'));
});

test('probabilities: max, hatched areas and the value at home', () => {
  const t = probSummary(torn, { lat: 35.5, lon: -97.5 });
  assert.equal(t.max, 10);
  assert.equal(t.sig, true);
  assert.equal(t.atHome, 10);
  assert.equal(probSummary(null).max, 0);
});

test('chase day: rating, where, tomorrow and a calm note at home', () => {
  const now = Date.parse('2026-05-02T15:00:00Z');
  const d = chaseDay({ cat, torn, text: TEXT, home: { lat: 35.5, lon: -97.5 }, day: '2026-05-02', now, day2: { features: [{ properties: { label: 'MRGL' }, geometry: OK_BOX }] } });
  assert.equal(d.rating, 'chase');
  assert.equal(d.category, 'ENH');
  assert.deepEqual(d.where.sort(), ['Kansas', 'Oklahoma']);
  assert.match(d.say, /chase day/);
  assert.match(d.why.join(' '), /tornado chance tops out at 10%/);
  assert.equal(d.home.category, 'ENH');
  assert.match(d.home.text, /safe spot/);
  assert.match(d.tomorrow.text, /Marginal/);
  assert.equal(d.picksOpen, true);
  assert.equal(chaseDay({ cat, torn, day: '2026-05-02', now: Date.parse('2026-05-02T21:00:00Z') }).picksOpen, false);

  const quiet = chaseDay({ cat: { features: [] }, day: '2026-01-10', home: { lat: 40, lon: -80 } });
  assert.equal(quiet.rating, 'down');
  assert.match(quiet.headline, /down day/);
  assert.match(quiet.home.text, /No severe storms/);

  const big = chaseDay({ cat: { features: [{ properties: { label: 'MDT' }, geometry: OK_BOX }] }, day: '2026-05-02' });
  assert.equal(big.rating, 'big');
});

test('convective day runs 12Z to 12Z', () => {
  assert.equal(convectiveDay(Date.parse('2026-05-03T03:00:00Z')), '2026-05-02');
  assert.equal(convectiveDay(Date.parse('2026-05-03T13:00:00Z')), '2026-05-03');
  const now = Date.parse('2026-05-03T13:00:00Z');
  assert.match(reportsUrl('2026-05-03', now), /today_filtered/);
  assert.match(reportsUrl('2026-05-02', now), /yesterday_filtered/);
  assert.match(reportsUrl('2026-04-27', now), /260427_rpts_filtered\.csv$/);
});

export const CSV = `Time,F_Scale,Location,County,State,Lat,Lon,Comments
2215,EF2,3 W Norman,Cleveland,OK,35.22,-97.50,Tornado crossed I-35. Two injuries reported. (OUN)
0130,UNK,Enid,Garfield,OK,36.40,-97.88,Brief touchdown. (OUN)
Time,Speed,Location,County,State,Lat,Lon,Comments
2100,UNK,Wichita,Sedgwick,KS,37.69,-97.34,Trees down. (ICT)
2130,81,Hays,Ellis,KS,38.88,-99.33,Measured gust. (DDC)
Time,Size,Location,County,State,Lat,Lon,Comments
2000,275,Lawton,Comanche,OK,34.60,-98.40,Baseball hail, with, commas. (OUN)
2010,100,Lawton,Comanche,OK,34.61,-98.41,(OUN)
2020,UNK,Nowhere,Nope,OK,34.6,-98.4,(OUN)
`;

test('storm reports: three sections, UTC times, no comments', () => {
  const r = parseReports(CSV, '2026-05-02');
  assert.equal(r.length, 6);
  const t = r.filter((x) => x.type === 'tornado');
  assert.equal(t[0].magnitude, 2);
  assert.equal(t[0].time, '2026-05-02T22:15:00Z');
  assert.equal(t[1].time, '2026-05-03T01:30:00Z');
  assert.equal(t[1].magnitude, null);
  assert.equal(r.find((x) => x.location === 'Hays').magnitude, 81);
  assert.equal(r.find((x) => x.type === 'hail').magnitude, 2.75);
  assert.ok(r.every((x) => !('comments' in x)));
  assert.ok(!JSON.stringify(r).includes('injur'));
});

test('target scoring: closer is better, tornadoes nearby add points', () => {
  const reports = parseReports(CSV, '2026-05-02');
  const close = scoreTarget({ lat: 35.3, lon: -97.5 }, reports);
  assert.equal(close.nearest.location, '3 W Norman');
  assert.ok(close.miles < 10);
  assert.equal(close.points, 13);
  const far = scoreTarget({ lat: 41, lon: -75 }, reports);
  assert.equal(far.points, 0);
  assert.equal(scoreTarget({ lat: 35, lon: -97 }, []).points, 0);
});

test('storm cards: one per storm kind per county, rarest first', () => {
  const deck = stormCards(parseReports(CSV, '2026-05-02'), '2026-05-02');
  assert.deepEqual(deck.counts, { tornado: 2, hail: 2, wind: 2 });
  assert.equal(deck.cards[0].stormOfTheDay, true);
  assert.equal(deck.cards[0].type, 'tornado');
  assert.equal(deck.cards[0].rarity, 'legendary');
  assert.equal(deck.cards.filter((c) => c.type === 'hail').length, 1);
  const hail = deck.cards.find((c) => c.type === 'hail');
  assert.match(hail.stat, /baseball/);
  assert.equal(new Set(deck.cards.map((c) => c.id)).size, deck.cards.length);
  assert.equal(hailLike(1.75), 'a golf ball');
});

test('warnings and live YouTube detection', () => {
  const w = warningSummary({ features: [
    { properties: { event: 'Tornado Warning', area: 'Cleveland, OK; McClain, OK' } },
    { properties: { event: 'Severe Thunderstorm Warning', area: 'Sedgwick, KS' } },
    { properties: { event: 'Flood Warning', area: 'Somewhere, TX' } },
  ] });
  assert.equal(w.tornado, 1);
  assert.equal(w.severe, 1);
  assert.equal(w.active, true);
  assert.deepEqual(w.states.sort(), ['Kansas', 'Oklahoma']);
  assert.equal(liveVideoFrom('<link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk">"isLiveNow":true'), 'abcdefghijk');
  assert.equal(liveVideoFrom('<link rel="canonical" href="https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx">'), null);
});

const CHANNEL = 'UCabcdefghijklmnopqrstuv';
function chaserFetch({ live = true, warnings = true } = {}) {
  const json = (b) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
  return mockFetch({
    'day1otlk_cat': () => json({ features: [{ properties: { LABEL: 'ENH', fill: '#ffa500', stroke: '#ff0000' }, geometry: OK_BOX }] }),
    'day2otlk_cat': () => json({ features: [] }),
    'day1otlk_torn': () => json(torn),
    'day1otlk_hail': () => json({ features: [] }),
    'day1otlk_wind': () => json({ features: [] }),
    'SWODY1': () => new Response(TEXT),
    '_filtered.csv': () => new Response(CSV),
    'alerts/active': () => json({ features: warnings ? [{ properties: { id: 'w', event: 'Tornado Warning', areaDesc: 'Cleveland, OK' }, geometry: OK_BOX }] : [] }),
    [`channel/${CHANNEL}/live`]: () => new Response(live ? '<link rel="canonical" href="https://www.youtube.com/watch?v=LIVEvideo01">"isLiveNow":true' : '<html>offline</html>'),
    '@stormkid': () => new Response(`<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}">`),
  });
}

test('chaser API: day, reports, score and cards', async () => {
  const { app } = await testApp({ fetchImpl: chaserFetch() });
  const day = (await app.inject({ url: '/api/chaser/day?lat=35.5&lon=-97.5' })).json();
  assert.equal(day.category, 'ENH');
  assert.equal(day.home.category, 'ENH');
  assert.ok(day.ingredients.length >= 3);
  assert.equal((await app.inject({ url: '/api/chaser/day' })).json().home, null);

  const rep = (await app.inject({ url: '/api/chaser/reports' })).json();
  assert.equal(rep.reports.length, 6);
  const score = (await app.inject({ url: `/api/chaser/score?day=${rep.day}&lat=35.3&lon=-97.5` })).json();
  assert.equal(score.points, 13);
  assert.equal((await app.inject({ url: '/api/chaser/score?day=2999-01-01&lat=35&lon=-97' })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/chaser/score?day=2026-01-01&lat=10&lon=-97' })).statusCode, 400);

  const cards = (await app.inject({ url: '/api/chaser/cards' })).json();
  assert.equal(cards.cards[0].stormOfTheDay, true);
  await app.close();
});

async function admin(app) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  return cookieFrom(res);
}

test('live chase streams: admin-only, shown when live during warnings', async () => {
  const fetchImpl = chaserFetch();
  const { app } = await testApp({ fetchImpl });
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/chase-streams', payload: { url: '@stormkid' } })).statusCode, 401);
  const cookie = await admin(app);
  const add = await app.inject({ method: 'POST', url: '/api/admin/chase-streams', headers: { cookie }, payload: { url: 'https://www.youtube.com/@stormkid', title: 'Storm Kid' } });
  assert.equal(add.statusCode, 200, add.body);
  assert.equal(add.json().stream.kind, 'channel');
  const bad = await app.inject({ method: 'POST', url: '/api/admin/chase-streams', headers: { cookie }, payload: { url: 'https://www.youtube.com/playlist?list=PLabcdefghijklmnop' } });
  assert.equal(bad.statusCode, 400);

  const live = (await app.inject({ url: '/api/chaser/live' })).json();
  assert.equal(live.warnings.tornado, 1);
  assert.equal(live.streams.length, 1);
  assert.equal(live.streams[0].videoId, 'LIVEvideo01');

  const id = add.json().stream.id;
  await app.inject({ method: 'PATCH', url: `/api/admin/chase-streams/${id}`, headers: { cookie }, payload: { enabled: false } });
  assert.equal((await app.inject({ url: '/api/chaser/live' })).json().streams.length, 0);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/chase-streams/${id}`, headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/admin/chase-streams', headers: { cookie } })).json().streams.length, 0);
  await app.close();
});

test('live chase streams stay hidden without warnings unless marked anytime', async () => {
  const { app } = await testApp({ fetchImpl: chaserFetch({ warnings: false }) });
  const cookie = await admin(app);
  const add = await app.inject({ method: 'POST', url: '/api/admin/chase-streams', headers: { cookie }, payload: { url: '@stormkid' } });
  assert.equal(add.statusCode, 200, add.body);
  let live = (await app.inject({ url: '/api/chaser/live' })).json();
  assert.equal(live.warnings.active, false);
  assert.equal(live.streams.length, 0);
  assert.equal(live.configured, 1);
  await app.inject({ method: 'PATCH', url: `/api/admin/chase-streams/${add.json().stream.id}`, headers: { cookie }, payload: { anytime: true } });
  live = (await app.inject({ url: '/api/chaser/live' })).json();
  assert.equal(live.streams.length, 1);
  await app.close();
});
