import test from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch, fakeForecast } from './helpers.js';
import { extendedChance, normalizeExtended } from '../src/providers/severe.js';
import { rankedWarnings, dangerBoost, severeSummary, floodSummary, weekAhead, statesOfArea } from '../src/national.js';
import { parseScales, flareFlux, summarizeFlares, solarWind, spaceWeather } from '../src/spaceweather.js';
import { seasonFacts, seasonOdds, oneIn } from '../src/seasonodds.js';
import { alertEmail, kindOf, mailSettings, managePage } from '../src/email.js';
import { findStatus, textBlocks, dayMentioned, localDays } from '../src/school.js';
import { scoreDay, niceDays, tierOf } from '../../shared/niceday.js';
import { evaluateRules, cleanRules } from '../../shared/thresholds.js';
import { normalizeForecast } from '../src/providers/openmeteo.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const square = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

// ---- storm week ahead ------------------------------------------------------------
test('Day 4-8 outlooks: 15% and 30% areas, any label style', () => {
  assert.equal(extendedChance({ LABEL: '0.15' }), 15);
  assert.equal(extendedChance({ LABEL: '0.30' }), 30);
  assert.equal(extendedChance({ LABEL: '30%' }), 30);
  assert.equal(extendedChance({ LABEL2: '15% Any Severe Risk' }), 15);
  assert.equal(extendedChance({ LABEL: 'Predictability Too Low' }), null);
  const o = normalizeExtended({ features: [
    { properties: { LABEL: '0.30' }, geometry: square(-98, 34, -94, 38) },
    { properties: { LABEL: '0.15' }, geometry: square(-100, 32, -90, 40) },
    { properties: { LABEL: 'nope' }, geometry: square(0, 0, 1, 1) },
  ] }, 5);
  assert.equal(o.features.length, 2);
  assert.deepEqual(o.features.map((f) => f.properties.chance), [15, 30], 'lower chance first so 30% draws on top');
  assert.equal(normalizeExtended({ features: [] }, 6).features.length, 0);
});

test('the storm week strip finds the day to watch and the risk at home', () => {
  const cat = (label, geom) => ({ features: [{ properties: { label }, geometry: geom }] });
  const home = { lat: 36, lon: -96 };
  const w = weekAhead({
    cats: { 1: cat('TSTM', square(-100, 30, -90, 40)), 2: cat('MRGL', square(-80, 30, -75, 35)), 3: null },
    probs: { 4: { features: [] }, 5: normalizeExtended({ features: [{ properties: { LABEL: '0.30' }, geometry: square(-98, 34, -94, 38) }] }, 5), 6: null, 7: { features: [] }, 8: { features: [] } },
    home,
    now: Date.parse('2026-11-14T18:00:00Z'),
  });
  assert.equal(w.days.length, 8);
  assert.equal(w.days[0].date, '2026-11-14');
  assert.equal(w.days[4].date, '2026-11-18');
  assert.equal(w.days[4].top, 30);
  assert.equal(w.days[4].here, 30);
  assert.equal(w.days[2].available, false);
  assert.equal(w.days[5].available, false);
  assert.equal(w.watch, 5);
});

// ---- across the US -----------------------------------------------------------------
test('warnings are ranked by danger, emergencies first', () => {
  const f = (event, headline = '', area = 'Some County, OK') => ({ properties: { id: event + headline, event, headline, area, rank: event.includes('Tornado') ? 100 : event.includes('Severe') ? 90 : event.includes('Warning') ? 70 : 50 } });
  const r = rankedWarnings({ features: [
    f('Flood Warning'), f('Tornado Watch'), f('Severe Thunderstorm Warning', '', 'Dallas, TX; Tarrant, TX'),
    f('Tornado Warning'), f('Tornado Warning', 'TORNADO EMERGENCY for Moore', 'Cleveland, OK'),
  ] });
  assert.equal(r.total, 4, 'watches are left out');
  assert.equal(r.top[0].emergency, true);
  assert.equal(r.top[0].event, 'Tornado Warning');
  assert.deepEqual(r.top.map((w) => w.event), ['Tornado Warning', 'Tornado Warning', 'Severe Thunderstorm Warning', 'Flood Warning']);
  assert.deepEqual(r.top[2].states, ['TX']);
  assert.equal(r.kinds[0].event, 'Tornado Warning');
  assert.equal(r.kinds[0].count, 2);
  assert.equal(dangerBoost({ headline: 'This is a PARTICULARLY DANGEROUS SITUATION' }), 8);
  assert.deepEqual(statesOfArea('Polk, IA; Story, IA; Douglas, NE'), ['IA', 'NE']);
});

