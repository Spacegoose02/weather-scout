// AI helpers: "Ask a weather expert" chat (Rocky in Kid Mode), cloud photo
// identifier, and optional web search. Everything here is off until the server
// has an ANTHROPIC_API_KEY; the key never leaves the server. Kept in its own
// file so it stays out of the way of the core app.
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-opus-5-5';
// Models that take the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = /^claude-(opus-5(-5)?|fable-5(-1)?|sonnet-5-5)$/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

// In Kid Mode, web search only reads from these well-known, kid-safe science sites.
export const KID_SEARCH_DOMAINS = [
  'weather.gov', 'noaa.gov', 'nasa.gov', 'usgs.gov', 'epa.gov', 'ready.gov', 'cdc.gov',
  'nationalgeographic.com', 'britannica.com', 'metoffice.gov.uk', 'smithsonianmag.com', 'ucar.edu',
];

export const CLOUD_TYPES = [
  'cumulus', 'stratus', 'stratocumulus', 'nimbostratus', 'cumulonimbus',
  'altocumulus', 'altostratus', 'cirrus', 'cirrostratus', 'cirrocumulus',
  'fog', 'clear-sky', 'not-sky',
];

const CLOUD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isSky', 'cloudType', 'confidence', 'title', 'explanation', 'weatherHint', 'funFact', 'lookFor'],
  properties: {
    isSky: { type: 'boolean', description: 'true when the photo shows the sky, clouds or fog' },
    cloudType: { type: 'string', enum: CLOUD_TYPES },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    title: { type: 'string', description: 'Short friendly name, e.g. "Puffy cumulus clouds"' },
    explanation: { type: 'string', description: 'How you can tell, 2-3 sentences' },
    weatherHint: { type: 'string', description: 'What this cloud usually means for the next few hours' },
    funFact: { type: 'string' },
    lookFor: { type: 'string', description: 'One thing to look for next time to spot this cloud' },
  },
};

// ---- prompts ------------------------------------------------------------------------
const EXPERT = `You are the weather expert inside Weather Scout, a family weather app. You know meteorology, climate, clouds, storms, oceans and sky science well, and you explain clearly and accurately.
Use the live weather data you are given for the person's place when the question is about their weather; say when the data does not cover something. Keep answers short (a few short paragraphs at most) and practical. Use plain text with simple lists, no tables.
For severe weather, give clear safety steps and point people to the National Weather Service and local officials. Never invent alerts or forecasts.
Stay on weather, climate, science and outdoor-planning topics. For anything else, politely steer back to weather.`;

const ROCKY = `You are Rocky the raccoon, the friendly mascot of Weather Scout, answering a child's questions about weather and the sky.
How to talk:
- Write for a 6 to 10 year old: short sentences, simple words, one idea at a time. 2 to 5 sentences unless they ask for more.
- Be warm, curious and playful. A raccoon joke now and then is great. At most one emoji.
- Be accurate. If you are not sure, say so and suggest asking a grown-up or looking it up together.
- Use the live weather data for their place when it helps ("It's 54 degrees right now, so grab a jacket!").
Keeping kids safe:
- If there is a warning, thunder or anything scary, stay calm and kind: tell them to find a grown-up and follow the family's safe spot plan. Never use scary words or describe damage or injuries.
- Stay on weather, sky, nature and science. For other topics, gently steer back: "That's a fun question! I'm a weather raccoon though..."
- Never ask for or repeat personal details like full names, addresses, school names or phone numbers. If a child shares something worrying or says they are hurt or unsafe, tell them kindly to talk to a trusted grown-up right away.
- Do not give medical advice beyond simple weather safety (water, shade, sunscreen, warm layers).`;

const CLOUD_PROMPT = (kid) => `Look at this photo and identify the main cloud type (or fog, clear sky, or "not-sky" if the photo is not of the sky).
${kid
    ? 'Write every text field for a 6 to 10 year old, in the voice of Rocky the friendly raccoon: short sentences, simple words, playful and accurate. Nothing scary.'
    : 'Write every text field for an adult who is curious about weather: clear and accurate, with the cloud\'s altitude band and how it forms.'}
If the photo is not of the sky, set isSky to false, cloudType to "not-sky", and kindly ask for a photo pointed at the sky in "explanation" (fill the other fields with short friendly text).
Use "low" confidence when the photo is blurry, mostly ground, or the clouds are mixed.`;

// ---- live weather context -----------------------------------------------------
const r0 = (v) => (v == null || Number.isNaN(v) ? '?' : Math.round(v));

