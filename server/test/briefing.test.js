import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefing, greeting } from '../src/briefing.js';
import { briefingDue, localClock } from '../src/push.js';
import { normalizeForecast } from '../src/providers/openmeteo.js';
import { testApp, mockFetch, fakeForecast } from './helpers.js';

const fc = (opts) => normalizeForecast(fakeForecast(opts), 'imperial');
const sub = (n = 1) => ({ endpoint: `https://push.example/send/${n}`, keys: { p256dh: 'BPublicKey', auth: 'authsecret' } });
const place = { name: 'Richmond, VA', lat: 37.5407, lon: -77.436 };

test('template briefing covers the day, what to wear and a sign-off', () => {
  const b = buildBriefing(fc({ temp: 30, feels: 22, chance: 80, code: 61 }), { name: 'Maya Lopez', place: 'Richmond' });
  assert.match(b.text, /Maya!/);
  assert.doesNotMatch(b.text, /Lopez/, 'first name only');
  assert.match(b.text, /Right now it's 30 degrees, but it feels like 22\./);
  assert.match(b.text, /high is 38 and tonight's low is 20/);
  assert.match(b.text, /8 in 10 chance/);
  assert.match(b.text, /rain jacket/);
  assert.match(b.text, /Have an awesome day!$/);
  assert.ok(b.short.length <= 220);
  assert.doesNotMatch(b.short, /Maya/, 'push text has no name');
  assert.equal(b.alert, false);
});

test('briefing mentions alerts calmly and the push text keeps them', () => {
  const alerts = [{ id: 'a1', event: 'Wind Advisory', severity: 'Minor' }, { id: 'a2', event: 'Tornado Warning', severity: 'Extreme' }];
  const b = buildBriefing(fc(), { alerts });
  assert.equal(b.alert, true);
  assert.match(b.text, /^Good \w+! It's Rocky with your weather\. Heads up! The weather service sent a Tornado Warning\..*grown-up.*safe spot plan/);
  assert.match(b.short, /^Heads up: Tornado Warning\./);
  assert.match(b.text, /inside day/);
});

test('greeting follows the local hour', () => {
  assert.equal(greeting(7), 'Good morning');
  assert.equal(greeting(13), 'Good afternoon');
  assert.equal(greeting(19), 'Good evening');
});

test('briefing is due once a day, inside the grace window', () => {
  const offset = -5 * 3600;
  const at = Date.parse('2026-11-02T12:05:00Z'); // 07:05 local
  assert.deepEqual(localClock(offset, at), { date: '2026-11-02', minutes: 7 * 60 + 5 });
  assert.equal(briefingDue({ briefing_time: '07:00' }, offset, at), true);
  assert.equal(briefingDue({ briefing_time: '07:00', briefing_sent: '2026-11-02' }, offset, at), false);
  assert.equal(briefingDue({ briefing_time: '07:30' }, offset, at), false, 'not yet');
  assert.equal(briefingDue({ briefing_time: '05:00' }, offset, at), false, 'too late, skip today');
  assert.equal(briefingDue({ briefing_time: null }, offset, at), false);
});

test('GET /api/briefing works without AI', async () => {
  const { app } = await testApp();
  const r = await app.inject({ url: '/api/briefing?lat=37.54&lon=-77.43&place=Richmond&name=Sam' });
  assert.equal(r.statusCode, 200);
  const b = r.json();
  assert.equal(b.ai, false);
  assert.match(b.text, /Sam! It's Rocky with your weather for Richmond\./);
  assert.match(b.text, /Tornado Warning/);
  await app.close();
});

test('GET /api/briefing?ai=1 asks the AI once and falls back when it fails', async () => {
  let asked = 0;
  let fail = false;
  const fetchImpl = mockFetch({
    'api.anthropic.com': () => {
      asked++;
      if (fail) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hi friend! It is 70 degrees. Have fun!' }], usage: { input_tokens: 1, output_tokens: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const { app } = await testApp({ env: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl });
  const one = (await app.inject({ url: '/api/briefing?lat=37.54&lon=-77.43&ai=true' })).json();
  assert.equal(one.ai, true);
  assert.equal(one.text, 'Hi friend! It is 70 degrees. Have fun!');
  assert.match(one.template, /Rocky/);
  await app.inject({ url: '/api/briefing?lat=37.54&lon=-77.43&ai=true' });
  assert.equal(asked, 1, 'cached');
  fail = true;
  const other = (await app.inject({ url: '/api/briefing?lat=38.54&lon=-77.43&ai=true' })).json();
  assert.equal(other.ai, false);
  assert.match(other.text, /Rocky/);
  await app.close();
});

test('scheduled morning briefing push goes out once at the chosen local time', async () => {
  const sent = [];
  const { app } = await testApp({ pushSend: async (s, payload) => { sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) }); } });
  // Briefing only, no alert levels.
  const bad = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(1), place, levels: [], briefingTime: '7am' } });
  assert.equal(bad.statusCode, 400);
  const none = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(1), place, levels: [] } });
  assert.equal(none.statusCode, 400);
  const ok = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(1), place, levels: [], briefingTime: '07:00' } });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.json().briefingTime, '07:00');
  await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(2), place, levels: ['warning'] } });

  // fakeForecast's place is UTC-5.
  const early = Date.parse('2026-11-02T11:30:00Z'); // 06:30
  let r = await app.push.checkBriefings(app.pushBriefing, early);
  assert.equal(r.sent, 0);
  assert.equal(r.places, 1, 'looked up once to learn the offset');
  r = await app.push.checkBriefings(app.pushBriefing, early);
  assert.equal(r.places, 0, 'offset known, nothing due, no lookup');

  const due = Date.parse('2026-11-02T12:01:00Z'); // 07:01
  r = await app.push.checkBriefings(app.pushBriefing, due);
  assert.equal(r.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, sub(1).endpoint);
  assert.equal(sent[0].payload.tag, 'briefing');
  assert.equal(sent[0].payload.url, '/?briefing=1&lat=37.54&lon=-77.44&place=Richmond%2C+VA');
  assert.match(sent[0].payload.title, /Rocky's weather for Richmond, VA/);

  r = await app.push.checkBriefings(app.pushBriefing, due + 10 * 60_000);
  assert.equal(r.sent, 0, 'once a day');
  r = await app.push.checkBriefings(app.pushBriefing, due + 24 * 3600_000);
  assert.equal(r.sent, 1, 'again the next morning');

  // Alerts are not sent to the briefing-only device.
  await app.push.check(app.pushAlerts);
  assert.ok(sent.filter((s) => s.endpoint === sub(1).endpoint).every((s) => s.payload.tag === 'briefing'));

  const t = await app.inject({ method: 'POST', url: '/api/push/briefing-test', payload: { endpoint: sub(1).endpoint } });
  assert.equal(t.statusCode, 200);
  assert.equal(sent.at(-1).payload.tag, 'briefing');
  await app.close();
});

