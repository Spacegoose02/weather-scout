import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, cookieFrom } from './helpers.js';
import { alertPayload } from '../src/push.js';
import { cleanPlan, defaultPlan, hazardFor, shelterAlerts, readiness, shelterLine, DEFAULT_KIT, LIMITS } from '../../shared/safety-plan.js';

async function family() {
  const { app } = await testApp();
  const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'mom', password: 'password123' } });
  const admin = cookieFrom(setup);
  await app.inject({ method: 'POST', url: '/api/admin/users', headers: { cookie: admin }, payload: { username: 'kiddo', password: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'kiddo', password: 'password123' } });
  return { app, admin, kid: cookieFrom(login) };
}

test('hazardFor only pops up for warnings, never watches or advisories', () => {
  assert.equal(hazardFor({ event: 'Tornado Warning' }).id, 'tornado');
  assert.equal(hazardFor({ event: 'Tornado Emergency' }).id, 'tornado');
  assert.equal(hazardFor({ event: 'Extreme Wind Warning' }).id, 'tornado');
  assert.equal(hazardFor({ event: 'Severe Thunderstorm Warning' }).id, 'thunder');
  assert.equal(hazardFor({ event: 'Flash Flood Warning' }).id, 'flood');
  assert.equal(hazardFor({ event: 'Flood Warning' }).id, 'flood');
  assert.equal(hazardFor({ event: 'Coastal Flood Warning' }).id, 'flood');
  assert.equal(hazardFor({ event: 'Hurricane Warning' }).id, 'hurricane');
  assert.equal(hazardFor({ event: 'Storm Surge Warning' }).id, 'hurricane');
  assert.equal(hazardFor({ event: 'Tropical Storm Warning' }).id, 'hurricane');
  for (const event of ['Tornado Watch', 'Severe Thunderstorm Watch', 'Flood Advisory', 'Flood Watch', 'Hurricane Watch', 'Wind Advisory', 'Hurricane Force Wind Warning', '']) {
    assert.equal(hazardFor({ event }), null, event);
  }
});

test('shelterAlerts keeps one per hazard, tornado first', () => {
  const list = shelterAlerts([
    { id: 'f1', event: 'Flash Flood Warning' },
    { id: 'w', event: 'Wind Advisory' },
    { id: 't1', event: 'Tornado Warning' },
    { id: 't2', event: 'Tornado Warning' },
  ]);
  assert.deepEqual(list.map((x) => [x.hazard.id, x.alert.id]), [['tornado', 't1'], ['flood', 'f1']]);
  assert.deepEqual(shelterAlerts(null), []);
});

test('cleanPlan keeps a known, capped shape', () => {
  assert.deepEqual(cleanPlan(null), defaultPlan());
  const p = cleanPlan({
    shelters: { tornado: { spot: '  Basement bathroom  ', note: 'x'.repeat(1000) }, volcano: { spot: 'nope' } },
    contacts: [{ name: 'Grandma', phone: '555-0100', extra: 'drop me' }, { name: '', phone: '' }, ...Array.from({ length: 20 }, (_, i) => ({ name: `C${i}` }))],
    kit: [{ id: 'water', label: 'Water', done: true }, { id: 'water', label: 'More water' }, { id: '<bad>', label: 'Snacks', done: 'yes' }, { label: '' }],
    lastDrill: 'yesterday',
    hacked: true,
  });
  assert.equal(p.shelters.tornado.spot, 'Basement bathroom');
  assert.equal(p.shelters.tornado.note.length, LIMITS.note);
  assert.equal(p.shelters.volcano, undefined);
  assert.deepEqual(p.shelters.flood, { spot: '', note: '' });
  assert.deepEqual(p.contacts[0], { name: 'Grandma', phone: '555-0100', note: '' });
  assert.equal(p.contacts.length, LIMITS.contacts);
  assert.deepEqual(p.kit, [{ id: 'water', label: 'Water', done: true }, { id: 'more-water', label: 'More water', done: false }, { id: 'snacks', label: 'Snacks', done: false }]);
  assert.equal(p.lastDrill, null);
  assert.equal(p.hacked, undefined);
});