export function weatherContext({ place, forecast: fc, alerts = [], air = null }) {
  if (!fc) return 'Live weather data is unavailable right now.';
  const u = fc.units || {};
  const c = fc.current || {};
  const lines = [];
  lines.push(`Place: ${place?.name || 'the selected location'} (${place?.lat}, ${place?.lon}). Local time: ${c.time || 'unknown'} (${fc.timezone || ''}).`);
  lines.push(`Now: ${c.label || 'unknown'}, ${r0(c.temp)}${u.temp} (feels like ${r0(c.feelsLike)}${u.temp}), humidity ${r0(c.humidity)}%, dew point ${r0(c.dewPoint)}${u.temp}, wind ${r0(c.windSpeed)} ${u.wind} gusting ${r0(c.windGust)}, cloud cover ${r0(c.cloudCover)}%, UV ${c.uv ?? '?'}, pressure ${r0(c.pressure)} hPa (3-hour change ${c.pressureTrend3h ?? '?'} hPa), ${c.isDay ? 'daytime' : 'night'}.`);
  const next = (fc.hourly || []).filter((h) => h.epoch >= Date.now() - 1800_000).slice(0, 12);
  if (next.length) {
    lines.push(`Next 12 hours: ${next.map((h) => `${(h.time || '').slice(11, 16)} ${r0(h.temp)}${u.temp} ${h.label || ''} ${r0(h.precipChance)}% rain`).join('; ')}.`);
  }
  const days = (fc.daily || []).slice(0, 7);
  if (days.length) {
    lines.push(`Daily: ${days.map((d) => `${d.time} ${d.label || ''} high ${r0(d.high)} low ${r0(d.low)}${u.temp}, ${r0(d.precipChance)}% rain, wind up to ${r0(d.gustMax)} ${u.wind}, sunrise ${(d.sunrise || '').slice(11)} sunset ${(d.sunset || '').slice(11)}`).join('; ')}.`);
  }
  if (fc.recent) lines.push(`Rain in the last 24 hours: ${fc.recent.precipLast24h} ${u.precip}.`);
  if (air?.aqi != null) lines.push(`Air quality: US AQI ${air.aqi} (${air.category?.label || ''}).`);
  lines.push(alerts.length
    ? `Active National Weather Service alerts: ${alerts.slice(0, 5).map((a) => `${a.event}${a.headline ? ` (${a.headline})` : ''}`).join('; ')}.`
    : 'No active National Weather Service alerts.');
  return lines.join('\n');
}

// Keep only well-formed, alternating turns that start (and end) with the person.
export function cleanHistory(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages.slice(-MAX_TURNS) : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = String(m.content ?? '').trim().slice(0, MAX_CHARS);
    if (!text) continue;
    if (out.length && out.at(-1).role === m.role) out.at(-1).content += `\n\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.at(-1)?.role === 'user' ? out : [];
}

export function decodeImage(dataUrl) {
  const m = DATA_URL.exec(String(dataUrl || ''));
  if (!m) return null;
  return { mediaType: m[1], data: m[2], bytes: Math.floor((m[2].length * 3) / 4) };
}

// Collect the cited web pages from a response, once each.
function sourcesOf(content) {
  const seen = new Map();
  for (const block of content) {
    if (block.type === 'text') {
      for (const c of block.citations || []) if (c.url && !seen.has(c.url)) seen.set(c.url, { url: c.url, title: c.title || c.url });
    }
  }
  if (!seen.size) {
    for (const block of content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content.slice(0, 3)) if (r.url && !seen.has(r.url)) seen.set(r.url, { url: r.url, title: r.title || r.url });
      }
    }
  }
  return [...seen.values()].slice(0, 6);
}

const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

export class AiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// ---- service -------------------------------------------------------------------
export class AiService {
  constructor(cfg, { fetchImpl, log } = {}) {
    this.cfg = cfg.ai;
    this.log = log;
    this.client = this.cfg.apiKey
      ? new Anthropic({ apiKey: this.cfg.apiKey, fetch: fetchImpl, maxRetries: 1, timeout: 120_000 })
      : null;
    this.usage = new Map(); // who -> { day, n }
  }

  get enabled() {
    return !!this.client;
  }

  status() {
    return { enabled: this.enabled, chat: this.enabled, cloud: this.enabled, search: this.enabled && this.cfg.webSearch };
  }

  // A simple per-person daily cap so a curious kid can't run up the bill.
  take(who) {
    const limit = this.cfg.dailyLimit;
    if (!limit) return;
    const day = new Date().toISOString().slice(0, 10);
    const u = this.usage.get(who);
    if (!u || u.day !== day) {
      this.usage.set(who, { day, n: 1 });
      return;
    }
    if (u.n >= limit) throw new AiError(429, `That's all the questions for today (${limit}). Come back tomorrow!`);
    u.n += 1;
  }

  async create(params) {
    const fallback = FALLBACK_MODELS.test(this.cfg.model);
    try {
      return await this.client.beta.messages.create({
        model: this.cfg.model,
        ...params,
        ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {}),
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        this.log?.error({ status: err.status }, 'AI key was rejected');
        throw new AiError(503, 'The AI helper is not set up correctly on this server. Ask your admin to check the Anthropic API key.');
      }
      if (err instanceof Anthropic.RateLimitError) throw new AiError(429, 'The AI helper is busy right now. Try again in a minute.');
      if (err instanceof Anthropic.BadRequestError) {
        this.log?.warn({ status: err.status, msg: err.message }, 'AI request rejected');
        throw new AiError(400, 'The AI helper could not take that request. Try asking another way.');
      }
      if (err instanceof Anthropic.APIError) {
        this.log?.warn({ status: err.status, msg: err.message }, 'AI request failed');
        throw new AiError(502, 'Could not reach the AI helper right now. Try again in a minute.');
      }
      throw err;
    }
  }

  async chat({ messages, kidMode, search, context }) {
    const history = cleanHistory(messages);
    if (!history.length) throw new AiError(400, 'Ask a question first.');
    const useSearch = !!search && this.cfg.webSearch;
    const tools = useSearch
      ? [{
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 3,
        ...(kidMode ? { allowed_domains: KID_SEARCH_DOMAINS } : {}),
      }]
      : undefined;
    const system = [
      { type: 'text', text: kidMode ? ROCKY : EXPERT },
      {
        type: 'text',
        text: `${useSearch ? 'You can search the web. Use it for "why", news, history or science questions the live data cannot answer, and keep the answer short.\n' : ''}Live weather data for the person's place:\n${context}`,
      },
    ];

    let convo = history;
    let res;
    // Web search runs server side; a long search can pause and needs a resume.
    for (let i = 0; i < 3; i += 1) {
      res = await this.create({
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system,
        messages: convo,
        ...(tools ? { tools } : {}),
      });
      if (res.stop_reason !== 'pause_turn') break;
      convo = [...history, { role: 'assistant', content: res.content }];
    }

    if (res.stop_reason === 'refusal') {
      return { answer: kidMode ? "Hmm, that's not something I can help with. Want to ask me about clouds, rain or the stars instead?" : "Sorry, I can't help with that one. Try a weather question instead.", sources: [] };
    }
    const answer = textOf(res.content) || (kidMode ? "Hmm, my thinking cap slipped. Can you ask that again?" : 'No answer came back. Try asking again.');
    return { answer, sources: useSearch ? sourcesOf(res.content) : [], searched: res.content.some((b) => b.type === 'server_tool_use') };
  }

  async cloud({ image, kidMode, context }) {
    const img = decodeImage(image);
    if (!img) throw new AiError(400, 'That does not look like a photo.');
    if (img.bytes > MAX_IMAGE_BYTES) throw new AiError(413, 'That photo is too big. Try a smaller one.');
    const res = await this.create({
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CLOUD_SCHEMA } },
      system: `${kidMode ? ROCKY : EXPERT}\n\nLive weather data for the person's place (use it to sanity-check the photo, e.g. thunderstorms in the forecast):\n${context}`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
          { type: 'text', text: CLOUD_PROMPT(kidMode) },
        ],
      }],
    });
    if (res.stop_reason === 'refusal') throw new AiError(422, 'Could not look at that photo. Try a photo of the sky.');
    try {
      const out = JSON.parse(textOf(res.content));
      if (!CLOUD_TYPES.includes(out.cloudType)) out.cloudType = out.isSky ? 'cumulus' : 'not-sky';
      return out;
    } catch {
      throw new AiError(502, 'Could not read the cloud answer. Try again.');
    }
  }
}

