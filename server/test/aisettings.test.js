import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, mockFetch, cookieFrom } from './helpers.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ADMIN = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'password123', AUTH_REQUIRED: 'true' };

async function admin(env = {}, fetchImpl = mockFetch()) {
  const { app, dataDir } = await testApp({ env: { ...ADMIN, ...env }, fetchImpl });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'password123' } });
  const headers = { cookie: cookieFrom(login) };
  const call = (method, url, payload) => app.inject({ method, url, headers, payload });
  return { app, call, dataDir };
}
const row = (res, key) => res.json().settings.find((s) => s.key === key);

test('admin AI settings: env values show as from the template, keys are never sent back', async () => {
  const { app, call } = await admin({ ANTHROPIC_API_KEY: 'sk-ant-secret-1234', OLLAMA_MODEL: 'gemma3' });
  const res = await call('GET', '/api/admin/ai-settings');
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /secret-1234/);
  assert.deepEqual(row(res, 'ANTHROPIC_API_KEY'), { key: 'ANTHROPIC_API_KEY', group: 'ai', secret: true, source: 'env', envSet: true, set: true, hint: '1234' });
  assert.equal(row(res, 'OLLAMA_MODEL').source, 'env');
  assert.equal(row(res, 'OLLAMA_URL').source, 'default');
  assert.equal(res.json().ai.provider, 'anthropic');
  await app.close();
});

test('only admins can see or change AI settings', async () => {
  const { app, call } = await admin();
  await call('POST', '/api/admin/users', { username: 'kid', displayName: 'Kid', password: 'password456' });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'kid', password: 'password456' } });
  const res = await app.inject({ url: '/api/admin/ai-settings', headers: { cookie: cookieFrom(login) } });
  assert.equal(res.statusCode, 403);
  assert.equal((await app.inject({ url: '/api/admin/ai-settings' })).statusCode, 401);
  await app.close();
});