test('outlook summaries list states by level and the risk at home', () => {
  const spc = { features: [
    { properties: { label: 'MRGL' }, geometry: square(-100, 30, -90, 40) },
    { properties: { label: 'ENH' }, geometry: square(-98, 34, -95, 37) },
  ] };
  const s = severeSummary(spc, { lat: 35.5, lon: -96.5 });
  assert.equal(s.top, 'ENH');
  assert.equal(s.topLevel, 3);
  assert.equal(s.hereLevel, 3);
  assert.equal(s.levels[0].level, 3);
  assert.ok(s.levels[0].states.includes('Oklahoma'), s.levels[0].states.join());
  const ero = { features: [{ properties: { OUTLOOK: 'Slight' }, geometry: square(-92, 29, -89, 32) }] };
  const fl = floodSummary(ero, { lat: 40, lon: -75 });
  assert.equal(fl.top, 'slight');
  assert.equal(fl.hereLevel, 0);
});

test('/api/national puts the outlooks, warnings and reports together', async () => {
  const csv = 'Time,F_Scale,Location,County,State,Lat,Lon,Comments\n2010,EF2,2 N Moore,Cleveland,OK,35.35,-97.49,x\nTime,Speed,Location,County,State,Lat,Lon,Comments\n2100,70,Tulsa,Tulsa,OK,36.15,-95.99,y\nTime,Size,Location,County,State,Lat,Lon,Comments\n2200,275,Wichita,Sedgwick,KS,37.69,-97.34,z\n';
  const fetchImpl = mockFetch({
    'day1otlk_cat': () => json({ features: [{ properties: { LABEL: 'ENH', fill: '#ffa500', stroke: '#ff8000' }, geometry: square(-99, 33, -95, 38) }] }),
    'day2otlk_cat': () => json({ features: [] }),
    'eromap/geojson/Day1': () => json({ features: [{ properties: { OUTLOOK: 'Moderate' }, geometry: square(-92, 29, -89, 32) }] }),
    'eromap/geojson/Day2': () => json({ features: [] }),
    'alerts/active': () => json({ features: [{ id: 'w1', geometry: square(-97.6, 35.2, -97.3, 35.5), properties: { id: 'w1', event: 'Tornado Warning', headline: 'Tornado Warning', areaDesc: 'Cleveland, OK', severity: 'Extreme' } }] }),
    'today_filtered.csv': () => new Response(csv),
  });
  const { app } = await testApp({ fetchImpl });
  const r = await app.inject({ url: '/api/national?lat=35.4&lon=-97.4' });
  assert.equal(r.statusCode, 200, r.body);
  const n = r.json();
  assert.equal(n.severe.today.topLevel, 3);
  assert.equal(n.severe.today.hereLevel, 3);
  assert.equal(n.flood.today.topLevel, 3);
  assert.equal(n.warnings.total, 1);
  assert.deepEqual(n.warnings.top[0].states, ['OK']);
  assert.equal(n.reports.counts.tornado, 1);
  assert.equal(n.reports.top[0].type, 'tornado');
  assert.equal(n.reportPoints.length, 3);

  const week = await app.inject({ url: '/api/outlook/week?lat=35.4&lon=-97.4' });
  assert.equal(week.statusCode, 200);
  assert.equal(week.json().days.length, 8);
  assert.equal(week.json().days[0].hereLevel, 3);
  assert.equal(week.json().days[3].available, false, 'no mock for day 4 means not available, not an error');
  await app.close();
});

