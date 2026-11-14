// Space weather: what the Sun is doing right now, from NOAA's Space Weather
// Prediction Center (free, no key).
// - NOAA scales: R (radio blackouts from flares), S (solar radiation storms),
//   G (geomagnetic storms), now and the next 3 days with their odds
// - X-ray flares: the latest and the biggest in the last day
// - the solar wind: speed and the north-south magnetic field (Bz) at L1
// - Kp, from the same forecast the aurora card uses
import { fetchJson, UpstreamError } from './cache.js';

export const SCALES_URL = 'https://services.swpc.noaa.gov/products/noaa-scales.json';
export const FLARES_URL = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json';
export const WIND_SPEED_URL = 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json';
export const WIND_MAG_URL = 'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json';
const SOURCE = 'NOAA Space Weather Prediction Center';
const MIN = 60_000;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// What each scale means, in grown-up and kid words.
export const SCALE_INFO = {
  R: {
    name: 'Radio blackouts', cause: 'solar flares',
    words: ['None', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'],
    adult: 'X-ray bursts from flares can fade shortwave radio and GPS on the sunlit side of Earth for minutes to hours.',
    kid: 'A flare is a giant flash on the Sun. Its X-rays reach us in 8 minutes and can make some radios crackle.',
  },
  S: {
    name: 'Solar radiation storms', cause: 'fast particles from the Sun',
    words: ['None', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'],
    adult: 'Energetic protons matter for astronauts, satellites and polar flights. Our atmosphere keeps them away from people on the ground.',
    kid: 'Super-fast bits of the Sun zoom toward Earth. Our air and magnetic field keep us safe on the ground!',
  },
  G: {
    name: 'Geomagnetic storms', cause: 'solar wind and eruptions hitting Earth’s magnetic field',
    words: ['None', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'],
    adult: 'Storms push the aurora toward the equator and can disturb power grids, satellites and GPS when strong.',
    kid: 'When a puff of the Sun hits Earth’s magnetic bubble, the bubble shakes and the northern lights dance farther south.',
  },
};

// noaa-scales.json: { "-1": yesterday, "0": now, "1".."3": forecast days }.
export function parseScales(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const one = (x) => {
    if (!x) return null;
    const lvl = (s) => {
      const n = num(s?.Scale);
      return n == null ? null : Math.max(0, Math.min(5, n));
    };
    return {
      date: x.DateStamp || null,
      R: { level: lvl(x.R), minor: num(x.R?.MinorProb), major: num(x.R?.MajorProb) },
      S: { level: lvl(x.S), chance: num(x.S?.Prob) },
      G: { level: lvl(x.G) },
    };
  };
  const forecast = ['1', '2', '3'].map((k) => one(raw[k])).filter(Boolean);
  return { now: one(raw['0']), yesterday: one(raw['-1']), forecast };
}

// "M1.9" -> 1.9e-5 W/m², so flares can be compared.
const CLASS_BASE = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 };
export function flareFlux(cls) {
  const m = String(cls || '').trim().match(/^([ABCMX])(\d+(?:\.\d+)?)?$/i);
  return m ? CLASS_BASE[m[1].toUpperCase()] * Number(m[2] || 1) : null;
}

export function flareWords(cls) {
  const c = String(cls || '').charAt(0).toUpperCase();
  if (c === 'X') return { size: 'Major', kid: 'a giant flare, the biggest kind!' };
  if (c === 'M') return { size: 'Medium', kid: 'a medium flare that can make radios crackle.' };
  if (c === 'C') return { size: 'Small', kid: 'a small flare. Happens all the time.' };
  return { size: 'Tiny', kid: 'a tiny blip. The Sun is calm.' };
}

// The 7-day flare list -> the latest flare and the biggest in the last 24 hours and 7 days.
export function summarizeFlares(list, now = Date.now()) {
  const flares = (Array.isArray(list) ? list : [])
    .map((f) => ({ cls: f.max_class || null, peak: f.max_time || f.time_tag || null, begin: f.begin_time || null, end: f.end_time || null }))
    .filter((f) => flareFlux(f.cls) && Date.parse(f.peak));
  flares.sort((a, b) => Date.parse(b.peak) - Date.parse(a.peak));
  const biggest = (xs) => xs.reduce((a, f) => (!a || flareFlux(f.cls) > flareFlux(a.cls) ? f : a), null);
  const day = flares.filter((f) => now - Date.parse(f.peak) <= 24 * 3600_000);
  const notable = flares.filter((f) => /^[MX]/i.test(f.cls));
  return {
    latest: flares[0] || null,
    biggest24h: biggest(day),
    biggest7d: biggest(flares),
    count24h: day.length,
    notable7d: notable.length,
  };
}

// Solar wind: speed (km/s) and Bz (nT). Southward Bz (negative) lets energy in.
export function solarWind(speedRaw, magRaw) {
  const pick = (r) => (Array.isArray(r) ? r[0] : r) || {};
  const s = pick(speedRaw);
  const m = pick(magRaw);
  const speed = num(s.proton_speed ?? s.WindSpeed);
  const bz = num(m.bz_gsm ?? m.Bz);
  const bt = num(m.bt ?? m.Bt);
  const speedWord = speed == null ? null : speed >= 700 ? 'very fast' : speed >= 500 ? 'fast' : speed >= 350 ? 'normal' : 'slow';
  let bzWord = null;
  if (bz != null) bzWord = bz <= -10 ? 'strongly south (aurora fuel)' : bz <= -5 ? 'south (good for aurora)' : bz < 0 ? 'slightly south' : 'north (blocks most energy)';
  return { speed: speed == null ? null : Math.round(speed), speedWord, bz, bt, bzWord, at: s.time_tag || m.time_tag || null };
}

// The whole picture, plus a one-line headline and a kid line.
export function spaceWeather({ scales, flares, wind, kpRows, now = Date.now() }) {
  const nowKp = (kpRows || []).filter((r) => r.t <= now).at(-1) || null;
  const next = (kpRows || []).filter((r) => r.t > now && r.t < now + 72 * 3600_000);
  const peak = next.reduce((a, r) => (a == null || r.kp > a.kp ? r : a), null);
  const cur = scales?.now || null;
  const g = cur?.G?.level ?? 0;
  const r = cur?.R?.level ?? 0;
  const s = cur?.S?.level ?? 0;
  const worst = Math.max(g, r, s);
  const ahead = (scales?.forecast || []).reduce((mx, d) => Math.max(mx, d.G.level ?? 0), 0);
  const big = flares?.biggest24h;
  let headline;
  let kid;
  if (worst >= 3) {
    headline = `A strong space weather event is under way (${[g >= 3 && `G${g}`, r >= 3 && `R${r}`, s >= 3 && `S${s}`].filter(Boolean).join(', ')}).`;
    kid = 'The Sun is having a big stormy day! Satellites are on alert, and the northern lights could show up far south.';
  } else if (g >= 1) {
    headline = `A G${g} geomagnetic storm is going on. The aurora may reach farther south than usual.`;
    kid = 'Earth’s magnetic bubble is wobbling from a Sun storm. Look for the northern lights after dark!';
  } else if (big && /^[MX]/i.test(big.cls)) {
    headline = `The Sun fired a ${big.cls} flare in the last day. Earth’s magnetic field is calm for now.`;
    kid = `The Sun just made ${flareWords(big.cls).kid} Scientists are watching to see if anything heads our way.`;
  } else if (ahead >= 1) {
    headline = `Calm now, but a G${ahead} storm is in the 3-day forecast.`;
    kid = 'Calm right now, but forecasters think a Sun puff may reach Earth in the next few days.';
  } else {
    headline = 'Space weather is quiet. No storms now or in the 3-day forecast.';
    kid = 'The Sun is calm today. Its light and warmth are reaching us like normal.';
  }
  return {
    headline,
    kid,
    scales,
    flares,
    wind,
    kp: { now: nowKp ? Math.round(nowKp.kp * 10) / 10 : null, peak3d: peak ? Math.round(peak.kp * 10) / 10 : null, peakAt: peak ? new Date(peak.t).toISOString() : null },
    info: SCALE_INFO,
    source: SOURCE,
  };
}

export class SpaceWeatherService {
  constructor(cache, fetchImpl, { aurora, log = console } = {}) {
    this.cache = cache;
    this.fetchImpl = fetchImpl;
    this.aurora = aurora;
    this.log = log;
  }

  part(key, url, ttl, parse) {
    return this.cache.wrap(`space:${key}`, ttl, async () => parse(await fetchJson(url, { source: 'swpc', fetchImpl: this.fetchImpl, timeoutMs: 15000 })))
      .catch((err) => {
        this.log.warn?.({ err: err.message, part: key }, 'space weather part unavailable');
        return null;
      });
  }

  async now(now = Date.now()) {
    const [scales, flareList, speed, mag, kpRows] = await Promise.all([
      this.part('scales', SCALES_URL, 15 * MIN, parseScales),
      this.part('flares', FLARES_URL, 10 * MIN, (x) => x),
      this.part('speed', WIND_SPEED_URL, 5 * MIN, (x) => x),
      this.part('mag', WIND_MAG_URL, 5 * MIN, (x) => x),
      this.aurora ? this.aurora.kp().catch(() => null) : null,
    ]);
    if (!scales && !flareList && !speed && !kpRows) {
      throw new UpstreamError('NOAA space weather', 502);
    }
    return spaceWeather({
      scales,
      flares: flareList ? summarizeFlares(flareList, now) : null,
      wind: speed || mag ? solarWind(speed, mag) : null,
      kpRows: kpRows || [],
      now,
    });
  }
}

export function registerSpaceWeather(app, { space }) {
  app.get('/api/sky/space', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=120');
    return space.now();
  });
}
