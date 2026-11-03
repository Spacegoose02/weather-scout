// "Test connection" and "Preview voice" for the AI helper and Kokoro, used by
// the admin AI settings panel. The settings themselves live in settings.js.
import Anthropic from '@anthropic-ai/sdk';
import { voiceLabel } from './tts.js';
import { SettingsError } from './settings.js';

export const reach = (err, what, url) => (err?.name === 'TimeoutError' ? `${what} at ${url} took too long to answer.` : `Could not reach ${what} at ${url}. Is it running, and can this server reach that address?`);

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
