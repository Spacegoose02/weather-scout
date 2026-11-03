// AI and read-aloud settings an admin can change from Family & settings, so the
// Anthropic key, Ollama address and Kokoro voice don't have to live in the
// Unraid template. Saved values are stored in the database in the data volume
// and win over environment variables; clearing one falls back to the env var
// (or the built-in default). Keys are write-only: the API only says whether a
// key is set and shows its last 4 characters.
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { voiceLabel } from './tts.js';
import { CHASER_LIST, testYoutubeKey } from './chasers.js';

// Saved under the same names as the env vars, so loadConfig parses and clamps them.
export const AI_SETTINGS = [
  { key: 'AI_PROVIDER', options: ['', 'anthropic', 'ollama', 'off'] },
  { key: 'ANTHROPIC_API_KEY', secret: true },
  { key: 'AI_MODEL', pattern: /^[\w.:@/-]{1,100}$/ },
  { key: 'OLLAMA_URL', url: true },
  { key: 'OLLAMA_MODEL', pattern: /^[\w.:@/-]{1,100}$/ },
  { key: 'OLLAMA_VISION_MODEL', pattern: /^[\w.:@/-]{0,100}$/ },
  { key: 'OLLAMA_API_KEY', secret: true },
  { key: 'AI_WEB_SEARCH', options: ['true', 'false'] },
  { key: 'AI_DAILY_LIMIT', pattern: /^\d{1,5}$/ },
  { key: 'KOKORO_URL', url: true },
  { key: 'KOKORO_VOICE', pattern: /^[a-z]{2}_[a-z0-9]+(?:[+][a-z]{2}_[a-z0-9]+)*$/ },
  { key: 'KOKORO_SPEED', range: [0.5, 2] },
  { key: 'KOKORO_FALLBACK', options: ['browser', 'off'] },
  { key: 'YOUTUBE_API_KEY', secret: true },
  { key: 'STORM_CHASER_CHANNELS', pattern: CHASER_LIST },
  { key: 'STORM_CHASER_SEARCH', options: ['', 'true', 'false'] },
];
const BY_KEY = new Map(AI_SETTINGS.map((f) => [f.key, f]));

export class SettingsError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function validate(key, raw) {
  const f = BY_KEY.get(key);
  if (!f) throw new SettingsError(`Unknown setting ${key}.`);
  const v = String(raw ?? '').trim();
  if (v.length > 500) throw new SettingsError(`${key} is too long.`);
  if (f.options && !f.options.includes(v.toLowerCase())) throw new SettingsError(`${key} must be one of: ${f.options.filter(Boolean).join(', ')}.`);
  if (f.pattern && v && !f.pattern.test(v)) throw new SettingsError(`${key} doesn't look right.`);
  if (f.range && v && !(Number(v) >= f.range[0] && Number(v) <= f.range[1])) throw new SettingsError(`${key} must be between ${f.range[0]} and ${f.range[1]}.`);
  if (f.url && v) {
    let u;
    try {
      u = new URL(v);
    } catch {
      throw new SettingsError(`${key} must be a web address like http://192.168.1.20:11434`);
    }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new SettingsError(`${key} must start with http:// or https://`);
  }
  return f.options ? v.toLowerCase() : v;
}

export class AiSettings {
  constructor(db, cfg) {
    this.db = db;
    this.cfg = cfg;
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
    this.listeners = [];
  }

  saved() {
    const out = {};
    for (const r of this.db.prepare('SELECT key, value FROM settings').all()) if (BY_KEY.has(r.key)) out[r.key] = r.value;
    return out;
  }

  // The env plus saved values (plus any unsaved form values), parsed like a fresh start.
  merged(extra = {}) {
    return loadConfig({ ...this.cfg.env, ...this.saved(), ...extra });
  }

