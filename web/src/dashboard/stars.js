// Turn tonight's cloud forecast into a stargazing verdict.

// Average cloud cover for the first part of the night (the hours kids are
// actually awake), from the hourly forecast.
export function skyVerdict(hourly, dark, kid = false) {
  if (!dark || !hourly?.length) return null;
  const from = Date.parse(dark.from);
  const until = Math.min(Date.parse(dark.until), from + 5 * 3_600_000);
  const hours = hourly.filter((h) => h.epoch >= from - 1_800_000 && h.epoch <= until && h.cloudCover != null);
  if (!hours.length) return null;
  const cloud = Math.round(hours.reduce((s, h) => s + h.cloudCover, 0) / hours.length);
  const wet = hours.some((h) => (h.precipChance ?? 0) >= 50);
  if (wet || cloud >= 75) {
    return { cloud, rating: 'cloudy', emoji: '☁️', text: kid ? 'Clouds will hide most of the sky tonight. Maybe tomorrow!' : `Mostly cloudy this evening (${cloud}% cloud cover). Not a great night for the sky.` };
  }
  if (cloud >= 35) {
    return { cloud, rating: 'partly', emoji: '⛅', text: kid ? 'Some clouds, but you might spot bright planets between them.' : `Partly cloudy (${cloud}%). Bright planets and the Moon should peek through the gaps.` };
  }
  return { cloud, rating: 'clear', emoji: '✨', text: kid ? 'Clear skies tonight! A great night to look up.' : `Clear this evening (${cloud}% cloud cover). Good night for stargazing.` };
}

// A clock time in the place's own time zone.
export function skyTime(isoTime, timeZone) {
  if (!isoTime) return '';
  try {
    return new Date(isoTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone });
  } catch {
    return new Date(isoTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}
