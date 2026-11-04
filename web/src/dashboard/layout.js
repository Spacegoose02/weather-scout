// The dashboard card catalog and the pure layout helpers (add, remove, move,
// resize). A layout is { cards: [{ id, size }] } in display order. Sizes:
// s = a third of the row, m = half, l = the whole row (on a phone every card
// is full width).

export const SIZES = ['s', 'm', 'l'];
export const SIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Wide' };

// `sizes` lists the sizes a card looks right at; `signIn` cards need an account
// because they save something. `group` is the heading it sits under in
// "Add cards" (see CARD_GROUPS).
export const CARD_GROUPS = [
  ['weather', '🌦️ Weather'],
  ['outdoors', '🌳 Outdoors & sky'],
  ['family', '👪 Family & kids'],
];

export const CARDS = [
  { id: 'current', group: 'weather', title: 'Right now', emoji: '🌡️', sizes: ['m', 'l'], blurb: 'Temperature, feels like and the sky' },
  { id: 'forecast', group: 'weather', title: '10-day forecast', emoji: '📅', sizes: ['s', 'm', 'l'], blurb: 'Highs, lows and rain chances' },
  { id: 'textfc', group: 'weather', title: 'Detailed forecast', emoji: '📝', sizes: ['m', 'l'], blurb: 'The National Weather Service forecast in words, day and night' },
  { id: 'hourly', group: 'weather', title: '48-hour timeline', emoji: '⏱️', sizes: ['m', 'l'], blurb: 'Hour-by-hour chart with a scrubber' },
  { id: 'radar', group: 'weather', title: 'Radar', emoji: '📡', sizes: ['s', 'm', 'l'], blurb: 'Live NEXRAD loop around you' },
  { id: 'cameras', group: 'weather', title: 'Nearby cameras', emoji: '📷', sizes: ['s', 'm', 'l'], blurb: 'The closest road cameras, live when they can be' },
  { id: 'alerts', group: 'weather', title: 'Alerts', emoji: '⚠️', sizes: ['s', 'm', 'l'], blurb: 'Watches and warnings for this place' },
  { id: 'rain', group: 'weather', title: 'Next 2 hours', emoji: '☔', sizes: ['s', 'm', 'l'], blurb: 'Minute-by-minute rain and snow' },
  { id: 'wind', group: 'weather', title: 'Wind', emoji: '🌬️', sizes: ['s', 'm', 'l'], blurb: 'Compass, gusts and a 24-hour chart' },
  { id: 'details', group: 'weather', title: 'Details', emoji: '📋', sizes: ['s', 'm', 'l'], blurb: 'Dew point, pressure, humidity and more' },
  { id: 'air', group: 'outdoors', title: 'Air & UV', emoji: '😷', sizes: ['m', 'l'], blurb: 'Air quality, pollutants and sunscreen times' },
  { id: 'health', group: 'outdoors', title: 'Health & comfort', emoji: '💓', sizes: ['m', 'l'], blurb: 'Pressure swings for migraines and sinuses, dew point, heat stress (WBGT) and the Moon' },
  { id: 'allergy', group: 'outdoors', title: 'Allergies & breathing', emoji: '🤧', sizes: ['m', 'l'], blurb: 'Tree, grass and weed pollen, PM2.5, PM10 and ozone, and an asthma outlook' },
  { id: 'tides', group: 'outdoors', title: 'Tides & hurricanes', emoji: '🌊', sizes: ['m', 'l'], blurb: 'Next high and low tide, storms nearby' },
  { id: 'stars', group: 'outdoors', title: 'Stargazing tonight', emoji: '🔭', sizes: ['s', 'm', 'l'], blurb: 'Which planets are up and where to look' },
  { id: 'plan', title: 'Best times outside', emoji: '🗓️', sizes: ['s', 'm', 'l'], group: 'outdoors', blurb: 'The best hours for a walk, bike ride, kite, picnic or the pool' },
  { id: 'aurora', title: 'Northern lights', emoji: '🌌', sizes: ['s', 'm', 'l'], group: 'outdoors', blurb: 'Can you see the aurora tonight? From NOAA space weather' },
  { id: 'scorecard', title: 'Forecast scorecard', emoji: '🏆', sizes: ['s', 'm', 'l'], group: 'weather', blurb: 'Which weather model was right here this week' },
  { id: 'gear', group: 'outdoors', title: 'Gear checklist', emoji: '🎒', sizes: ['s', 'm', 'l'], blurb: 'What to bring for an outing, from the forecast for those hours' },
  { id: 'why', group: 'family', title: 'Why is this happening?', emoji: '🎓', sizes: ['m', 'l'], blurb: "Short lessons about today's weather" },
  { id: 'history', group: 'weather', title: 'On this day', emoji: '📜', sizes: ['s', 'm', 'l'], blurb: 'Records, normals and past years for today' },
  { id: 'stormpic', group: 'family', title: 'Storm picture of the day', emoji: '⚡', sizes: ['s', 'm', 'l'], blurb: 'A real tornado or lightning photo, with a fun fact' },
  { id: 'rocky', group: 'family', title: "Rocky's outfit", emoji: '🦝', sizes: ['s', 'm', 'l'], blurb: 'Rocky dresses for the weather' },
  { id: 'journal', group: 'family', title: 'Weather journal', emoji: '📓', sizes: ['m', 'l'], signIn: true, blurb: 'Write down what you saw each day' },
  { id: 'safety', group: 'family', title: 'Family safety plan', emoji: '🛡️', sizes: ['s', 'm', 'l'], blurb: 'Shelter spot, kit and where to go in a warning' },
  { id: 'denduty', group: 'family', title: 'Den-Duty board', emoji: '🏠', sizes: ['s', 'm'], blurb: 'What the family board shows today' },
];

