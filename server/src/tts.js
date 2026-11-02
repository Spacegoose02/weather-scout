// Read-aloud with Kokoro (https://github.com/remsky/Kokoro-FastAPI), a small
// open text-to-speech model that sounds far nicer than most built-in browser
// voices. The server proxies it so the browser never needs to reach the Kokoro
// container directly. Off until KOKORO_URL is set; the web app then falls back
// to the browser's own voice.
import { TtlCache } from './cache.js';

const MAX_TEXT = 1500;
const VOICE_ID = /^[a-z]{2}_[a-z0-9]+(?:[+][a-z]{2}_[a-z0-9]+)*$/;
const LANG = { a: 'American', b: 'British' };

// "af_heart" -> "Heart (American, female)". Only English voices are offered.
export function voiceLabel(id) {
  const m = /^([ab])([fm])_(.+)$/.exec(id);
  if (!m) return id;
  const name = m[3].charAt(0).toUpperCase() + m[3].slice(1);
  return `${name} (${LANG[m[1]]}, ${m[2] === 'f' ? 'female' : 'male'})`;
}

export function registerTts(app, { cfg, fetchImpl }) {
  const tts = cfg.tts;
  const audioCache = new TtlCache({ max: 120 });
  const voiceCache = new TtlCache({ max: 2 });
  const off = (reply) => reply.code(404).send({ error: 'Kokoro read-aloud is not set up on this server.' });

  const listVoices = () => voiceCache.wrap('voices', 60 * 60_000, async () => {
    const res = await fetchImpl(`${tts.url}/v1/audio/voices`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Kokoro voices responded ${res.status}`);
    const body = await res.json();
    const ids = (body.voices || []).map((v) => (typeof v === 'string' ? v : v?.id || v?.name)).filter((v) => /^[ab][fm]_/.test(v || ''));
    return ids.sort();
  });

  app.get('/api/tts/voices', async (req, reply) => {
    if (!tts.url) return off(reply);
    let ids;
    try {
      ids = await listVoices();
    } catch (err) {
      req.log.warn({ err: err.message }, 'Kokoro voice list failed');
      ids = [];
    }
    if (!ids.includes(tts.voice)) ids = [tts.voice, ...ids];
    return { default: tts.voice, voices: ids.map((id) => ({ id, label: voiceLabel(id) })) };
  });

  app.post('/api/tts', {
    schema: {
      body: {
        type: 'object', required: ['text'],
        properties: { text: { type: 'string', minLength: 1, maxLength: MAX_TEXT }, voice: { type: 'string', maxLength: 80 } },
      },
    },
  }, async (req, reply) => {
    if (!tts.url) return off(reply);
    const voice = req.body.voice && VOICE_ID.test(req.body.voice) ? req.body.voice : tts.voice;
    const text = req.body.text.trim();
    if (!text) return reply.code(400).send({ error: 'Nothing to read.' });
    let audio;
    try {
      audio = await audioCache.wrap(`${voice}|${tts.speed}|${text}`, 6 * 60 * 60_000, async () => {
        const res = await fetchImpl(`${tts.url}/v1/audio/speech`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'kokoro', input: text, voice, response_format: 'mp3', speed: tts.speed }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`Kokoro responded ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      });
    } catch (err) {
      req.log.warn({ err: err.message }, 'Kokoro speech failed');
      return reply.code(502).send({ error: 'The read-aloud voice is not answering right now.' });
    }
    return reply.header('content-type', 'audio/mpeg').header('cache-control', 'private, max-age=3600').send(audio);
  });
}
