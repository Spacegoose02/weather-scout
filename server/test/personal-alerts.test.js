import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRules, evaluateRules, clockLabel, isQuiet } from '../../shared/thresholds.js';
import { normalizeForecast } from '../src/providers/openmeteo.js';
import { testApp, fakeForecast } from './helpers.js';

// 2 PM UTC on a fixed day, with the place on UTC so local = UTC.
const NOW = Date.parse('2026-11-04T14:00:00Z');
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

function fc({ temps = [], gusts = [], feels = [], snow = [], minutely = [], current = {} } = {}) {
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const epoch = NOW + i * 3600_000;
    return {
      time: iso(epoch), epoch,
      temp: temps[i] ?? 50, feelsLike: feels[i] ?? temps[i] ?? 50, windGust: gusts[i] ?? 10, snow: snow[i] ?? 0,
    };
  });
  return {
    utcOffsetSeconds: 0,
    units: { temp: '°F', wind: 'mph' },
    current: { temp: hourly[0].temp, precip: 0, ...current },
    hourly,
    minutely: minutely.map((p, i) => ({ time: iso(NOW + i * 15 * 60_000), precip: p.precip ?? p, code: p.code ?? 61 })),
  };
}

test('cleanRules keeps only known rules and sane numbers', () => {
  assert.equal(cleanRules(null), null);
  assert.equal(cleanRules({}), null, 'nothing on');
  const r = cleanRules({ rain: 1, freeze: '30', gust: 500, heat: false, junk: 'x' }, 'imperial');
  assert.deepEqual(r, { units: 'imperial', rain: true, freeze: 30, gust: 120, heat: null, snow: false, aurora: false, quiet: true });
  assert.equal(cleanRules({ freeze: -50 }, 'metric').freeze, -30);
});

test('clock labels and quiet hours', () => {
  assert.equal(clockLabel('2026-11-04T05:00'), '5 AM');
  assert.equal(clockLabel('2026-11-04T17:30'), '5:30 PM');
  assert.equal(clockLabel('2026-11-04T00:00'), '12 AM');
  assert.ok(isQuiet(22) && isQuiet(3) && !isQuiet(7) && !isQuiet(20));
});

test('rain starting soon only fires when it is dry now', () => {
  const rules = cleanRules({ rain: true });
  const soon = fc({ minutely: [0, 0, 0.02, 0.05] });
  const [ev] = evaluateRules(soon, rules, { now: NOW });
  assert.equal(ev.rule, 'rain');
  assert.match(ev.title, /Rain starting in about 30 minutes/);
  assert.match(ev.body, /around 2:30 PM/);
  assert.equal(ev.key, 'rain:2026-11-04:4');
  // Already raining: no "starting soon".
  assert.equal(evaluateRules(fc({ minutely: [0.03, 0.03, 0.03] }), rules, { now: NOW }).length, 0);
  // Snow says snow.
  const snow = evaluateRules(fc({ minutely: [0, { precip: 0.02, code: 73 }] }), rules, { now: NOW });
  assert.match(snow[0].title, /Snow starting/);
});

test('freeze, gusts, heat and snow use the numbers each device picked', () => {
  const temps = Array.from({ length: 24 }, (_, i) => 45 - i); // drops to 27 °F by morning
  const evs = evaluateRules(fc({ temps, gusts: [10, 20, 44], snow: [0, 0, 0, 0.3, 0.4] }), cleanRules({ freeze: 32, gust: 40, heat: 100, snow: true }), { now: NOW });
  const by = Object.fromEntries(evs.map((e) => [e.rule, e]));
  assert.match(by.freeze.title, /Hard freeze tonight: low of 27°F/);
  assert.match(by.gust.title, /Gusts up to 44 mph/);
  assert.match(by.snow.title, /About 0.7 in of snow/);
  assert.equal(by.heat, undefined, 'not hot');
  // Already below the line now: no freeze alert.
  assert.equal(evaluateRules(fc({ temps: Array(24).fill(30) }), cleanRules({ freeze: 32 }), { now: NOW }).length, 0);
  const hot = evaluateRules(fc({ feels: [96, 101, 104] }), cleanRules({ heat: 100 }), { now: NOW });
  assert.match(hot[0].title, /Feels like 104°F/);
});

test('quiet hours hold everything until morning', () => {
  const late = NOW + 9 * 3600_000; // 11 PM local
  assert.equal(evaluateRules(fc({ gusts: [50, 50, 50] }), cleanRules({ gust: 40 }), { now: late }).length, 0);
  assert.equal(evaluateRules(fc({ gusts: Array(24).fill(50) }), cleanRules({ gust: 40, quiet: false }), { now: late }).length, 1);
});

test('aurora alert needs a decent chance and some clear sky', () => {
  const rules = cleanRules({ aurora: true });
  const base = { chance: 'possible', text: 'Might peek over the horizon.', look: 'north', cloudsTonight: 30 };
  assert.equal(evaluateRules(fc(), rules, { now: NOW, aurora: base })[0].rule, 'aurora');
  assert.equal(evaluateRules(fc(), rules, { now: NOW, aurora: { ...base, cloudsTonight: 95 } }).length, 0);
  assert.equal(evaluateRules(fc(), rules, { now: NOW, aurora: { ...base, chance: 'unlikely' } }).length, 0);
});

test('push: personal alerts are saved per device and each event is sent once', async () => {
  const sent = [];
  const gusty = () => {
    const raw = fakeForecast({ gust: 48, offset: 0 });
    return new Response(JSON.stringify(raw), { headers: { 'content-type': 'application/json' } });
  };
  const { mockFetch } = await import('./helpers.js');
  const { app } = await testApp({ fetchImpl: mockFetch({ 'api.open-meteo.com/v1/forecast': gusty }), pushSend: async (s, p) => sent.push(JSON.parse(p)) });
  const sub = { endpoint: 'https://push.example/send/r1', keys: { p256dh: 'BPublicKey', auth: 'authsecret' } };
  const res = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub, place: { name: 'Home', lat: 37.54, lon: -77.43 }, levels: [], units: 'imperial', rules: { gust: 40, quiet: false } } });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().rules.gust, 40);

  let r = await app.push.checkRules(app.pushForecast, null);
  assert.equal(r.sent, 1);
  assert.match(sent[0].title, /Gusts up to 48 mph/);
  r = await app.push.checkRules(app.pushForecast, null);
  assert.equal(r.sent, 0, 'no repeats');

  const none = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub, place: { name: 'Home', lat: 37.54, lon: -77.43 }, levels: [], rules: {} } });
  assert.equal(none.statusCode, 400, 'something has to be on');
  await app.close();
});

test('normalized Open-Meteo forecasts work with the rules', () => {
  const f = normalizeForecast(fakeForecast({ gust: 70, offset: 0 }), 'imperial');
  const evs = evaluateRules(f, cleanRules({ gust: 50, quiet: false }));
  assert.equal(evs[0].rule, 'gust');
});
