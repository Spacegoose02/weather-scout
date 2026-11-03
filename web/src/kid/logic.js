// Kid Zone game rules: bingo lines, the dress-Rocky check, forecaster scoring,
// seasons, experiments and badges. Plain functions so they are easy to test.

// ---- bingo ---------------------------------------------------------------------
export const BINGO_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function bingoStatus(squares, marked) {
  const on = squares.map((s) => s.free || marked.includes(s.id));
  const lines = BINGO_LINES.filter((l) => l.every((i) => on[i]));
  return { lines, bingo: lines.length > 0, blackout: on.every(Boolean), onCells: on };
}

// ---- what to wear --------------------------------------------------------------
export const WARDROBE = [
  { id: 't-shirt', emoji: '👕', label: 'T-shirt' },
  { id: 'pants', emoji: '👖', label: 'Pants' },
  { id: 'shorts', emoji: '🩳', label: 'Shorts' },
  { id: 'swim-trunks', emoji: '🏊', label: 'Swim trunks' },
  { id: 'jacket', emoji: '🧥', label: 'Light jacket' },
  { id: 'winter-coat', emoji: '🧣', label: 'Winter coat' },
  { id: 'raincoat', emoji: '🦺', label: 'Raincoat' },
  { id: 'boots', emoji: '🥾', label: 'Rain boots' },
  { id: 'snow-boots', emoji: '⛄', label: 'Snow boots' },
  { id: 'beanie', emoji: '🧢', label: 'Warm hat' },
  { id: 'mittens', emoji: '🧤', label: 'Mittens' },
  { id: 'sun-hat', emoji: '👒', label: 'Sun hat' },
  { id: 'sunglasses', emoji: '🕶️', label: 'Sunglasses' },
];
const NAME = Object.fromEntries(WARDROBE.map((w) => [w.id, w.label.toLowerCase()]));

// Something else in the outfit that does the same job.
const COVERS = {
  jacket: ['winter-coat', 'raincoat'],
  boots: ['snow-boots'],
};

const WHY_NOT = {
  jacket: 'It is warm enough without a jacket.',
  'winter-coat': 'A winter coat would make you way too hot today!',
  raincoat: 'No rain is coming, so the raincoat can stay home.',
  boots: 'It is dry out, so regular shoes are fine.',
  'snow-boots': 'There is no snow to stomp in today.',
  beanie: 'Your ears will be warm enough without a hat.',
  mittens: 'Your hands will be warm enough without mittens.',
  'sun-hat': 'The sun is not strong enough to need a sun hat.',
  sunglasses: 'It is not bright enough for sunglasses.',
};

const WHY_NEED = {
  't-shirt': 'It is warm! A T-shirt is perfect.',
  pants: 'It is chilly. Pants will keep your legs warm.',
  shorts: 'It is warm! Shorts are just right.',
  jacket: 'It is a bit chilly. Grab a jacket.',
  'winter-coat': 'Brrr! You need your warm coat.',
  raincoat: 'Rain is coming. Do not forget your raincoat!',
  boots: 'Puddles ahead! Rain boots keep your toes dry.',
  'snow-boots': 'Snow! Snow boots, please.',
  beanie: 'Keep your ears toasty with a warm hat.',
  mittens: 'Cold fingers are no fun. Mittens!',
  'sun-hat': 'The sun is strong. A sun hat shades your face.',
  sunglasses: 'It is super bright. Sunglasses protect your eyes.',
};

// Clothes that go on Rocky's body. A T-shirt is an under-layer, so it is never
// "too much" under a coat.
const TOPS = ['t-shirt', 'jacket', 'winter-coat', 'raincoat'];
const BOTTOMS = ['pants', 'shorts', 'swim-trunks'];

