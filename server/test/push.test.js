import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { alertLevel, alertPayload } from '../src/push.js';
import { testApp, mockFetch, fakeAlerts } from './helpers.js';

const sub = (n = 1) => ({ endpoint: `https://push.example/send/${n}`, keys: { p256dh: 'BPublicKey', auth: 'authsecret' } });
const place = { name: 'Richmond, VA', lat: 37.5407, lon: -77.436 };

test('alert levels', () => {
  assert.equal(alertLevel({ event: 'Tornado Warning', severity: 'Extreme' }), 'warning');
  assert.equal(alertLevel({ event: 'Winter Storm Watch', severity: 'Moderate' }), 'watch');
  assert.equal(alertLevel({ event: 'Wind Advisory', severity: 'Minor' }), 'advisory');
  const p = alertPayload({ id: 'x', event: 'Tornado Warning', headline: 'Tornado Warning until 4 PM' }, 'Richmond, VA');
  assert.equal(p.title, '⚠️ Tornado Warning for Richmond, VA');
  assert.equal(p.tag, 'alert:x');
  assert.equal(p.requireInteraction, true);
});

async function setup(extra = {}) {
  const sent = [];
  let fail = null;
  const pushSend = async (s, payload) => {
    if (fail) throw Object.assign(new Error('gone'), { statusCode: fail });
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
  };
  const { app, dataDir } = await testApp({ ...extra, pushSend });
  return { app, dataDir, sent, setFail: (c) => { fail = c; } };
}

test('subscribe, get each new alert once, and drop dead subscriptions', async () => {
  const { app, dataDir, sent, setFail } = await setup();
  const key = (await app.inject({ url: '/api/push/key' })).json();
  assert.ok(key.publicKey.length > 40);
  assert.ok(fs.existsSync(path.join(dataDir, '.vapid.json')));

  const bad = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: { endpoint: 'http://x' }, place } });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(1), place, levels: ['warning'] } });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.json().place.lat, 37.54);
  await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(2), place, levels: ['warning', 'advisory'] } });

  let r = await app.push.check(app.pushAlerts);
  assert.equal(r.places, 1);
  // sub 1 gets the tornado warning; sub 2 gets the warning and the wind advisory
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.filter((s) => s.endpoint.endsWith('/1')).map((s) => s.payload.tag), ['alert:a2']);

  r = await app.push.check(app.pushAlerts);
  assert.equal(r.sent, 0, 'no repeats');

  const t = await app.inject({ method: 'POST', url: '/api/push/test', payload: { endpoint: sub(1).endpoint } });
  assert.equal(t.statusCode, 200);
  assert.equal(sent.at(-1).payload.tag, 'test');

  setFail(410);
  await app.inject({ method: 'POST', url: '/api/push/test', payload: { endpoint: sub(2).endpoint } });
  assert.equal(app.push.count(), 1, 'gone subscription removed');

  const st = (await app.inject({ method: 'POST', url: '/api/push/status', payload: { endpoint: sub(1).endpoint } })).json();
  assert.equal(st.subscribed, true);
  assert.deepEqual(st.levels, ['warning']);
  await app.inject({ method: 'POST', url: '/api/push/unsubscribe', payload: { endpoint: sub(1).endpoint } });
  assert.equal(app.push.count(), 0);
  await app.close();
});

test('push can be turned off', async () => {
  const { app } = await setup({ env: { PUSH_ENABLED: 'false' } });
  assert.equal((await app.inject({ url: '/api/push/key' })).statusCode, 404);
  await app.close();
});

test('a failing alert fetch does not stop other places', async () => {
  const fetchImpl = mockFetch({ 'point=10': () => new Response('{}', { status: 500 }) });
  const { app, sent } = await setup({ fetchImpl });
  await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(1), place: { name: 'Bad', lat: 10, lon: 10 } } });
  await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: { subscription: sub(2), place } });
  const r = await app.push.check(app.pushAlerts);
  assert.equal(r.places, 2);
  assert.equal(sent.length, 1);
  await app.close();
});