  // Push the saved values into the live config. AiService/tts read these objects.
  apply() {
    const m = this.merged();
    Object.assign(this.cfg.ai, m.ai);
    Object.assign(this.cfg.tts, m.tts);
    Object.assign(this.cfg.youtube, m.youtube);
    for (const fn of this.listeners) fn(this.cfg);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  // What the admin page shows. Secrets only say whether they're set.
  view() {
    const saved = this.saved();
    const env = this.cfg.env;
    return AI_SETTINGS.map(({ key, secret }) => {
      const source = key in saved ? 'saved' : env[key] !== undefined && env[key] !== '' ? 'env' : 'default';
      const value = saved[key] ?? (source === 'env' ? env[key] : '');
      const row = { key, secret: !!secret, source, envSet: env[key] !== undefined && env[key] !== '' };
      if (secret) return { ...row, set: !!value, hint: value ? value.slice(-4) : '' };
      return { ...row, value };
    });
  }

  // values: { KEY: string } saves; { KEY: null } clears back to the env/default.
  // For secrets, leaving the key out keeps what's there.
  update(values) {
    if (!values || typeof values !== 'object') throw new SettingsError('Nothing to save.');
    // A blank secret clears the saved key (back to the env var, if there is one).
    const writes = Object.entries(values).map(([k, v]) => {
      if (v === null || (BY_KEY.get(k)?.secret && String(v).trim() === '')) return [k, (validate(k, ''), null)];
      return [k, validate(k, v)];
    });
    const put = this.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
    const del = this.db.prepare('DELETE FROM settings WHERE key = ?');
    this.db.exec('BEGIN');
    try {
      for (const [k, v] of writes) (v === null ? del.run(k) : put.run(k, v));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.apply();
  }

  // Form values the admin hasn't saved yet, for Test and Preview. Blank secrets mean "use the saved one".
  draft(values = {}) {
    const extra = {};
    for (const [k, v] of Object.entries(values || {})) {
      if (v === null || v === undefined) continue;
      if (BY_KEY.get(k)?.secret && String(v).trim() === '') continue;
      extra[k] = validate(k, v);
    }
    return this.merged(extra);
  }
}

const reach = (err, what, url) => (err?.name === 'TimeoutError' ? `${what} at ${url} took too long to answer.` : `Could not reach ${what} at ${url}. Is it running, and can this server reach that address?`);

// "Test connection" for one service, with the draft settings. Never throws.
export async function testConnection(target, draftCfg, fetchImpl) {
  const { ai, tts } = draftCfg;
  try {
    if (target === 'anthropic') {
      if (!ai.apiKey) return { ok: false, message: 'Add an Anthropic API key first.' };
      const client = new Anthropic({ apiKey: ai.apiKey, fetch: fetchImpl, maxRetries: 0, timeout: 15_000 });
      try {
        const m = await client.models.retrieve(ai.model);
        return { ok: true, message: `Connected. The key works and ${m.display_name || ai.model} is available.` };
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: 'Anthropic says that key is not valid. Check it at console.anthropic.com.' };
        if (err instanceof Anthropic.PermissionDeniedError) return { ok: false, message: 'That key is not allowed to use the API. Check its workspace and billing at console.anthropic.com.' };
        if (err instanceof Anthropic.NotFoundError) return { ok: false, message: `The key works, but there is no model called "${ai.model}". Try claude-opus-5-5 or claude-sonnet-5-5.` };
        if (err instanceof Anthropic.APIConnectionError) return { ok: false, message: 'Could not reach api.anthropic.com from this server.' };
        if (err instanceof Anthropic.APIError) return { ok: false, message: `Anthropic answered with an error (${err.status}).` };
        throw err;
      }
    }
    if (target === 'ollama') {
      const url = (ai.ollama.url || '').replace(/\/+$/, '');
      if (!url) return { ok: false, message: 'Add the Ollama address first.' };
      let res;
      try {
        res = await fetchImpl(`${url}/api/tags`, { signal: AbortSignal.timeout(8000) });
      } catch (err) {
        return { ok: false, message: reach(err, 'Ollama', url) };
      }
      if (!res.ok) return { ok: false, message: `Ollama at ${url} answered ${res.status}. Is that the Ollama port (usually 11434)?` };
      const models = ((await res.json().catch(() => ({}))).models || []).map((m) => m.name || m.model).filter(Boolean);
      const has = (name) => models.some((m) => m === name || m === `${name}:latest` || m.split(':')[0] === name);
      const missing = [ai.ollama.model, ai.ollama.visionModel].filter(Boolean).filter((m) => !has(m));
      if (missing.length) {
        return { ok: false, models, message: `Connected, but Ollama doesn't have ${missing.map((m) => `"${m}"`).join(' or ')} yet. Run "ollama pull ${missing[0]}" on the Ollama server.` };
      }
      return { ok: true, models, message: `Connected. ${ai.ollama.model} is ready${ai.ollama.apiKey ? ', and web search has a key' : ''}.` };
    }
    if (target === 'kokoro') {
      if (!tts.url) return { ok: false, message: 'Add the Kokoro address first.' };
      let res;
      try {
        res = await fetchImpl(`${tts.url}/v1/audio/voices`, { signal: AbortSignal.timeout(8000) });
      } catch (err) {
        return { ok: false, message: reach(err, 'Kokoro', tts.url) };
      }
      if (!res.ok) return { ok: false, message: `Kokoro at ${tts.url} answered ${res.status}. Is that the Kokoro-FastAPI port (usually 8880)?` };
      const body = await res.json().catch(() => ({}));
      const voices = (body.voices || []).map((v) => (typeof v === 'string' ? v : v?.id || v?.name)).filter((v) => /^[ab][fm]_/.test(v || '')).sort();
      const ok = voices.includes(tts.voice);
      return {
        ok,
        voices: voices.map((id) => ({ id, label: voiceLabel(id) })),
        message: ok ? `Connected. ${voices.length} English voices, including ${voiceLabel(tts.voice)}.` : `Connected, but Kokoro has no voice called "${tts.voice}". Pick one from the list.`,
      };
    }
    if (target === 'youtube') return testYoutubeKey(draftCfg.youtube.apiKey, fetchImpl);
    return { ok: false, message: 'Unknown service.' };
  } catch (err) {
    return { ok: false, message: `Test failed: ${String(err.message || err).slice(0, 160)}` };
  }
}

// One short clip from Kokoro with the draft settings, for "Preview voice".
export async function previewVoice(draftCfg, fetchImpl, text) {
  const { tts } = draftCfg;
  if (!tts.url) throw new SettingsError('Add the Kokoro address first.');
  let res;
  try {
    res = await fetchImpl(`${tts.url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', input: text, voice: tts.voice, response_format: 'mp3', speed: tts.speed }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const e = new SettingsError(reach(err, 'Kokoro', tts.url));
    e.statusCode = 502;
    throw e;
  }
  if (!res.ok) {
    const e = new SettingsError(`Kokoro answered ${res.status}.`);
    e.statusCode = 502;
    throw e;
  }
  return Buffer.from(await res.arrayBuffer());
}
