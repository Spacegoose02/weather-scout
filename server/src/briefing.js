// Rocky's morning briefing: a short, kid-friendly summary of the day (weather,
// what to wear, recess, any alerts) that can be read aloud with the Kokoro
// voice or sent as a push notification at a time the family picks.
// The text is built from a template, so it works with no AI at all. When the
// AI helper is set up, the web app can ask for Rocky to say it in his own words.
import { kidReport } from './kid.js';
import { TtlCache } from './cache.js';
import { AiError } from './ai.js';
import { isSnow } from './weathercodes.js';

const r = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// "2026-11-02T07:15" -> 7
const localHour = (forecast) => Number(/T(\d{2})/.exec(forecast.current?.time || '')?.[1] ?? 8);

export function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// What to wear, said the way a kid would hear it.
const WEAR = {
  raincoat: 'your rain jacket',
  boots: 'rain boots',
  umbrella: 'an umbrella',
  'winter-coat': 'a warm coat',
  jacket: 'a light jacket',
  beanie: 'a warm hat',
  mittens: 'mittens',
  'snow-boots': 'snow boots',
  sunglasses: 'sunglasses',
  'sun-hat': 'a sun hat',
  sunscreen: 'sunscreen',
  water: 'a water bottle',
};

// Build the briefing. `kid` is a kidReport (built here when left out).
export function buildBriefing(forecast, { alerts = [], air = null, kid, name = '', place = '' } = {}) {
  const k = kid || kidReport(forecast, { alerts, air });
  const c = forecast.current || {};
  const today = forecast.daily?.[0] || {};
  const hour = localHour(forecast);
  const first = String(name || '').trim().split(/\s+/)[0].slice(0, 30);
  const parts = [];
  const add = (id, text) => text && parts.push({ id, text });

  add('hello', `${greeting(hour)}${first ? `, ${first}` : ''}! It's Rocky with your weather${place ? ` for ${place}` : ''}.`);

  // Alerts first: calm and kind. Never scary words; point to a grown-up and the plan.
  const top = alerts.find((a) => /warning/i.test(a.event || '')) || alerts.find((a) => ['Extreme', 'Severe'].includes(a.severity)) || alerts[0];
  if (k.stormSafe?.active || alerts.length) {
    const serious = k.stormSafe?.active;
    const what = top?.event ? ` The weather service sent a ${top.event}.` : '';
    add('alert', serious
      ? `Heads up!${what} Stay close to a grown-up today and remember your family's safe spot plan. Grown-ups and weather helpers are keeping watch.`
      : `Heads up!${what} A grown-up can tell you more.`);
  }

  const now = r(c.temp);
  const high = r(today.high);
  const low = r(today.low);
  const sky = (today.kidLabel || c.kidLabel || c.label || '').replace(/[.!]+$/, '');
  let day = now != null ? `Right now it's ${now} degrees` : '';
  if (r(c.feelsLike) != null && now != null && Math.abs(r(c.feelsLike) - now) >= 4) day += `, but it feels like ${r(c.feelsLike)}`;
  if (day) day += '.';
  if (high != null && low != null) day += ` Today's high is ${high} and tonight's low is ${low}.`;
  if (sky) day += ` ${sky.charAt(0).toUpperCase()}${sky.slice(1)}.`;
  add('today', day.trim());

  const chance = r(today.precipChance);
  const wet = isSnow(today.code) || isSnow(c.code) ? 'snow' : 'rain';
  const tens = chance != null && chance >= 30 ? Math.max(3, Math.min(10, Math.round(chance / 10))) : null;
  if (tens) add('rain', tens >= 10 ? `${wet === 'snow' ? 'Snow' : 'Rain'} is on the way for sure today.` : `There's about a ${tens} in 10 chance of ${wet}.`);

  const wear = (k.checklist || []).map((i) => WEAR[i.id]).filter(Boolean).slice(0, 4);
  if (wear.length) add('wear', `Before you head out, grab ${joinList(wear)}.`);
  else if ((k.checklist || []).some((i) => i.id === 't-shirt')) add('wear', "It's t-shirt weather. Have fun!");
  else add('wear', 'No special gear needed today. Just your shoes and a smile!');

  const pg = k.playground;
  if (pg) {
    if (pg.rating === 'green') add('recess', 'Recess looks great for playing outside.');
    else if (pg.rating === 'yellow') add('recess', `Recess is okay with care. ${pg.reasons?.[0] || ''}`.trim());
    else add('recess', 'It looks like an inside day for recess.');
  }

  if (k.fact?.speech) add('fact', k.fact.speech);
  add('bye', 'Have an awesome day!');

  const text = parts.map((p) => p.text).join(' ');
  // A push notification body has little room, so it gets a terse version.
  const bits = [];
  if (parts.some((p) => p.id === 'alert')) bits.push(`Heads up: ${top?.event || 'stormy weather'}. Stay close to a grown-up.`);
  const temps = [now != null && `${now}° now`, high != null && `high ${high}°`, low != null && `low ${low}°`].filter(Boolean).join(', ');
  if (temps) bits.push(`${temps.charAt(0).toUpperCase()}${temps.slice(1)}.`);
  if (sky) bits.push(`${sky.charAt(0).toUpperCase()}${sky.slice(1)}${tens && tens < 10 ? ` (${tens} in 10 chance of ${wet})` : ''}.`);
  if (wear.length) bits.push(`Grab ${joinList(wear)}.`);
  let short = bits.join(' ');
  if (short.length > 220) short = `${short.slice(0, 217).replace(/\s+\S*$/, '')}…`;
  return {
    title: `🦝 ${greeting(hour)}! Rocky's weather${place ? ` for ${place}` : ''}`,
    text,
    short,
    parts,
    date: k.date || (c.time || '').slice(0, 10),
    alert: parts.some((p) => p.id === 'alert'),
    raccoon: k.raccoon,
  };
}

