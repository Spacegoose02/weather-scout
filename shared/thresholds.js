// Personal weather alerts: "rain starts in 20 minutes", frost tonight, strong
// gusts, dangerous heat, snow on the way and a chance of the northern lights.
// Each device picks the ones it wants (and its own numbers). The server checks
// them against the cached forecast every few minutes and sends each one once.
//
// Pure functions only, shared by the server (push loop) and the web app (form).

export const RULE_IDS = ['rain', 'freeze', 'gust', 'heat', 'snow', 'aurora'];

// Default numbers, and what each person can pick from.
export const RULE_CHOICES = {
  imperial: {
    freeze: { default: 32, options: [28, 32, 36, 40], unit: '°F' },
    gust: { default: 40, options: [25, 30, 40, 50, 60], unit: 'mph' },
    heat: { default: 100, options: [90, 95, 100, 105, 110], unit: '°F' },
  },
  metric: {
    freeze: { default: 0, options: [-2, 0, 2, 4], unit: '°C' },
    gust: { default: 65, options: [40, 50, 65, 80, 100], unit: 'km/h' },
    heat: { default: 38, options: [32, 35, 38, 41, 43], unit: '°C' },
  },
};

export const RULE_INFO = {
  rain: { emoji: '🌧️', name: 'Rain or snow starting soon', note: 'When it is dry now and the next hour says rain or snow, about 15 to 60 minutes ahead.' },
  freeze: { emoji: '🥶', name: 'Frost or freeze tonight', note: 'When the low in the next 18 hours drops to your number. Cover plants, bring pets in.' },
  gust: { emoji: '💨', name: 'Strong wind gusts', note: 'When gusts in the next 12 hours reach your number.' },
  heat: { emoji: '🥵', name: 'Dangerous heat', note: 'When it will feel this hot in the next 12 hours.' },
  snow: { emoji: '❄️', name: 'Snow on the way', note: 'When snow will pile up in the next 12 hours.' },
  aurora: { emoji: '🌌', name: 'Northern lights possible', note: 'When the space weather forecast says the aurora may reach your sky tonight and it is not too cloudy.' },
};

// Wet enough to count as "it's raining" in one 15-minute slot.
const WET = { imperial: 0.005, metric: 0.1 };
const SNOW_MIN = { imperial: 0.5, metric: 1 }; // inches or cm in 12 hours
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
// Quiet hours: nothing from these alerts between 9 PM and 7 AM local time.
export const QUIET_FROM = 21;
export const QUIET_UNTIL = 7;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// Make whatever a device sent safe to store: unknown keys dropped, numbers
// clamped to a sane range. Returns null when nothing is turned on.
export function cleanRules(input, units = 'imperial') {
  if (!input || typeof input !== 'object') return null;
  const u = units === 'metric' ? 'metric' : 'imperial';
  const clamp = (v, lo, hi) => (v == null ? null : Math.max(lo, Math.min(hi, Math.round(v))));
  const r = {
    units: u,
    rain: !!input.rain,
    freeze: input.freeze === false ? null : clamp(num(input.freeze), u === 'metric' ? -30 : -20, u === 'metric' ? 10 : 50),
    gust: input.gust === false ? null : clamp(num(input.gust), u === 'metric' ? 20 : 15, u === 'metric' ? 200 : 120),
    heat: input.heat === false ? null : clamp(num(input.heat), u === 'metric' ? 25 : 80, u === 'metric' ? 55 : 130),
    snow: !!input.snow,
    aurora: !!input.aurora,
    quiet: input.quiet !== false,
  };
  return anyRule(r) ? r : null;
}

export const anyRule = (r) => !!r && (r.rain || r.freeze != null || r.gust != null || r.heat != null || r.snow || r.aurora);

// Local wall-clock helpers. Open-Meteo times are local strings like 2026-11-04T17:00.
const localIso = (epoch, offsetSec) => new Date(epoch + offsetSec * 1000).toISOString().slice(0, 16);
const localHour = (epoch, offsetSec) => new Date(epoch + offsetSec * 1000).getUTCHours();