// ---- space weather -------------------------------------------------------------------
test('space weather: scales, flares and the solar wind', () => {
  const sc = parseScales({
    '-1': { DateStamp: '2026-11-13', R: { Scale: '0' }, S: { Scale: '0' }, G: { Scale: '1' } },
    0: { DateStamp: '2026-11-14', R: { Scale: '1', MinorProb: null }, S: { Scale: '0', Prob: null }, G: { Scale: '2' } },
    1: { DateStamp: '2026-11-15', R: { Scale: null, MinorProb: '35', MajorProb: '5' }, S: { Scale: null, Prob: '5' }, G: { Scale: '1' } },
  });
  assert.equal(sc.now.G.level, 2);
  assert.equal(sc.forecast[0].R.minor, 35);
  assert.equal(sc.forecast[0].G.level, 1);
  assert.ok(flareFlux('M1.9') > flareFlux('C9.9'));
  assert.ok(flareFlux('X1') > flareFlux('M9.9'));
  assert.equal(flareFlux('Z1'), null);
  const now = Date.parse('2026-11-14T20:00:00Z');
  const fl = summarizeFlares([
    { max_class: 'C2.2', max_time: '2026-11-14T18:45:00Z' },
    { max_class: 'M1.9', max_time: '2026-11-14T02:00:00Z' },
    { max_class: 'X1.1', max_time: '2026-11-09T02:00:00Z' },
  ], now);
  assert.equal(fl.latest.cls, 'C2.2');
  assert.equal(fl.biggest24h.cls, 'M1.9');
  assert.equal(fl.biggest7d.cls, 'X1.1');
  assert.equal(fl.notable7d, 2);
  const w = solarWind({ proton_speed: 620, time_tag: 'x' }, { bt: 12, bz_gsm: -8 });
  assert.equal(w.speedWord, 'fast');
  assert.match(w.bzWord, /south/);
  const s = spaceWeather({ scales: sc, flares: fl, wind: w, kpRows: [{ t: now - 3600_000, kp: 5.67 }], now });
  assert.match(s.headline, /G2 geomagnetic storm/);
  assert.equal(s.kp.now, 5.7);
});

test('/api/sky/space works with only some parts, and fails cleanly with none', async () => {
  const fetchImpl = mockFetch({
    'noaa-scales.json': () => json({ 0: { DateStamp: '2026-11-14', R: { Scale: '0' }, S: { Scale: '0' }, G: { Scale: '0' } } }),
    'xray-flares-7-day': () => json([{ max_class: 'C1.0', max_time: new Date().toISOString() }]),
  });
  const { app } = await testApp({ fetchImpl });
  const r = await app.inject({ url: '/api/sky/space' });
  assert.equal(r.statusCode, 200, r.body);
  assert.match(r.json().headline, /quiet/);
  assert.equal(r.json().wind, null);
  await app.close();
  const { app: off } = await testApp();
  assert.equal((await off.inject({ url: '/api/sky/space' })).statusCode, 502);
  await off.close();
});

// ---- season odds -------------------------------------------------------------------------
// Synthetic record: first freeze on Nov 1 (+ year % 10 days), first inch of snow mid-December
// in even years only, snow on the ground on Christmas every third year.
function synthRows(fromYear, toDate) {
  const rows = [];
  for (let t = Date.parse(`${fromYear}-01-01T00:00:00Z`); t <= Date.parse(`${toDate}T00:00:00Z`); t += 86400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const y = Number(date.slice(0, 4));
    const md = date.slice(5);
    const freezeStart = `11-${String(1 + (y % 10)).padStart(2, '0')}`;
    const cold = md >= freezeStart || md <= '03-20';
    rows.push({ date, low: cold ? 28 : 45, snow: md === '12-15' && y % 2 === 0 ? 2 : 0, depth: md === '12-25' ? (y % 3 === 0 ? 3 : 0) : 0 });
  }
  return rows;
}

test('season odds from the record book', () => {
  const rows = synthRows(1990, '2026-11-13');
  const f = seasonFacts(rows, 2024);
  assert.equal(f.complete, true);
  assert.equal(f.white, false, '2024 is not a snowy Christmas in this record');
  const odds = seasonOdds(rows, { today: '2026-11-14', lastComplete: 2025, source: 'test' });
  assert.equal(odds.white.chance, 33);
  assert.equal(odds.white.measure, 'depth');
  assert.equal(odds.firstFreeze.happens, 100);
  assert.match(odds.firstFreeze.typical, /^November \d+$/);
  assert.equal(odds.firstFreeze.earliest, 'November 1');
  assert.equal(odds.firstFreeze.thisSeason, 'November 7', '2026 % 10 = 6 -> Nov 7, already happened');
  assert.equal(odds.firstSnow.happens, 50);
  assert.equal(odds.firstSnow.typical, 'December 15');
  assert.match(odds.lastFreeze.typical, /^March 20$/);
  assert.equal(oneIn(33), 'about 1 year in 3');
  assert.equal(oneIn(1), 'hardly ever');
});

