// Helpers for the NWS Detailed Forecast card.

const SKY = [
  [/thunder|t-storm/i, '⛈️', '⛈️'],
  [/blizzard|snow|flurr/i, '🌨️', '🌨️'],
  [/sleet|freezing|ice/i, '🧊', '🧊'],
  [/rain|shower|drizzle/i, '🌧️', '🌧️'],
  [/fog|haze|smoke/i, '🌫️', '🌫️'],
  [/wind|breezy|blustery/i, '💨', '💨'],
  [/mostly sunny|mostly clear/i, '🌤️', '🌙'],
  [/partly/i, '⛅', '☁️'],
  [/mostly cloudy/i, '🌥️', '☁️'],
  [/cloudy|overcast/i, '☁️', '☁️'],
  [/sunny|clear|fair/i, '☀️', '🌙'],
];

/** An emoji for a period's short forecast ("Showers Likely" → 🌧️). */
export function periodEmoji(p) {
  const hit = SKY.find(([re]) => re.test(p?.short || ''));
  if (!hit) return p?.isDaytime === false ? '🌙' : '🌡️';
  return p.isDaytime === false ? hit[2] : hit[1];
}

/** "High near 73°" / "Low around 62°" for the kid view. */
export function tempPhrase(p) {
  if (p?.temp == null) return '';
  return `${p.isDaytime ? 'High' : 'Low'} ${p.isDaytime ? 'near' : 'around'} ${p.temp}°`;
}

/** How many periods a card shows before "Show all". */
export const visibleCount = (size, total, all) => (all || size === 'l' ? total : Math.min(total, 6));
