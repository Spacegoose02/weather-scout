import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch } from './helpers.js';
import { tropicsContext, weatherContext, directionFrom } from '../src/ai.js';
import { normalizeStorm } from '../src/providers/tropics.js';

const KEY = { ANTHROPIC_API_KEY: 'sk-test-key' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const MILTON = { id: 'al142026', binNumber: 'AT4', name: 'Milton', classification: 'HU', intensity: '105', pressure: '952', latitudeNumeric: 25.5, longitudeNumeric: -85, movementDir: 70, movementSpeed: 12, lastUpdate: '2026-11-20T15:00:00.000Z', publicAdvisory: { url: 'https://www.nhc.noaa.gov/text/MIATCPAT4.shtml' }, windSpeedProbabilities: { url: 'https://www.nhc.noaa.gov/text/MIAPWSAT4.shtml' } };
const KIKO = { id: 'ep112026', binNumber: 'EP1', name: 'Kiko', classification: 'TS', intensity: '50', latitudeNumeric: 15, longitudeNumeric: -120 };
const ADVISORY = `<pre>
STORM SURGE:  The water could reach the following heights above ground
somewhere in the indicated areas if the peak surge occurs at the time of high tide...

Tampa Bay...10-15 ft
Dry Tortugas...1-2 ft

WIND:  Hurricane conditions are expected.
</pre>`;
const PWS = `<pre>
TAMPA FL       34  2  12(14)  70(84)   8(92)   X(92)   X(92)   X(92)
TAMPA FL       50  X   2( 2)  55(57)  10(67)   X(67)   X(67)   X(67)
TAMPA FL       64  X   X( X)  38(38)   9(47)   X(47)   X(47)   X(47)
</pre>`;

// Fake Claude + NHC. `storms` is the CurrentStorms.json body, or a status code for a failing feed.
function setup(storms) {
  const bodies = [];
  const fetchImpl = mockFetch({
    'api.anthropic.com/v1/messages': (u, opts) => {
      const body = JSON.parse(opts.body);
      bodies.push(body);
      return json({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    },
    'CurrentStorms.json': () => (typeof storms === 'number' ? json({}, storms) : json(storms)),
    'MIATCPAT4': () => new Response(ADVISORY),
    'MIAPWSAT4': () => new Response(PWS),
    'geocoding-api': (u) => {
      const q = new URL(u).searchParams.get('name');
      return json({ results: q === 'Tampa' ? [{ name: q, admin1: 'Florida', country_code: 'US', latitude: 27.95, longitude: -82.46 }] : [] });
    },
  });
  return { fetchImpl, bodies };
}
const sysOf = (body) => body.system.map((b) => b.text).join('\n');
const ask = (payload) => ({ method: 'POST', url: '/api/ai/chat', payload: { messages: [{ role: 'user', content: 'Are any hurricanes active right now?' }], ...payload } });

test('Ask Rocky sees live NHC storms with distance and direction from the place', async () => {
  const { fetchImpl, bodies } = setup({ activeStorms: [KIKO, MILTON] });
  const { app } = await testApp({ env: KEY, fetchImpl });
  const res = await app.inject(ask({ lat: 42.52, lon: -70.9, place: 'Salem, MA' }));
  assert.equal(res.statusCode, 200);
  const sys = sysOf(bodies[0]);
  assert.match(sys, /National Hurricane Center/);
  assert.match(sys, /2 active/);
  assert.match(sys, /Major hurricane Milton \(Category 3\), Atlantic; max winds 120 mph; pressure 952 mb; centered near 25\.5N 85\.0W; moving ENE at 12 mph; 1,4\d\d miles southwest of Salem, MA/);
  assert.match(sys, /Tropical storm Kiko, Eastern Pacific/);
  assert.ok(sys.indexOf('Milton') < sys.indexOf('Kiko'), 'closest storm first');
  assert.match(sys, /Milton is within 1,4\d\d miles, but NHC lists no meaningful chance of tropical-storm-force winds near Salem, MA/);
  await app.close();
});

test('a storm near the place brings NHC wind odds and storm surge into the answer', async () => {
  const { fetchImpl, bodies } = setup({ activeStorms: [MILTON] });
  const { app } = await testApp({ env: KEY, fetchImpl });
  await app.inject(ask({ lat: 27.9, lon: -82.5, place: 'Tampa, FL', kidMode: true }));
  const sys = sysOf(bodies[0]);
  assert.match(sys, /Rocky the raccoon/);
  assert.match(sys, /Milton odds near Tampa, FL .*TAMPA FL.*92% chance of tropical-storm-force winds.*67% chance of 58\+ mph, 47% chance of hurricane-force/);
  assert.match(sys, /Milton peak storm surge forecast: Tampa Bay 10-15 ft/);
  await app.close();
});

test('no storms and a broken feed are told apart', async () => {
  let { fetchImpl, bodies } = setup({ activeStorms: [] });
  let { app } = await testApp({ env: KEY, fetchImpl });
  await app.inject(ask({ lat: 42.52, lon: -70.9, place: 'Salem, MA' }));
  assert.match(sysOf(bodies[0]), /none right now/);
  await app.close();

  ({ fetchImpl, bodies } = setup(503));
  ({ app } = await testApp({ env: KEY, fetchImpl }));
  const res = await app.inject(ask({ lat: 42.52, lon: -70.9, place: 'Salem, MA' }));
  assert.equal(res.statusCode, 200);
  assert.match(sysOf(bodies[0]), /could not be loaded/);
  await app.close();
});

test('storm list works without a picked place, and in metric', () => {
  const s = normalizeStorm(MILTON);
  assert.match(tropicsContext({ tropics: { storms: [s] } }), /Major hurricane Milton.*centered near 25\.5N 85\.0W/);
  assert.doesNotMatch(tropicsContext({ tropics: { storms: [s] } }), /miles/);
  assert.match(tropicsContext({ place: { name: 'Salem', lat: 42.52, lon: -70.9 }, tropics: { storms: [s] }, metric: true }), /max winds 193 km\/h; .*2,\d{3} km southwest of Salem/);
  assert.equal(directionFrom({ lat: 0, lon: 0 }, { lat: 10, lon: 0 }), 'north');
  assert.equal(directionFrom({ lat: 0, lon: 0 }, { lat: -5, lon: -5 }), 'southwest');
  // Callers that don't ask for storms (cloud photos) get no storm section.
  assert.doesNotMatch(weatherContext({ forecast: null }), /Hurricane Center/);
});