// ---- nice-day score -----------------------------------------------------------------------
test('nice-day score: a perfect day beats a muggy, stormy one', () => {
  const nice = scoreDay({ time: '2026-06-01', high: 74, feelsLikeHigh: 74, precipChance: 5, precipTotal: 0, code: 1, uvMax: 6, gustMax: 12, windMax: 8 });
  const bad = scoreDay({ time: '2026-06-02', high: 92, feelsLikeHigh: 104, precipChance: 70, precipTotal: 0.8, code: 95, uvMax: 10, gustMax: 40, windMax: 20 });
  const cold = scoreDay({ time: '2026-01-02', high: 30, feelsLikeHigh: 20, precipChance: 0, precipTotal: 0, code: 0, uvMax: 2, gustMax: 15, windMax: 10 });
  assert.ok(nice.score >= 90, `nice ${nice.score}`);
  assert.equal(nice.tier.id, 'perfect');
  assert.ok(bad.score < 25, `bad ${bad.score}`);
  assert.ok(cold.score < 45, `cold ${cold.score}`);
  assert.match(bad.why, /storms|rainy|hot|humid/);
  const metric = scoreDay({ time: '2026-06-01', high: 23, feelsLikeHigh: 23, precipChance: 5, precipTotal: 0, code: 1, uvMax: 6, gustMax: 19, windMax: 13 }, { units: 'metric' });
  assert.ok(Math.abs(metric.score - nice.score) <= 3, `metric ${metric.score} vs ${nice.score}`);
  assert.equal(tierOf(50).grade, 'C');
});

test('personal alerts: a nice day tomorrow and a snow day chance, in the late afternoon', () => {
  const offset = -18000;
  const fc = normalizeForecast(fakeForecast({ temp: 66, feels: 66, chance: 5, gust: 10, dew: 50, offset }), 'imperial');
  // 5 PM local
  const d = new Date(Date.now() + offset * 1000);
  const five = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 17) - offset * 1000;
  const rules = cleanRules({ nice: true, snowday: true }, 'imperial');
  const out = evaluateRules(fc, rules, { now: five });
  const nice = out.find((e) => e.rule === 'nice');
  assert.ok(nice, JSON.stringify(out));
  assert.match(nice.title, /Tomorrow looks/);
  assert.equal(out.find((e) => e.rule === 'snowday'), undefined, 'no snow, no snow day alert');
  // Morning: neither goes out.
  assert.equal(evaluateRules(fc, rules, { now: five - 8 * 3600_000 }).length, 0);
  assert.equal(niceDays(fc).days.length, 7);
});