export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// What a guest sees, and where a new account starts: the few cards most
// people check, in that order. Everything else is one tap away in Add cards.
// Saved layouts (and an admin's guest layout) are never changed by this.
export const DEFAULT_LAYOUT = {
  cards: [
    { id: 'alerts', size: 'm' },
    { id: 'current', size: 'm' },
    { id: 'rain', size: 'm' },
    { id: 'radar', size: 'm' },
    { id: 'hourly', size: 'l' },
    { id: 'forecast', size: 'm' },
    { id: 'textfc', size: 'm' },
    { id: 'air', size: 'm' },
    { id: 'safety', size: 'm' },
    { id: 'cameras', size: 'l' },
  ],
};

const fitSize = (card, size) => (card.sizes.includes(size) ? size : card.sizes.includes('m') ? 'm' : card.sizes[0]);

// Make any stored layout safe to draw: unknown cards (from a newer or older
// version) are dropped, duplicates removed and sizes fitted to the card.
export function normalize(layout) {
  const seen = new Set();
  const cards = [];
  for (const c of layout?.cards || []) {
    const def = CARD[c?.id];
    if (!def || seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push({ id: c.id, size: fitSize(def, c.size) });
  }
  return { cards };
}

export const hidden = (layout) => CARDS.filter((c) => !layout.cards.some((x) => x.id === c.id));

export function addCard(layout, id, at = layout.cards.length) {
  const def = CARD[id];
  if (!def || layout.cards.some((c) => c.id === id)) return layout;
  const cards = [...layout.cards];
  cards.splice(Math.max(0, Math.min(at, cards.length)), 0, { id, size: fitSize(def, 'm') });
  return { cards };
}

export const removeCard = (layout, id) => ({ cards: layout.cards.filter((c) => c.id !== id) });

// Move a card to a new index (the index it should end up at).
export function moveCard(layout, id, to) {
  const from = layout.cards.findIndex((c) => c.id === id);
  if (from < 0) return layout;
  const target = Math.max(0, Math.min(to, layout.cards.length - 1));
  if (target === from) return layout;
  const cards = [...layout.cards];
  const [card] = cards.splice(from, 1);
  cards.splice(target, 0, card);
  return { cards };
}

export const nudgeCard = (layout, id, by) => moveCard(layout, id, layout.cards.findIndex((c) => c.id === id) + by);

export function resizeCard(layout, id, size) {
  const def = CARD[id];
  if (!def || !def.sizes.includes(size)) return layout;
  return { cards: layout.cards.map((c) => (c.id === id ? { ...c, size } : c)) };
}

export const sameLayout = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
