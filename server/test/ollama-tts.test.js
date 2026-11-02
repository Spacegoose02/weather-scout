import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch } from './helpers.js';
import { pickProvider } from '../src/ai.js';
import { voiceLabel } from '../src/tts.js';
import { onDomains } from '../src/providers/ollama.js';

const OLLAMA = { OLLAMA_URL: 'http://ollama.lan:11434/' };
const PNG = `data:image/png;base64,${Buffer.from('fake').toString('base64')}`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function ollama(reply, search) {
  const bodies = [];
  const searches = [];
  const fetchImpl = mockFetch({
    'ollama.lan:11434/api/chat': (u, opts) => {
      const body = JSON.parse(opts.body);
      bodies.push(body);
      return reply(body);
    },
    'ollama.com/api/web_search': (u, opts) => {
      searches.push({ body: JSON.parse(opts.body), auth: opts.headers.authorization });
      return json({ results: search || [] });
    },
  });
  return Object.assign(fetchImpl, { bodies, searches });
}
const said = (content) => json({ model: 'gemma3', message: { role: 'assistant', content }, done: true });
const ask = (payload) => ({ method: 'POST', url: '/api/ai/chat', payload });

test('provider choice: explicit, then Claude, then Ollama', () => {
  const ai = (o) => ({ provider: '', apiKey: '', ollama: { url: '' }, ...o });
  assert.equal(pickProvider(ai({})), null);
  assert.equal(pickProvider(ai({ apiKey: 'k', ollama: { url: 'u' } })), 'anthropic');
  assert.equal(pickProvider(ai({ ollama: { url: 'u' } })), 'ollama');
  assert.equal(pickProvider(ai({ provider: 'ollama', apiKey: 'k', ollama: { url: 'u' } })), 'ollama');
  assert.equal(pickProvider(ai({ provider: 'ollama', apiKey: 'k' })), null);
  assert.equal(pickProvider(ai({ provider: 'off', apiKey: 'k' })), null);
});

test('Ollama chat uses the local model with the forecast as context', async () => {
  const fetchImpl = ollama(() => said('Bring an umbrella!'));
  const { app } = await testApp({ env: { ...OLLAMA, OLLAMA_MODEL: 'llama3.2' }, fetchImpl });
  const status = (await app.inject('/api/config')).json().ai;
  assert.equal(status.provider, 'ollama');
  assert.equal(status.search, false); // no ollama.com key
  const res = await app.inject(ask({ lat: 37.54, lon: -77.43, kidMode: true, search: true, messages: [{ role: 'user', content: 'Rain?' }] }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().answer, 'Bring an umbrella!');
  const body = fetchImpl.bodies[0];
  assert.equal(body.model, 'llama3.2');
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /Rocky the raccoon/);
  assert.match(body.messages[0].content, /Tornado Warning/);
  assert.equal(fetchImpl.searches.length, 0);
  await app.close();
});

test('Ollama web search feeds results in, kid-safe sites only in Kid Mode', async () => {
  const results = [
    { title: 'NASA Space Place', url: 'https://spaceplace.nasa.gov/blue-sky/', content: 'Blue light scatters more.' },
    { title: 'Random blog', url: 'https://blog.example.com/sky', content: 'Some opinion.' },
  ];
  const fetchImpl = ollama(() => said('Because blue light scatters!'), results);
  const { app } = await testApp({ env: { ...OLLAMA, OLLAMA_API_KEY: 'ok-key' }, fetchImpl });
  assert.equal((await app.inject('/api/ai/status')).json().search, true);
  const res = await app.inject(ask({ kidMode: true, search: true, messages: [{ role: 'user', content: 'Why is the sky blue?' }] }));
  assert.deepEqual(res.json().sources, [{ url: 'https://spaceplace.nasa.gov/blue-sky/', title: 'NASA Space Place' }]);
  assert.equal(fetchImpl.searches[0].auth, 'Bearer ok-key');
  assert.equal(fetchImpl.searches[0].body.query, 'Why is the sky blue?');
  const sys = fetchImpl.bodies[0].messages[0].content;
  assert.match(sys, /Blue light scatters more/);
  assert.doesNotMatch(sys, /blog\.example/);

  await app.inject(ask({ search: true, messages: [{ role: 'user', content: 'Why is the sky blue?' }] }));
  assert.match(fetchImpl.bodies[1].messages[0].content, /blog\.example/);
  await app.close();
});