// minFeelsLike is the coldest it will feel in the next 12 hours, in °F (from the
// server's outfit rules, whatever the display units).
export function checkOutfit(picked, forecastItems, { minFeelsLike } = {}) {
  // The forecast only lists special gear, so on a mild, dry day it is empty. In the
  // game Rocky still can't go out in just his fur: he needs a T-shirt (or a light
  // jacket) and something on his legs.
  const base = !forecastItems.some((id) => TOPS.includes(id));
  const hot = forecastItems.includes('t-shirt');
  const cool = minFeelsLike != null ? minFeelsLike < 60 : forecastItems.some((id) => ['jacket', 'winter-coat'].includes(id));
  const bottom = cool && !hot ? 'pants' : 'shorts';
  const needed = [...forecastItems, ...(base ? ['t-shirt'] : []), bottom];
  const covers = (id) => {
    const out = [...(COVERS[id] || [])];
    if (base && id === 't-shirt') out.push('jacket');
    if (id === 'shorts') out.push(hot ? 'swim-trunks' : 'pants');
    return out;
  };
  const has = (id) => picked.includes(id) || covers(id).some((c) => picked.includes(c));
  const missing = needed.filter((id) => !has(id));
  const covering = new Set(needed.flatMap((id) => (picked.includes(id) ? [] : covers(id).filter((c) => picked.includes(c)))));
  // A winter coat covering a jacket is extra warm, so it still counts as too much.
  const extras = picked.filter((id) => id !== 't-shirt' && !needed.includes(id) && !(covering.has(id) && id !== 'winter-coat'));
  const stars = missing.length ? (missing.length === 1 ? 1 : 0) : extras.length ? 2 : 3;
  const wearsTop = picked.some((p) => TOPS.includes(p));
  const wearsBottom = picked.some((p) => BOTTOMS.includes(p));
  const needText = (id) => {
    if (id === 't-shirt' && base && !wearsTop) return 'Rocky can\'t go out in just his fur! A T-shirt is just right today.';
    if (id === bottom && !wearsBottom) return `Rocky needs something on his legs! ${WHY_NEED[id]}`;
    return WHY_NEED[id] || `You need your ${NAME[id] || id}.`;
  };
  const bottomsOn = picked.filter((p) => BOTTOMS.includes(p)).length;
  const okBottoms = [bottom, ...covers(bottom)];
  const extraText = (id) => {
    if (bottomsOn > 1 && okBottoms.includes(id)) return 'Just one pair of bottoms, please!';
    if (id === 'shorts') return 'Brrr! It is too chilly for shorts.';
    if (id === 'pants') return 'Pants would be too hot today.';
    if (id === 'swim-trunks') return 'Swim trunks? It is not a pool day!';
    return WHY_NOT[id] || `You will not need your ${NAME[id] || id}.`;
  };
  const tips = [
    ...missing.map((id) => ({ kind: 'need', id, text: needText(id) })),
    ...extras.map((id) => ({ kind: 'extra', id, text: extraText(id) })),
  ];
  let headline = 'Perfect! You are dressed exactly right for today.';
  if (missing.length) headline = 'Almost! Rocky still needs something.';
  else if (extras.length) headline = 'Good job! You could leave something at home, though.';
  return { stars, perfect: stars === 3, missing, extras, tips, headline };
}

// ---- kid forecaster --------------------------------------------------------------
export const RAIN_THRESHOLD = { imperial: 0.01, metric: 0.25 };

export function scoreGuess(guess, actual) {
  const diff = Math.abs(Math.round(guess.high) - Math.round(actual.high));
  // "Close" is about the same in °F and °C terms (2°F is about 1°C).
  const [near, mid, far] = guess.units === 'metric' ? [1, 3, 6] : [2, 5, 10];
  const highPoints = diff <= near ? 3 : diff <= mid ? 2 : diff <= far ? 1 : 0;
  const rained = (actual.precipTotal ?? 0) >= RAIN_THRESHOLD[guess.units || 'imperial'];
  const rainRight = guess.rain === rained;
  const points = highPoints + (rainRight ? 2 : 0);
  let message = 'Nice try! The weather is tricky. Want to guess again?';
  if (points === 5) message = 'WOW! You nailed it like a real meteorologist!';
  else if (points >= 3) message = 'Great forecast! You were really close.';
  return { points, highPoints, rainRight, diff, actualHigh: Math.round(actual.high), rained, message };
}

export function scorePending(guesses, actualsByKey, today) {
  let changed = false;
  const out = guesses.map((g) => {
    if (g.result || g.date >= today) return g;
    const days = actualsByKey[guessKey(g)];
    const actual = days?.find((d) => d.date === g.date);
    if (!actual) return g;
    changed = true;
    return { ...g, result: scoreGuess(g, actual) };
  });
  return { guesses: out, changed };
}

export const guessKey = (g) => `${g.lat},${g.lon},${g.units}`;

export function forecasterTotals(guesses) {
  const scored = guesses.filter((g) => g.result);
  return {
    points: scored.reduce((s, g) => s + g.result.points, 0),
    played: scored.length,
    bullseyes: scored.filter((g) => g.result.highPoints === 3).length,
  };
}