// ---- routes --------------------------------------------------------------------
export function registerAi(app, { ai, forecast, alerts, air, settle, loc }) {
  const off = (reply) => reply.code(404).send({ error: 'The AI helper is turned off on this server. An admin can add an Anthropic API key to turn it on.' });
  const who = (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`);
  const ctxFor = async (body) => {
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lon)) return 'No location was picked, so no live weather data.';
    const l = loc(body);
    const [fc, al, aq] = await Promise.all([settle(forecast(l)), settle(alerts(l)), settle(air(l))]);
    return weatherContext({ place: { name: body.place, lat: l.lat, lon: l.lon }, forecast: fc, alerts: al?.alerts || [], air: aq });
  };
  const where = {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    units: { type: 'string', enum: ['imperial', 'metric'] },
    place: { type: 'string', maxLength: 120 },
    kidMode: { type: 'boolean' },
  };
  const handle = async (reply, fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AiError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  };

  app.get('/api/ai/status', async () => ai.status());

  app.post('/api/ai/chat', {
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          ...where,
          search: { type: 'boolean' },
          messages: {
            type: 'array', minItems: 1, maxItems: 40,
            items: { type: 'object', required: ['role', 'content'], properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string', maxLength: 8000 } } },
          },
        },
      },
    },
  }, async (req, reply) => {
    if (!ai.enabled) return off(reply);
    return handle(reply, async () => {
      ai.take(who(req));
      const context = await ctxFor(req.body);
      return ai.chat({ messages: req.body.messages, kidMode: !!req.body.kidMode, search: !!req.body.search, context });
    });
  });

  app.post('/api/ai/cloud', {
    bodyLimit: Math.ceil(MAX_IMAGE_BYTES * 1.4) + 4096,
    schema: { body: { type: 'object', required: ['image'], properties: { ...where, image: { type: 'string', maxLength: Math.ceil(MAX_IMAGE_BYTES * 1.4) } } } },
  }, async (req, reply) => {
    if (!ai.enabled) return off(reply);
    return handle(reply, async () => {
      ai.take(who(req));
      const context = await ctxFor(req.body);
      return ai.cloud({ image: req.body.image, kidMode: !!req.body.kidMode, context });
    });
  });
}