// ---- email alerts -------------------------------------------------------------------------------
test('email: kinds, settings and the message', () => {
  assert.equal(kindOf('Tornado Warning'), 'tornado');
  assert.equal(kindOf('Severe Thunderstorm Warning'), 'severe');
  assert.equal(kindOf('Flash Flood Warning'), 'flood');
  assert.equal(kindOf('Winter Storm Warning'), 'other');
  assert.equal(kindOf('Tornado Watch'), 'watch');
  assert.equal(kindOf('Wind Advisory'), null);
  assert.equal(mailSettings({}), null);
  const m = mailSettings({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', EMAIL_FROM: 'a@example.com', SMTP_USERNAME: 'a', SMTP_PASSWORD: 'p' });
  assert.equal(m.secure, true);
  assert.equal(m.auth.user, 'a');
  assert.equal(mailSettings({ SMTP_HOST: 'h', EMAIL_FROM: 'f', SMTP_SECURITY: 'starttls' }).requireTLS, true);
  const mail = alertEmail({ id: 'x', event: 'Tornado Warning', headline: '<b>Take cover</b>', ends: '2026-11-14T22:45:00Z' }, { lat: 37.54, lon: -77.44, place_name: 'Grandma’s house', token: 'tok' }, { appUrl: 'https://wx.example', shelter: 'Shelter: the basement', timeZone: 'America/New_York' });
  assert.match(mail.subject, /^⚠️ Tornado Warning for Grandma’s house until/);
  assert.match(mail.text, /Shelter: the basement\./);
  assert.match(mail.text, /https:\/\/wx\.example\/api\/email-alerts\/manage\/tok/);
  assert.ok(!mail.html.includes('<b>Take cover</b>'), 'NWS text is escaped');
  assert.match(managePage(null), /expired/);
});

test('email alerts: admin adds a person, warnings go out once, the link stops them', async () => {
  const sent = [];
  const mailTransport = { sendMail: async (m) => { sent.push(m); return { messageId: '1' }; } };
  const env = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct-horse-9', SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'wx@example.com', PUBLIC_URL: 'https://wx.example/' };
  const { app } = await testApp({ env, mailTransport });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'correct-horse-9' } });
  const cookie = login.headers['set-cookie'];
  const anon = await app.inject({ url: '/api/admin/email-alerts' });
  assert.equal(anon.statusCode, 401);
  const bad = await app.inject({ method: 'POST', url: '/api/admin/email-alerts', headers: { cookie }, payload: { email: 'nope', place: { lat: 37.5, lon: -77.4 } } });
  assert.equal(bad.statusCode, 400);
  const add = await app.inject({ method: 'POST', url: '/api/admin/email-alerts', headers: { cookie }, payload: { email: 'Grandma@Example.com', name: 'Grandma', place: { lat: 37.5407, lon: -77.436, name: 'Richmond, VA' } } });
  assert.equal(add.statusCode, 201, add.body);
  assert.equal(add.json().email, 'grandma@example.com');
  assert.deepEqual(add.json().kinds, ['tornado', 'severe', 'flood']);
  const dup = await app.inject({ method: 'POST', url: '/api/admin/email-alerts', headers: { cookie }, payload: { email: 'grandma@example.com', place: { lat: 37.5407, lon: -77.436 } } });
  assert.equal(dup.statusCode, 409);

  // The mock alerts: a tornado warning (sent) and a wind advisory (not wanted).
  let r = await app.emailAlerts.check(app.pushAlerts);
  assert.equal(r.sent, 1);
  assert.equal(sent[0].to, 'grandma@example.com');
  assert.match(sent[0].subject, /Tornado Warning for Richmond, VA/);
  assert.match(sent[0].headers['List-Unsubscribe'], /^<https:\/\/wx\.example\/api\/email-alerts\/manage\/[\w-]+\?stop=1>$/);
  r = await app.emailAlerts.check(app.pushAlerts);
  assert.equal(r.sent, 0, 'no repeats');

  const test1 = await app.inject({ method: 'POST', url: `/api/admin/email-alerts/${add.json().id}/test`, headers: { cookie } });
  assert.equal(test1.statusCode, 200, test1.body);
  assert.equal(sent.length, 2);

  // The manage page works with no sign-in, even when sign-in is required elsewhere.
  const link = sent[0].text.match(/manage\/([\w-]+)/)[1];
  const page = await app.inject({ url: `/api/email-alerts/manage/${link}` });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /grandma@example\.com/);
  const save = await app.inject({ method: 'POST', url: `/api/email-alerts/manage/${link}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'action=save&kind=tornado&kind=watch' });
  assert.match(save.body, /Saved/);
  const list = await app.inject({ url: '/api/admin/email-alerts', headers: { cookie } });
  assert.deepEqual(list.json().recipients[0].kinds, ['tornado', 'watch']);
  // One-click unsubscribe from the mail app (RFC 8058).
  const stop = await app.inject({ method: 'POST', url: `/api/email-alerts/manage/${link}?stop=1`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'List-Unsubscribe=One-Click' });
  assert.match(stop.body, /Emails stopped/);
  assert.equal((await app.inject({ url: '/api/admin/email-alerts', headers: { cookie } })).json().recipients.length, 0);
  assert.match((await app.inject({ url: `/api/email-alerts/manage/${link}` })).body, /expired/);
  await app.close();
});

// ---- school closings ------------------------------------------------------------------------------
test('school status: finds closings and delays that name a day, skips boilerplate', () => {
  const now = Date.parse('2026-12-08T22:00:00Z'); // Tuesday 5 PM Eastern
  const offsetSec = -18000;
  const local = localDays(now, offsetSec);
  assert.equal(local.today, '2026-12-08');
  assert.equal(dayMentioned('Schools closed Wednesday', local), '2026-12-09');
  assert.equal(dayMentioned('Closed on Dec. 9 due to snow', local), '2026-12-09');
  assert.equal(dayMentioned('Closed 12/9', local), '2026-12-09');
  const page = (body) => textBlocks(`<html><body><nav>Closings</nav><div class="alert">${body}</div><p>In the event of school closings, we will post here.</p></body></html>`);
  assert.deepEqual(findStatus(page('All schools will be closed tomorrow, Wednesday, December 9, due to snow.'), { now, offsetSec }), { status: 'closed', date: '2026-12-09', text: 'All schools will be closed tomorrow, Wednesday, December 9, due to snow.' });
  assert.equal(findStatus(page('Schools will open on a 2-hour delay Wednesday.'), { now, offsetSec }).status, 'delay');
  assert.equal(findStatus(page('Wednesday will be a virtual learning day for all students.'), { now, offsetSec }).status, 'virtual');
  assert.equal(findStatus(page('Early dismissal today at 12:30 PM.'), { now, offsetSec }).status, 'early');
  assert.equal(findStatus(page('Welcome back! Check our calendar.'), { now, offsetSec }), null, 'boilerplate only');
  assert.equal(findStatus(page('Schools were closed Monday.'), { now, offsetSec }), null, 'a day already past');
  // A feed: only recent items count.
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Schools closed due to snow</title><pubDate>${new Date(now - 2 * 3600_000).toUTCString()}</pubDate></item>
    <item><title>Two-hour delay</title><pubDate>${new Date(now - 5 * 86400_000).toUTCString()}</pubDate></item>
  </channel></rss>`;
  assert.equal(findStatus(textBlocks(rss, 'application/rss+xml'), { now, offsetSec }).status, 'closed');
});