test('readiness lists what is left to do', () => {
  const fresh = readiness(defaultPlan());
  assert.equal(fresh.kitTotal, DEFAULT_KIT.length);
  assert.equal(fresh.ready, false);
  assert.ok(fresh.todo.includes('Pick a tornado shelter spot'));
  const plan = defaultPlan();
  plan.shelters.tornado.spot = 'basement';
  plan.meeting.home = 'the mailbox';
  plan.contacts = [{ name: 'Grandma', phone: '1', note: '' }];
  plan.kit.forEach((k) => { k.done = true; });
  plan.lastDrill = '2026-10-01';
  assert.equal(readiness(plan).ready, true);
  assert.equal(shelterLine(plan, 'tornado'), 'Shelter: basement');
  assert.equal(shelterLine(plan, 'flood'), '');
});

test('push notifications under a warning say where to shelter', () => {
  const p = alertPayload({ id: 'x', event: 'Tornado Warning', headline: 'Tornado Warning until 4 PM' }, 'Richmond, VA', 'Shelter: basement');
  assert.equal(p.body, 'Shelter: basement. Tornado Warning until 4 PM');
  assert.equal(p.url, '/?shelter=1');
  assert.equal(alertPayload({ id: 'y', event: 'Wind Advisory', headline: 'Windy' }).url, '/');
});

test('safety plan: grown-ups edit, kids tick the kit, guests never see phone numbers', async () => {
  const { app, admin, kid } = await family();

  const guest = (await app.inject('/api/safety-plan')).json();
  assert.equal(guest.canEdit, false);
  assert.equal(guest.canTick, false);
  assert.equal(guest.plan.kit.length, DEFAULT_KIT.length);

  const plan = { ...guest.plan, shelters: { ...guest.plan.shelters, tornado: { spot: 'Basement bathroom', note: '' } }, meeting: { home: 'The big oak tree', away: 'Library' }, contacts: [{ name: 'Grandma', phone: '555-0100' }], lastDrill: '2020-01-01' };
  assert.equal((await app.inject({ method: 'PUT', url: '/api/safety-plan', payload: plan })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/safety-plan', headers: { cookie: kid }, payload: plan })).statusCode, 403);
  const saved = await app.inject({ method: 'PUT', url: '/api/safety-plan', headers: { cookie: admin }, payload: plan });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().plan.shelters.tornado.spot, 'Basement bathroom');
  assert.equal(saved.json().plan.lastDrill, null, 'drills are logged, not typed in');
  assert.equal(saved.json().updatedBy, 'mom');

  // Guests see the spots but not the contacts.
  const g = (await app.inject('/api/safety-plan')).json();
  assert.equal(g.plan.meeting.home, 'The big oak tree');
  assert.deepEqual(g.plan.contacts, []);
  assert.equal(g.contactsHidden, true);
  const k = (await app.inject({ url: '/api/safety-plan', headers: { cookie: kid } })).json();
  assert.equal(k.plan.contacts[0].phone, '555-0100');
  assert.equal(k.canTick, true);
  assert.equal(k.canEdit, false);

  // A kid helps pack the kit and logs a drill.
  const tick = await app.inject({ method: 'PUT', url: '/api/safety-plan/kit/flashlight', headers: { cookie: kid }, payload: { done: true } });
  assert.equal(tick.statusCode, 200, tick.body);
  assert.equal(tick.json().plan.kit.find((x) => x.id === 'flashlight').done, true);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/safety-plan/kit/flashlight', payload: { done: true } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/safety-plan/kit/nope', headers: { cookie: kid }, payload: { done: true } })).statusCode, 404);
  const drill = await app.inject({ method: 'POST', url: '/api/safety-plan/drill', headers: { cookie: kid }, payload: {} });
  assert.equal(drill.statusCode, 200, drill.body);
  assert.equal(drill.json().plan.lastDrill, new Date().toISOString().slice(0, 10));
  assert.equal((await app.inject({ method: 'POST', url: '/api/safety-plan/drill', headers: { cookie: kid }, payload: { day: '2999-01-01' } })).statusCode, 400);
  // Editing the plan keeps the logged drill.
  const again = await app.inject({ method: 'PUT', url: '/api/safety-plan', headers: { cookie: admin }, payload: { ...k.plan, lastDrill: null } });
  assert.equal(again.json().plan.lastDrill, drill.json().plan.lastDrill);

  // Reset goes back to the starter plan.
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/safety-plan', headers: { cookie: kid } })).statusCode, 403);
  const reset = (await app.inject({ method: 'DELETE', url: '/api/safety-plan', headers: { cookie: admin } })).json();
  assert.deepEqual(reset.plan, defaultPlan());
  await app.close();
});