test('saving switches the AI helper and voice live, and survives a restart', async () => {
  const fetchImpl = mockFetch({
    'ollama.lan:11434/api/chat': () => json({ message: { role: 'assistant', content: 'Hi from Ollama' } }),
  });
  const { app, call, dataDir } = await admin({ AI_MODEL: 'claude-opus-5-5' }, fetchImpl);
  assert.equal((await app.inject('/api/config')).json().ai.enabled, false);

  const res = await call('PUT', '/api/admin/ai-settings', { values: { OLLAMA_URL: 'http://ollama.lan:11434', OLLAMA_MODEL: 'gemma3:4b', KOKORO_URL: 'http://kokoro.lan:8880', KOKORO_VOICE: 'bf_emma', KOKORO_FALLBACK: 'off' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(row(res, 'OLLAMA_URL').source, 'saved');
  const cfg = (await app.inject('/api/config')).json();
  assert.equal(cfg.ai.provider, 'ollama');
  assert.deepEqual(cfg.tts, { enabled: true, voice: 'bf_emma', fallback: 'off' });
  const chat = await call('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'Rain?' }] });
  assert.equal(chat.json().answer, 'Hi from Ollama');
  assert.equal(JSON.parse(fetchImpl.calls.find((c) => c.url.includes('/api/chat')).opts.body).model, 'gemma3:4b');
  await app.close();

  // Same data volume, fresh start: the saved values are still there.
  const { loadConfig } = await import('../src/config.js');
  const { buildApp } = await import('../src/app.js');
  const again = await buildApp({ config: loadConfig({ DATA_DIR: dataDir, WEB_DIST: `${dataDir}/no-web`, ...ADMIN }), fetchImpl, logger: false });
  assert.equal((await again.inject('/api/config')).json().ai.provider, 'ollama');
  await again.close();
});

test('clearing a saved value falls back to the template; a blank key clears the saved one', async () => {
  const { app, call } = await admin({ AI_MODEL: 'claude-opus-5-5', ANTHROPIC_API_KEY: 'sk-env-aaaa' });
  let res = await call('PUT', '/api/admin/ai-settings', { values: { AI_MODEL: 'claude-sonnet-5-5', ANTHROPIC_API_KEY: 'sk-saved-bbbb' } });
  assert.equal(row(res, 'AI_MODEL').value, 'claude-sonnet-5-5');
  assert.equal(row(res, 'ANTHROPIC_API_KEY').hint, 'bbbb');
  res = await call('PUT', '/api/admin/ai-settings', { values: { AI_MODEL: null, ANTHROPIC_API_KEY: '' } });
  assert.equal(row(res, 'AI_MODEL').source, 'env');
  assert.equal(row(res, 'AI_MODEL').value, 'claude-opus-5-5');
  assert.equal(row(res, 'ANTHROPIC_API_KEY').hint, 'aaaa');
  assert.equal(row(res, 'ANTHROPIC_API_KEY').source, 'env');
  await app.close();
});

test('bad values are refused with a clear message', async () => {
  const { app, call } = await admin();
  for (const values of [{ OLLAMA_URL: 'ftp://x' }, { OLLAMA_URL: 'not a url' }, { AI_PROVIDER: 'gpt' }, { KOKORO_SPEED: '5' }, { NOPE: 'x' }, { AI_DAILY_LIMIT: '-1' }]) {
    const res = await call('PUT', '/api/admin/ai-settings', { values });
    assert.equal(res.statusCode, 400, JSON.stringify(values));
    assert.ok(res.json().error);
  }
  assert.equal(row(await call('GET', '/api/admin/ai-settings'), 'OLLAMA_URL').source, 'default');
  await app.close();
});

test('Test connection: Ollama lists models and spots a missing one', async () => {
  const fetchImpl = mockFetch({
    'ollama.lan:11434/api/tags': () => json({ models: [{ name: 'gemma3:latest' }, { name: 'qwen2.5vl:7b' }] }),
    'down.lan': () => { throw new TypeError('fetch failed'); },
  });
  const { app, call } = await admin({}, fetchImpl);
  let res = await call('POST', '/api/admin/ai-settings/test', { target: 'ollama', values: { OLLAMA_URL: 'http://ollama.lan:11434', OLLAMA_MODEL: 'gemma3' } });
  assert.equal(res.json().ok, true, res.body);
  res = await call('POST', '/api/admin/ai-settings/test', { target: 'ollama', values: { OLLAMA_URL: 'http://ollama.lan:11434', OLLAMA_MODEL: 'llama3.2' } });
  assert.equal(res.json().ok, false);
  assert.match(res.json().message, /ollama pull llama3.2/);
  res = await call('POST', '/api/admin/ai-settings/test', { target: 'ollama', values: { OLLAMA_URL: 'http://down.lan:1' } });
  assert.match(res.json().message, /Could not reach Ollama/);
  // Testing never saves.
  assert.equal(row(await call('GET', '/api/admin/ai-settings'), 'OLLAMA_URL').source, 'default');
  await app.close();
});

test('Test connection: Anthropic checks the key and the model', async () => {
  const fetchImpl = mockFetch({
    'api.anthropic.com/v1/models/': (u, opts) => ([new Headers(opts.headers).get('x-api-key'), new Headers(opts.headers).get('authorization')].some((h) => h?.endsWith('good-key'))
      ? json({ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', type: 'model' })
      : json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)),
  });
  const { app, call } = await admin({ ANTHROPIC_API_KEY: 'good-key' }, fetchImpl);
  let res = await call('POST', '/api/admin/ai-settings/test', { target: 'anthropic', values: { ANTHROPIC_API_KEY: '' } });
  assert.equal(res.json().ok, true, res.body);
  assert.match(res.json().message, /Claude Opus 5.5/);
  res = await call('POST', '/api/admin/ai-settings/test', { target: 'anthropic', values: { ANTHROPIC_API_KEY: 'bad-key' } });
  assert.equal(res.json().ok, false);
  assert.match(res.json().message, /not valid/);
  await app.close();
});

test('Test connection and Preview voice for Kokoro', async () => {
  const fetchImpl = mockFetch({
    'kokoro.lan:8880/v1/audio/voices': () => json({ voices: ['af_heart', 'bf_emma', 'jf_alpha'] }),
    'kokoro.lan:8880/v1/audio/speech': () => new Response(Buffer.from('ID3fake'), { headers: { 'content-type': 'audio/mpeg' } }),
  });
  const { app, call } = await admin({}, fetchImpl);
  const values = { KOKORO_URL: 'http://kokoro.lan:8880', KOKORO_VOICE: 'bf_emma', KOKORO_SPEED: '1.2' };
  const res = await call('POST', '/api/admin/ai-settings/test', { target: 'kokoro', values });
  assert.equal(res.json().ok, true, res.body);
  assert.deepEqual(res.json().voices.map((v) => v.id), ['af_heart', 'bf_emma']);
  const audio = await call('POST', '/api/admin/ai-settings/preview-voice', { values });
  assert.equal(audio.statusCode, 200);
  assert.equal(audio.headers['content-type'], 'audio/mpeg');
  const sent = JSON.parse(fetchImpl.calls.find((c) => c.url.includes('/v1/audio/speech')).opts.body);
  assert.equal(sent.voice, 'bf_emma');
  assert.equal(sent.speed, 1.2);
  const none = await call('POST', '/api/admin/ai-settings/preview-voice', {});
  assert.equal(none.statusCode, 400);
  await app.close();
});