const AI_ASK = (b) => `Here is this morning's weather briefing for a child, written from a template:

"${b.text}"

Say it again as Rocky the raccoon in your own words, ready to be read aloud: 4 to 7 short sentences, plain text, no lists, no emoji. Keep every number, what to wear, and any safety note exactly right. Do not add weather that is not in the briefing.`;

export function registerBriefing(app, { ai, forecast, alerts, air, settle, loc }) {
  const aiCache = new TtlCache({ max: 200 });
  const where = {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    units: { type: 'string', enum: ['imperial', 'metric'] },
    place: { type: 'string', maxLength: 80 },
    name: { type: 'string', maxLength: 60 },
    ai: { type: 'boolean' },
  };

  app.get('/api/briefing', { schema: { querystring: { type: 'object', required: ['lat', 'lon'], properties: where } } }, async (req) => {
    const l = loc(req.query);
    const [fc, al, aq] = await Promise.all([forecast(l), settle(alerts(l)), settle(air(l))]);
    const b = buildBriefing(fc, { alerts: al?.alerts || [], air: aq, name: req.query.name, place: req.query.place });
    const out = { ...b, ai: false };
    if (!req.query.ai || !ai.enabled) return out;
    // One AI version per place, wording and half hour, shared by everyone asking.
    try {
      const said = await aiCache.wrap(`${l.lat},${l.lon}|${b.text}`, 30 * 60_000, async () => {
        const res = await ai.chat({ messages: [{ role: 'user', content: AI_ASK(b) }], kidMode: true, context: `Briefing for ${req.query.place || 'the family'} on ${b.date}.` });
        return (res.answer || '').trim();
      });
      if (said && said.length <= 1400) return { ...out, text: said, ai: true, template: b.text };
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      req.log.warn({ err: err.message }, 'AI briefing failed, using the template');
    }
    return out;
  });
}
