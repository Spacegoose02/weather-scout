// Small pure helpers for the storm picture of the day.
export const KIND_LABEL = { tornado: '🌪️ Tornado', lightning: '⚡ Lightning', storm: '⛈️ Storm' };
export const STORM_GAZER_DAYS = 7;

// What Rocky reads out loud: the caption, the fun fact, a safety line, and who took it.
export function stormPhotoSpeech(photo) {
  if (!photo) return '';
  const who = photo.credit?.artist && photo.credit.artist !== 'Unknown photographer' ? ` This picture was taken by ${photo.credit.artist}.` : '';
  return [photo.caption, photo.fact ? `Here's a fun fact. ${photo.fact}` : '', photo.rocky || '', who.trim()]
    .filter(Boolean)
    .join(' ');
}

// Days a kid listened to the storm picture (last 30), for the Storm Gazer badge.
// Returns the same array when today is already counted.
export function countStormDay(days = [], date) {
  const list = Array.isArray(days) ? days : [];
  if (!date || list.includes(date)) return days;
  return [...list, date].slice(-30);
}
