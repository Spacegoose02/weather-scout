// The dashboard card catalog and the pure layout helpers (add, remove, move,
// resize). A layout is { cards: [{ id, size }] } in display order. Sizes:
// s = a third of the row, m = half, l = the whole row (on a phone every card
// is full width).

export const SIZES = ['s', 'm', 'l'];
export const SIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Wide' };

// `sizes` lists the sizes a card looks right at; `signIn` cards need an account
// because they save something.
export const CARDS = [
  { id: 'current', title: 'Right now', emoji: '🌡️', sizes: ['m', 'l'], blurb: 'Temperature, feels like and the sky' },
  { id: 'forecast', title: '10-day forecast', emoji: '📅', sizes: ['s', 'm', 'l'], blurb: 'Highs, lows and rain chances' },
  { id: 'hourly', title: '48-hour timeline', emoji: '⏱️', sizes: ['m', 'l'], blurb: 'Hour-by-hour chart with a scrubber' },
  { id: 'radar', title: 'Radar', emoji: '📡', sizes: ['s', 'm', 'l'], blurb: 'Live NEXRAD loop around you' },
  { id: 'cameras', title: 'Nearby cameras', emoji: '📷', sizes: ['s', 'm', 'l'], blurb: 'The closest road cameras, live when they can be' },
  { id: 'alerts', title: 'Alerts', emoji: '⚠️', sizes: ['s', 'm', 'l'], blurb: 'Watches and warnings for this place' },
  { id: 'rain', title: 'Next 2 hours', emoji: '☔', sizes: ['s', 'm', 'l'], blurb: 'Minute-by-minute rain and snow' },
  { id: 'wind', title: 'Wind', emoji: '🌬️', sizes: ['s', 'm', 'l'], blurb: 'Compass, gusts and a 24-hour chart' },
  { id: 'details', title: 'Details', emoji: '📋', sizes: ['s', 'm', 'l'], blurb: 'Dew point, pressure, humidity and more' },
  { id: 'air', title: 'Air & UV', emoji: '😷', sizes: ['m', 'l'], blurb: 'Air quality, pollutants and sunscreen times' },
  { id: 'health', title: 'Health & sky', emoji: '💓', sizes: ['m', 'l'], blurb: 'Pressure swings, heat stress and the Moon' },
  { id: 'tides', title: 'Tides & hurricanes', emoji: '🌊', sizes: ['m', 'l'], blurb: 'Next high and low tide, storms nearby' },
  { id: 'stars', title: 'Stargazing tonight', emoji: '🔭', sizes: ['s', 'm', 'l'], blurb: 'Which planets are up and where to look' },
  { id: 'why', title: 'Why is this happening?', emoji: '🎓', sizes: ['m', 'l'], blurb: "Short lessons about today's weather" },
  { id: 'history', title: 'On this day', emoji: '📜', sizes: ['s', 'm', 'l'], blurb: 'Records, normals and past years for today' },
  { id: 'rocky', title: "Rocky's outfit", emoji: '🦝', sizes: ['s', 'm', 'l'], blurb: 'Rocky dresses for the weather' },
  { id: 'journal', title: 'Weather journal', emoji: '📓', sizes: ['m', 'l'], signIn: true, blurb: 'Write down what you saw each day' },
  { id: 'denduty', title: 'Den-Duty board', emoji: '🏠', sizes: ['s', 'm'], blurb: 'What the family board shows today' },
];

export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// What a guest sees, and where a new account starts.
export const DEFAULT_LAYOUT = {
  cards: [
    { id: 'current', size: 'm' },
    { id: 'forecast', size: 'm' },
    { id: 'radar', size: 'm' },
    { id: 'rain', size: 'm' },
    { id: 'wind', size: 's' },
    { id: 'details', size: 's' },
    { id: 'stars', size: 's' },
    { id: 'air', size: 'l' },
    { id: 'health', size: 'm' },
    { id: 'tides', size: 'm' },
    { id: 'cameras', size: 'm' },
    { id: 'why', size: 'm' },
    { id: 'history', size: 'm' },
    { id: 'hourly', size: 'l' },
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