// ---- seasons ------------------------------------------------------------------------
const SEASONS = [
  ['winter', '❄️', 'Winter'], ['winter', '❄️', 'Winter'], ['spring', '🌷', 'Spring'], ['spring', '🌷', 'Spring'], ['spring', '🌷', 'Spring'],
  ['summer', '☀️', 'Summer'], ['summer', '☀️', 'Summer'], ['summer', '☀️', 'Summer'], ['fall', '🍂', 'Fall'], ['fall', '🍂', 'Fall'],
  ['fall', '🍂', 'Fall'], ['winter', '❄️', 'Winter'],
];
const FLIP = { winter: 5, spring: 8, summer: 11, fall: 2 };
export function seasonOf(date, lat = 40) {
  let m = Number(date.slice(5, 7)) - 1;
  if (lat < 0) m = FLIP[SEASONS[m][0]] ?? m;
  const [id, emoji, label] = SEASONS[m];
  return { id, emoji, label };
}

export function seasonsCovered(photos, lat) {
  return new Set(photos.map((p) => seasonOf(p.takenOn, lat).id));
}

// ---- backyard experiments -----------------------------------------------------------
export const EXPERIMENTS = [
  {
    id: 'rain-gauge', emoji: '🧪', title: 'Make a rain gauge', badge: 'rain-catcher', time: '20 minutes', grownUp: true,
    materials: ['A clear plastic bottle', 'Scissors (grown-up job)', 'A ruler', 'Tape', 'A few pebbles'],
    steps: [
      'A grown-up cuts the top off the bottle, about a third of the way down.',
      'Put pebbles in the bottom so it will not tip over, then add water just to cover them.',
      'Tape the ruler to the side so the 0 lines up with the water.',
      'Flip the top upside down into the bottle like a funnel.',
      'Set it outside in an open spot, away from trees and roofs.',
    ],
    observe: 'After it rains, read how high the water went. Compare it with Weather Scout\'s rain number!',
    fit: (w) => {
      const day = w.forecast.daily.slice(0, 4).find((d) => (d.precipChance ?? 0) >= 50);
      return day ? `Rain might come ${dayWord(day.time, w.forecast.daily)}. Set your gauge out before then!` : null;
    },
    live: (w) => `Weather Scout measured ${w.forecast.recent?.precipLast24h ?? 0} ${w.forecast.units?.precip || 'in'} of rain in the last 24 hours.`,
  },
  {
    id: 'pinecone', emoji: '🌲', title: 'Pinecone weather station', badge: 'pinecone-pal', time: '5 minutes, then watch for days', grownUp: false,
    materials: ['A pinecone (from outside)', 'A spot by a window or on a porch'],
    steps: [
      'Find a dry pinecone with its scales open.',
      'Put it outside where it stays safe from rain falling right on it.',
      'Check it every morning. Draw how open or closed it looks.',
    ],
    observe: 'When the air is damp, the scales close up. When it is dry, they open wide. Can you predict rain?',
    fit: (w) => (w.forecast.current.humidity >= 80 ? 'The air is very damp right now. Your pinecone should be closing!' : w.forecast.current.humidity <= 45 ? 'The air is dry right now. Your pinecone should be wide open!' : null),
    live: (w) => `Humidity right now: ${w.forecast.current.humidity}%.`,
  },
  {
    id: 'wind-vane', emoji: '🧭', title: 'Paper wind vane', badge: 'wind-watcher', time: '30 minutes', grownUp: true,
    materials: ['A paper plate', 'A straw', 'A pencil with an eraser', 'A pin (grown-up helps)', 'Cardboard', 'Tape', 'A marker'],
    steps: [
      'Write N, E, S and W around the edge of the plate, like a compass.',
      'Cut a small arrow point and a bigger tail out of cardboard. Tape them to the ends of the straw.',
      'A grown-up pushes the pin through the middle of the straw into the pencil eraser.',
      'Poke the pencil through the middle of the plate so the straw can spin.',
      'Take it outside and turn the plate so N faces north.',
    ],
    observe: 'The arrow points to where the wind is coming FROM. Is it the same as Weather Scout?',
    fit: (w) => ((w.forecast.current.windSpeed ?? 0) >= 8 ? 'There is a nice breeze right now. Great day to test it!' : null),
    live: (w) => `Wind right now: ${Math.round(w.forecast.current.windSpeed ?? 0)} ${w.forecast.units?.wind || 'mph'} from the ${compassWord(w.forecast.current.windDir)}.`,
  },
  {
    id: 'sundial', emoji: '🕰️', title: 'Shadow sundial', badge: 'sun-clock', time: 'All day, a minute each hour', grownUp: false,
    materials: ['A stick or pencil', 'A paper plate or chalk on the sidewalk', 'A sunny day'],
    steps: [
      'Stand the stick straight up in the middle of the plate or in the ground.',
      'Every hour, mark where the tip of the shadow is and write the time.',
      'Look at how the shadow moves and changes length.',
    ],
    observe: 'The shadow is shortest around lunchtime, when the sun is highest. Tomorrow, can you tell time with it?',
    fit: (w) => (w.forecast.daily[0] && (w.forecast.daily[0].code ?? 3) <= 2 ? 'Today looks sunny. Perfect sundial day!' : null),
  },
  {
    id: 'frost-can', emoji: '🥫', title: 'Make frost in a can', badge: 'frost-maker', time: '10 minutes', grownUp: false,
    materials: ['A clean metal can with no sharp edges', 'Ice cubes', 'Salt', 'A spoon'],
    steps: [
      'Fill the can with ice.',
      'Pour in a big spoonful of salt and stir for a minute.',
      'Wait and watch the outside of the can.',
    ],
    observe: 'Water from the air freezes on the cold can and makes real frost! That is how frost forms on grass on cold nights.',
    fit: (w) => (w.forecast.current.humidity >= 60 ? 'The air is extra damp today, so you will get lots of frost.' : null),
  },
  {
    id: 'rainbow', emoji: '🌈', title: 'Make your own rainbow', badge: 'rainbow-maker', time: '10 minutes', grownUp: false,
    materials: ['A clear glass of water', 'A sheet of white paper', 'A sunny window'],
    steps: [
      'Put the glass of water on a table in a sunny window.',
      'Hold the white paper on the floor or table on the other side of the glass.',
      'Move the paper until you see a little rainbow!',
    ],
    observe: 'Water bends sunlight and splits it into colors. Raindrops do the same thing to make real rainbows.',
    fit: (w) => (w.forecast.current.isDay && (w.forecast.current.cloudCover ?? 100) < 40 ? 'The sun is out right now. Go make a rainbow!' : null),
  },
];

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const compassWord = (deg) => (deg == null ? 'somewhere' : COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]);
function dayWord(date, daily) {
  const i = daily.findIndex((d) => d.time === date);
  if (i === 0) return 'today';
  if (i === 1) return 'tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

// ---- badges ---------------------------------------------------------------------------
export const BADGES = [
  { id: 'bingo', group: 'play', emoji: '🎯', name: 'Bingo!', how: 'Get three in a row on weather bingo.' },
  { id: 'sharp-eyes', group: 'play', emoji: '👀', name: 'Sharp Eyes', how: 'Find every square on a bingo card.' },
  { id: 'junior-forecaster', group: 'play', emoji: '🔮', name: 'Junior Forecaster', how: 'Get your first forecast scored.' },
  { id: 'bullseye', group: 'play', emoji: '🎯', name: 'Bullseye', how: 'Guess the high within 2 degrees.' },
  { id: 'weather-wiz', group: 'play', emoji: '🧙', name: 'Weather Wiz', how: 'Earn 25 forecaster points.' },
  { id: 'dressed-for-it', group: 'play', emoji: '👗', name: 'Dressed for It', how: 'Dress Rocky perfectly for the weather.' },
  { id: 'fact-fan', group: 'learn', emoji: '📚', name: 'Fact Fan', how: 'Hear Rocky\'s fact on 7 different days.' },
  { id: 'rain-catcher', group: 'science', emoji: '🧪', name: 'Rain Catcher', how: 'Build a rain gauge.' },
  { id: 'pinecone-pal', group: 'science', emoji: '🌲', name: 'Pinecone Pal', how: 'Make a pinecone weather station.' },
  { id: 'wind-watcher', group: 'science', emoji: '🧭', name: 'Wind Watcher', how: 'Build a paper wind vane.' },
  { id: 'sun-clock', group: 'science', emoji: '🕰️', name: 'Sun Clock', how: 'Make a shadow sundial.' },
  { id: 'frost-maker', group: 'science', emoji: '🥫', name: 'Frost Maker', how: 'Make frost in a can.' },
  { id: 'rainbow-maker', group: 'science', emoji: '🌈', name: 'Rainbow Maker', how: 'Make your own rainbow.' },
  { id: 'mad-scientist', group: 'science', emoji: '🥼', name: 'Mad Scientist', how: 'Do every backyard experiment.' },
  { id: 'explorer', group: 'explore', emoji: '🗺️', name: 'Explorer', how: 'Finish your first camera field trip.' },
  { id: 'road-tripper', group: 'explore', emoji: '🚗', name: 'Road Tripper', how: 'Finish 5 different field trip missions.' },
  { id: 'storm-ready', group: 'explore', emoji: '🛡️', name: 'Storm Ready', how: 'Practice a storm drill with a grown-up.' },
  { id: 'photographer', group: 'explore', emoji: '📷', name: 'Photographer', how: 'Add your first seasons photo.' },
  { id: 'four-seasons', group: 'explore', emoji: '🍂', name: 'Four Seasons', how: 'Photograph one spot in all four seasons.' },
  { id: 'time-traveler', group: 'explore', emoji: '⏳', name: 'Time Traveler', how: 'Guess right 3 times in the weather time machine.' },
  { id: 'journal-first', group: 'journal', emoji: '📓', name: 'Weather Reporter', how: 'Write your first weather journal page.' },
  { id: 'streak-3', group: 'journal', emoji: '🔥', name: 'On a Roll', how: 'Write in your journal 3 days in a row.' },
  { id: 'streak-7', group: 'journal', emoji: '📅', name: 'Week Watcher', how: 'Write in your journal 7 days in a row.' },
  { id: 'streak-30', group: 'journal', emoji: '🏆', name: 'Sky Scribe', how: 'Write in your journal 30 days in a row.' },
  { id: 'journal-25', group: 'journal', emoji: '📚', name: 'Weather Historian', how: 'Fill 25 journal pages.' },
  { id: 'quiz-first', group: 'learn', emoji: '🧠', name: 'Quiz Kid', how: 'Finish a quiz in Learn.' },
  { id: 'quiz-perfect', group: 'learn', emoji: '💯', name: 'Perfect Score', how: 'Get every question right on a quiz.' },
  { id: 'quiz-5', group: 'learn', emoji: '🎓', name: 'Weather Scholar', how: 'Finish quizzes on 5 different topics.' },
  { id: 'storm-smart', group: 'learn', emoji: '⚡', name: 'Storm Smart', how: 'Finish 3 Storm Center quizzes.' },
  { id: 'cloud-spotter', group: 'clouds', emoji: '☁️', name: 'Cloud Spotter', how: 'Spot your first cloud type outside.' },
  { id: 'cloud-collector', group: 'clouds', emoji: '🌥️', name: 'Cloud Collector', how: 'Spot 5 different cloud types.' },
  { id: 'cloud-master', group: 'clouds', emoji: '🌩️', name: 'Cloud Master', how: 'Spot every cloud type in the cloud spotter.' },
  { id: 'chase-forecaster', group: 'chaser', emoji: '🗺️', name: 'Chase Forecaster', how: 'Check Rocky\'s Chase Day forecast on 3 different days.' },
  { id: 'chase-target', group: 'chaser', emoji: '🎯', name: 'On Target', how: 'Get your first storm target scored.' },
  { id: 'chase-bullseye', group: 'chaser', emoji: '🌩️', name: 'Storm Magnet', how: 'Pick a target within 25 miles of a real storm.' },
  { id: 'chase-season', group: 'chaser', emoji: '📆', name: 'Chase Season', how: 'Pick a storm target on 10 different days.' },
  { id: 'chase-master', group: 'chaser', emoji: '🏆', name: 'Master Chaser', how: 'Earn 100 target points.' },
  { id: 'chase-live', group: 'chaser', emoji: '🎥', name: 'Ride Along', how: 'Watch a live storm chase with a grown-up.' },
  { id: 'chase-card', group: 'chaser', emoji: '🃏', name: 'Card Collector', how: 'Collect your first storm card.' },
  { id: 'chase-binder', group: 'chaser', emoji: '📒', name: 'Full Binder', how: 'Collect 25 storm cards.' },
  { id: 'chase-legendary', group: 'chaser', emoji: '💎', name: 'Legendary!', how: 'Collect a legendary storm card.' },
  { id: 'super-scout', group: 'star', emoji: '⭐', name: 'Super Scout', how: 'Earn 10 other badges.' },
];
