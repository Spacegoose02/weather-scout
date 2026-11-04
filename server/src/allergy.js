// Allergies & breathing: pollen by plant group, the particle and ozone breakdown, and
// one plain "how is the air for asthma today" outlook. Pure functions over the
// normalized air-quality and forecast data, so they are easy to test.
//
// Pollen can come from any source that fills air.pollen as { tree, grass, weed }, each
// { value, level } with level None / Low / Moderate / High / Very high. Open-Meteo
// (Europe) gives grains/m³ by plant and by hour; the Google Pollen API (US and more,
// needs a key) gives a 0-5 Universal Pollen Index per day, with unit: 'index'.
const MISSING = {
  'needs-key': 'Pollen counts for this place need a free Google Pollen API key. An admin can add one under Family & settings, Pollen counts.',
  failed: 'The pollen service did not answer just now. It will try again soon.',
  'no-data': 'No pollen counts for this place right now.',
};

const POLLEN_RANK = { None: 0, Low: 0, Moderate: 1, High: 2, 'Very high': 3 };
const GROUPS = {
  tree: { name: 'Tree', emoji: '🌳', season: 'Late winter to spring' },
  grass: { name: 'Grass', emoji: '🌾', season: 'Late spring and summer' },
  weed: { name: 'Weed', emoji: '🌼', season: 'Late summer and fall (ragweed)' },
};

// US EPA AQI bands, used for each pollutant's own sub-index.
const AQI_BANDS = [
  [50, 'Good', 'green'],
  [100, 'Moderate', 'yellow'],
  [150, 'Unhealthy for sensitive groups', 'orange'],
  [200, 'Unhealthy', 'red'],
  [300, 'Very unhealthy', 'purple'],
  [Infinity, 'Hazardous', 'maroon'],
];
const band = (aqi) => (aqi == null ? null : AQI_BANDS.find(([max]) => aqi <= max));

export const PARTICLES = {
  pm25: {
    name: 'PM2.5',
    long: 'Fine particles',
    what: 'Smoke, soot and haze small enough to reach deep into the lungs.',
    sensitive: 'Wildfire smoke and haze. People with asthma, heart or lung problems, kids and older adults feel it first.',
  },
  pm10: {
    name: 'PM10',
    long: 'Coarse particles',
    what: 'Dust, pollen pieces and mold bits that mostly irritate the nose and throat.',
    sensitive: 'Dusty, windy days. Can set off coughing and itchy eyes.',
  },
  ozone: {
    name: 'Ozone',
    long: 'Ground-level ozone',
    what: 'Forms when sunlight cooks car and factory fumes. Worst on hot, sunny afternoons.',
    sensitive: 'Tightens airways during exercise. Plan hard outdoor activity for the morning.',
  },
  no2: {
    name: 'NO₂',
    long: 'Nitrogen dioxide',
    what: 'Traffic exhaust, highest near busy roads at rush hour.',
    sensitive: 'Can make asthma worse near heavy traffic.',
  },
};