test('Ollama cloud photo sends the image to the vision model with a JSON schema', async () => {
  const cloud = { isSky: true, cloudType: 'cirrus', confidence: 'medium', title: 'Wispy cirrus', explanation: 'Thin streaks.', weatherHint: 'Change coming.', funFact: 'Made of ice.', lookFor: 'Mare\'s tails.' };
  const fetchImpl = ollama(() => said(`\`\`\`json\n${JSON.stringify(cloud)}\n\`\`\``));
  const { app } = await testApp({ env: { ...OLLAMA, OLLAMA_MODEL: 'llama3.2', OLLAMA_VISION_MODEL: 'qwen2.5vl' }, fetchImpl });
  const res = await app.inject({ method: 'POST', url: '/api/ai/cloud', payload: { image: PNG } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), cloud);
  const body = fetchImpl.bodies[0];
  assert.equal(body.model, 'qwen2.5vl');
  assert.equal(body.format.type, 'object');
  assert.deepEqual(body.messages[1].images, [Buffer.from('fake').toString('base64')]);
  await app.close();
});

test('Ollama problems become clear messages', async () => {
  const missing = ollama(() => json({ error: "model 'gemma3' not found" }, 404));
  const { app } = await testApp({ env: OLLAMA, fetchImpl: missing });
  const r1 = await app.inject(ask({ messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(r1.statusCode, 503);
  assert.match(r1.json().error, /ollama pull gemma3/);
  await app.close();

  const down = mockFetch({ 'ollama.lan': () => { throw new TypeError('fetch failed'); } });
  const { app: app2 } = await testApp({ env: OLLAMA, fetchImpl: down });
  const r2 = await app2.inject(ask({ messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(r2.statusCode, 502);
  assert.match(r2.json().error, /Is it running/);
  await app2.close();
});

test('onDomains keeps listed sites and their subdomains', () => {
  const r = onDomains([{ url: 'https://www.weather.gov/x' }, { url: 'https://notweather.gov/' }, { url: 'nope' }], ['weather.gov']);
  assert.deepEqual(r.map((x) => x.url), ['https://www.weather.gov/x']);
});

// ---- Kokoro read-aloud ----------------------------------------------------------
function kokoro() {
  const speech = [];
  const fetchImpl = mockFetch({
    'kokoro.lan:8880/v1/audio/voices': () => json({ voices: ['af_heart', 'af_bella', 'bm_george', 'jf_alpha', 'zf_xiaobei'] }),
    'kokoro.lan:8880/v1/audio/speech': (u, opts) => {
      speech.push(JSON.parse(opts.body));
      return new Response(Buffer.from([0x49, 0x44, 0x33]), { headers: { 'content-type': 'audio/mpeg' } });
    },
  });
  return Object.assign(fetchImpl, { speech });
}

test('Kokoro is off without a URL', async () => {
  const { app } = await testApp();
  assert.deepEqual((await app.inject('/api/config')).json().tts, { enabled: false, voice: null });
  assert.equal((await app.inject({ method: 'POST', url: '/api/tts', payload: { text: 'hi' } })).statusCode, 404);
  await app.close();
});

test('Kokoro voices and speech go through the server, cached', async () => {
  const fetchImpl = kokoro();
  const { app } = await testApp({ env: { KOKORO_URL: 'http://kokoro.lan:8880/', KOKORO_VOICE: 'af_bella', KOKORO_SPEED: '0.9' }, fetchImpl });
  assert.deepEqual((await app.inject('/api/config')).json().tts, { enabled: true, voice: 'af_bella' });
  const voices = (await app.inject('/api/tts/voices')).json();
  assert.equal(voices.default, 'af_bella');
  assert.deepEqual(voices.voices.map((v) => v.id), ['af_bella', 'af_heart', 'bm_george']);
  assert.equal(voices.voices[2].label, 'George (British, male)');

  const say = (payload) => app.inject({ method: 'POST', url: '/api/tts', payload });
  const r = await say({ text: 'Hi, I am Rocky!' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'audio/mpeg');
  assert.equal(r.rawPayload.length, 3);
  await say({ text: 'Hi, I am Rocky!' });
  assert.equal(fetchImpl.speech.length, 1);
  assert.deepEqual(fetchImpl.speech[0], { model: 'kokoro', input: 'Hi, I am Rocky!', voice: 'af_bella', response_format: 'mp3', speed: 0.9 });

  await say({ text: 'Hello', voice: 'bm_george' });
  assert.equal(fetchImpl.speech[1].voice, 'bm_george');
  await say({ text: 'Hello again', voice: '../etc"' });
  assert.equal(fetchImpl.speech[2].voice, 'af_bella');
  await app.close();
});

test('Kokoro outage is a 502 so the browser can fall back', async () => {
  const fetchImpl = mockFetch({ 'kokoro.lan': () => new Response('x', { status: 500 }) });
  const { app } = await testApp({ env: { KOKORO_URL: 'http://kokoro.lan:8880' }, fetchImpl });
  assert.equal((await app.inject({ method: 'POST', url: '/api/tts', payload: { text: 'hi' } })).statusCode, 502);
  assert.deepEqual((await app.inject('/api/tts/voices')).json().voices.map((v) => v.id), ['af_heart']);
  await app.close();
});

test('voice labels', () => {
  assert.equal(voiceLabel('af_heart'), 'Heart (American, female)');
  assert.equal(voiceLabel('custom'), 'custom');
});