test('school: the card shows the district status, a grown-up can override it, devices get a push', async () => {
  const sent = [];
  const pushSend = async (s, payload) => { sent.push(JSON.parse(payload)); };
  const fetchImpl = mockFetch({ 'district.example': () => new Response('<html><body><h2>Closings</h2><p>All schools are closed today due to icy roads.</p></body></html>', { headers: { 'content-type': 'text/html' } }) });
  const env = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct-horse-9', SCHOOL_NAME: 'Maple County Schools', SCHOOL_STATUS_URL: 'https://district.example/closings' };
  const { app } = await testApp({ env, fetchImpl, pushSend });
  await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: { endpoint: 'https://push.example/1', keys: { p256dh: 'k', auth: 'a' } }, place: { lat: 37.5, lon: -77.4 }, levels: [], rules: { school: true } } });
  await app.school.check();
  const card = (await app.inject({ url: '/api/school?lat=37.5&lon=-77.4' })).json();
  assert.equal(card.configured, true);
  assert.equal(card.status.status, 'closed');
  assert.equal(card.status.source, 'district');
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /Maple County Schools: closed today/);
  await app.school.check();
  assert.equal(sent.length, 1, 'the same closing is sent once');

  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'correct-horse-9' } });
  const cookie = login.headers['set-cookie'];
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const set = await app.inject({ method: 'PUT', url: '/api/admin/school/status', headers: { cookie }, payload: { status: 'delay', date: tomorrow, note: '2-hour delay' } });
  assert.equal(set.statusCode, 200, set.body);
  const after = (await app.inject({ url: '/api/school?lat=37.5&lon=-77.4' })).json();
  assert.equal(after.status.status, 'delay');
  assert.equal(after.status.source, 'family');
  assert.equal(sent.length, 2);
  const nope = await app.inject({ method: 'PUT', url: '/api/admin/school/status', headers: { cookie }, payload: { status: 'party', date: tomorrow } });
  assert.equal(nope.statusCode, 400);
  const check = await app.inject({ method: 'POST', url: '/api/admin/settings/test', headers: { cookie }, payload: { target: 'school', values: {} } });
  assert.match(check.json().message, /Found: closed/);
  await app.close();
});