const hourClock = (t) => {
  const h = Number(t.slice(11, 13));
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

export function pollenReport(air) {
  const p = air?.pollen;
  if (!p) return { available: false, note: MISSING[air?.pollenMissing] || 'No pollen counts for this place from the free data yet.' };
  const groups = Object.keys(GROUPS)
    .map((id) => ({ id, ...GROUPS[id], value: p[id]?.value ?? null, level: p[id]?.level ?? null, inSeason: p[id]?.inSeason ?? null }))
    .filter((g) => g.value != null || g.level != null);
  const top = groups.reduce((a, b) => ((POLLEN_RANK[b.level] ?? -1) > (POLLEN_RANK[a?.level] ?? -1) ? b : a), null);
  const species = [...(p.species || [])].sort((a, b) => b.value - a.value);
  const daily = (air.pollenDaily || []).map((d) => ({
    date: d.date,
    groups: Object.keys(GROUPS).map((id) => ({ id, value: d[id]?.value ?? null, level: d[id]?.level ?? null })),
  }));
  // Peak hour for the worst group today, when the source has hourly counts.
  let peak = null;
  if (top) {
    const today = (air.hourly || []).filter((h) => h.pollen?.[top.id] != null).slice(0, 24);
    for (const h of today) if (!peak || h.pollen[top.id] > peak.value) peak = { time: h.time, value: h.pollen[top.id] };
  }
  return {
    available: true,
    groups,
    top: top && (POLLEN_RANK[top.level] ?? 0) >= 1 ? { id: top.id, name: top.name, level: top.level } : null,
    species,
    daily,
    peak,
    unit: p.unit || null,
    scaleMax: p.scaleMax ?? null,
    source: p.source || air.source || null,
  };
}

export function particleReport(air) {
  if (!air) return [];
  const hourly = (air.hourly || []).slice(0, 24);
  return Object.keys(PARTICLES)
    .map((id) => {
      const value = air[id] ?? null;
      const aqi = air.subIndex?.[id] ?? null;
      if (value == null && aqi == null) return null;
      const b = band(aqi);
      // When in the next day this one is worst.
      let peak = null;
      for (const h of hourly) {
        const v = h.sub?.[id];
        if (v != null && (!peak || v > peak.aqi)) peak = { aqi: v, time: h.time };
      }
      return {
        id,
        ...PARTICLES[id],
        value,
        unit: 'µg/m³',
        aqi,
        level: b?.[1] ?? null,
        color: b?.[2] ?? '',
        peak: peak && { ...peak, level: band(peak.aqi)[1], color: band(peak.aqi)[2] },
      };
    })
    .filter(Boolean);
}

// One outlook for asthma and other breathing trouble, with the reasons spelled out.
export function breathingOutlook(air, forecast, now = Date.now()) {
  const reasons = [];
  let score = 0;
  const bump = (n, text) => {
    score = Math.max(score, n);
    reasons.push({ level: n, text });
  };
  const metric = forecast?.units?.temp === '°C';
  const c = forecast?.current || {};

  if (air?.aqi != null) {
    if (air.aqi > 150) bump(3, `The air quality index is ${Math.round(air.aqi)}, unhealthy for everyone.`);
    else if (air.aqi > 100) bump(2, `The air quality index is ${Math.round(air.aqi)}, unhealthy for sensitive groups.`);
    else if (air.aqi > 50) bump(1, `Moderate air (AQI ${Math.round(air.aqi)}). Most people are fine.`);
  }
  const parts = particleReport(air);
  const ozone = parts.find((x) => x.id === 'ozone');
  if (ozone?.peak && ozone.peak.aqi > 100) bump(2, `Ozone climbs to unhealthy for sensitive groups around ${hourClock(ozone.peak.time)}. Exercise outside in the morning.`);
  const pm = parts.find((x) => x.id === 'pm25');
  if (pm?.peak && pm.peak.aqi > 100) bump(2, `Fine particles (smoke or haze) peak around ${hourClock(pm.peak.time)}.`);

  const pollen = pollenReport(air);
  if (pollen.top) {
    const r = POLLEN_RANK[pollen.top.level];
    bump(r >= 3 ? 3 : r, `${pollen.top.name} pollen is ${pollen.top.level.toLowerCase()}.`);
  }

  // Weather triggers, which work everywhere even without pollen data.
  const next = (forecast?.hourly || []).filter((h) => h.epoch >= now - 3600_000 && h.epoch <= now + 24 * 3600_000);
  const storms = next.some((h) => [95, 96, 99].includes(h.code));
  const grassHigh = (POLLEN_RANK[pollen.groups?.find((g) => g.id === 'grass')?.level] ?? 0) >= 2;
  if (storms && grassHigh) bump(3, 'Thunderstorms plus high grass pollen can cause "thunderstorm asthma". Stay inside with windows shut when the storm gusts arrive.');
  else if (storms) bump(1, 'Thunderstorm gusts can stir up pollen and mold spores.');
  const coldF = c.temp == null ? null : metric ? (c.temp * 9) / 5 + 32 : c.temp;
  if (coldF != null && coldF <= 32) bump(1, 'Cold air can tighten airways. A scarf over the nose and mouth warms it up.');
  const dewF = c.dewPoint == null ? null : metric ? (c.dewPoint * 9) / 5 + 32 : c.dewPoint;
  if (dewF != null && dewF >= 70) bump(1, 'Very humid, heavy air makes breathing feel harder for some people.');
  if (dewF != null && dewF < 25) bump(1, 'Very dry air can irritate the nose and throat.');
  const windy = next.some((h) => (metric ? h.windGust / 1.609 : h.windGust) >= 30);
  if (windy && pollen.top) bump(Math.min(3, POLLEN_RANK[pollen.top.level] + 1), 'Strong gusts will spread pollen around.');
  const rainSoon = next.slice(0, 12).some((h) => (h.precip || 0) >= 0.02 * (metric ? 25.4 : 1));
  if (rainSoon && pollen.top && !storms) reasons.push({ level: 0, text: 'Steady rain will wash pollen out of the air for a while.' });

  // The best daylight hour for being outside: lowest AQI and pollen.
  const airHours = (air?.hourly || []).slice(0, 24);
  const dayHours = new Set(next.filter((h) => h.isDay).map((h) => h.time));
  const scored = airHours
    .filter((h) => dayHours.has(h.time) && h.aqi != null)
    .map((h) => ({ time: h.time, aqi: h.aqi, score: h.aqi + 20 * Math.max(0, ...Object.values(h.pollen || {}).filter((v) => v != null).map((v) => Math.log10(1 + v))) }));
  const best = scored.length ? scored.reduce((a, b) => (b.score < a.score ? b : a)) : null;

  const LEVELS = [
    ['Good', 'green', 'A good day for most people with asthma or allergies.'],
    ['Fair', 'yellow', 'Most people are fine. Very sensitive folks may notice it.'],
    ['Poor', 'orange', 'Allergy and asthma symptoms are likely. Keep your inhaler or allergy medicine handy.'],
    ['Bad', 'red', 'Hard day for breathing. Limit time outside and keep windows closed.'],
  ];
  const [label, color, advice] = LEVELS[score];
  return {
    level: label,
    color,
    advice,
    reasons: reasons.sort((a, b) => b.level - a.level),
    best: best && { time: best.time, aqi: best.aqi },
  };
}

export function allergyReport(air, forecast, now = Date.now()) {
  return {
    pollen: pollenReport(air),
    particles: particleReport(air),
    breathing: breathingOutlook(air, forecast, now),
  };
}