export function clockLabel(localTime) {
  const [h, m] = (localTime || '').slice(11, 16).split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  const hh = h % 12 || 12;
  return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export const isQuiet = (hour) => hour >= QUIET_FROM || hour < QUIET_UNTIL;

const r0 = (n) => Math.round(n);
const amount = (v, units) => (units === 'metric' ? `${Math.round(v)} cm` : `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} in`);

// What should go out right now? `fc` is a normalized forecast (providers/openmeteo.js)
// fetched in the rules' units. `aurora` is the aurora outlook for the place, or null.
// Each event has a `key` that is the same for the same event, so it is sent once.
export function evaluateRules(fc, rules, { now = Date.now(), aurora = null } = {}) {
  if (!fc || !anyRule(rules)) return [];
  const units = rules.units || 'imperial';
  const off = fc.utcOffsetSeconds || 0;
  const today = localIso(now, off).slice(0, 10);
  if (rules.quiet && isQuiet(localHour(now, off))) return [];
  const u = fc.units || {};
  const tempU = u.temp || (units === 'metric' ? '°C' : '°F');
  const windU = u.wind || (units === 'metric' ? 'km/h' : 'mph');
  const hours = (fc.hourly || []).filter((h) => h.epoch >= now - 30 * 60_000);
  const within = (ms) => hours.filter((h) => h.epoch <= now + ms);
  const out = [];

  if (rules.rain) {
    const wet = WET[units];
    const slots = (fc.minutely || []).map((m) => ({ ...m, epoch: Date.parse(`${m.time}Z`) - off * 1000 }));
    const nowSlot = slots.filter((s) => s.epoch <= now).at(-1);
    const dryNow = (fc.current?.precip ?? 0) < wet && (nowSlot?.precip ?? 0) < wet;
    const next = slots.find((s) => s.epoch > now && s.epoch <= now + 60 * 60_000 && (s.precip ?? 0) >= wet);
    if (dryNow && next) {
      const mins = Math.max(5, Math.round((next.epoch - now) / 60_000 / 5) * 5);
      const snow = SNOW_CODES.has(next.code);
      const start = localIso(next.epoch, off);
      out.push({
        rule: 'rain',
        key: `rain:${start.slice(0, 10)}:${Math.floor(Number(start.slice(11, 13)) / 3)}`,
        title: `${snow ? '🌨️ Snow' : '🌧️ Rain'} starting in about ${mins} minutes`,
        body: `${snow ? 'Snow' : 'Rain'} should reach {place} around ${clockLabel(start)}. Grab ${snow ? 'a warm coat' : 'an umbrella'} and bring in anything that should stay dry.`,
      });
    }
  }

  if (rules.freeze != null) {
    const next = within(18 * 3600_000).filter((h) => h.temp != null);
    const low = next.reduce((a, h) => (a == null || h.temp < a.temp ? h : a), null);
    const nowTemp = fc.current?.temp ?? next[0]?.temp;
    if (low && low.temp <= rules.freeze && nowTemp > rules.freeze) {
      const hard = low.temp <= (units === 'metric' ? -2 : 28);
      out.push({
        rule: 'freeze',
        key: `freeze:${low.time.slice(0, 10)}`,
        title: `🥶 ${hard ? 'Hard freeze' : low.temp <= (units === 'metric' ? 0 : 32) ? 'Freeze' : 'Frost'} tonight: low of ${r0(low.temp)}${tempU}`,
        body: `It should drop to ${r0(low.temp)}${tempU} around ${clockLabel(low.time)}. Cover tender plants, bring pets inside${hard ? ' and protect outdoor pipes' : ''}.`,
      });
    }
  }

  if (rules.gust != null) {
    const peak = within(12 * 3600_000).reduce((a, h) => (h.windGust != null && (a == null || h.windGust > a.windGust) ? h : a), null);
    if (peak && peak.windGust >= rules.gust) {
      out.push({
        rule: 'gust',
        key: `gust:${peak.time.slice(0, 10)}`,
        title: `💨 Gusts up to ${r0(peak.windGust)} ${windU}`,
        body: `The strongest gusts should come around ${clockLabel(peak.time)}${peak.time.slice(0, 10) === today ? '' : ' tomorrow'}. Tie down trash cans, trampolines and patio furniture.`,
      });
    }
  }

  if (rules.heat != null) {
    const peak = within(12 * 3600_000).reduce((a, h) => (h.feelsLike != null && (a == null || h.feelsLike > a.feelsLike) ? h : a), null);
    if (peak && peak.feelsLike >= rules.heat) {
      out.push({
        rule: 'heat',
        key: `heat:${peak.time.slice(0, 10)}`,
        title: `🥵 Feels like ${r0(peak.feelsLike)}${tempU} today`,
        body: `The worst heat comes around ${clockLabel(peak.time)}. Drink water often, take shade breaks, and never leave kids or pets in a car.`,
      });
    }
  }

  if (rules.snow) {
    const next = within(12 * 3600_000);
    const total = next.reduce((s, h) => s + (h.snow || 0), 0);
    const first = next.find((h) => (h.snow || 0) > 0);
    if (first && total >= SNOW_MIN[units]) {
      out.push({
        rule: 'snow',
        key: `snow:${first.time.slice(0, 10)}`,
        title: `❄️ About ${amount(total, units)} of snow on the way`,
        body: `Snow should start around ${clockLabel(first.time)}${first.time.slice(0, 10) === today ? '' : ' tomorrow'}. Find the boots and sleds, and leave extra time on the roads.`,
      });
    }
  }

  if (rules.aurora && aurora && (aurora.chance === 'likely' || aurora.chance === 'possible') && !(aurora.cloudsTonight >= 80)) {
    out.push({
      rule: 'aurora',
      key: `aurora:${today}`,
      title: `🌌 ${aurora.chance === 'likely' ? 'Northern lights likely' : 'Northern lights possible'} tonight`,
      body: `${aurora.text} Look ${aurora.look || 'north'}, away from city lights, after it gets dark.`,
      url: '/?aurora=1',
    });
  }

  return out;
}
