// Kid Zone extras that change every day: Rocky's daily fact or joke, the
// weather bingo card and storm-safe mode. Pure functions, picked from the
// forecast and the local date, so the whole family sees the same card.
import { isThunder, isSnow, isFreezing, isWet } from './weathercodes.js';

// Small seeded random so a date always gives the same picks.
export function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const localDate = (forecast) => (forecast.current?.time || new Date().toISOString()).slice(0, 10);

// ---- Rocky's daily fact ----------------------------------------------------
export const FACTS = [
  { type: 'fact', text: 'A single cloud can weigh more than a million pounds. It floats because its water is spread out into tiny, tiny drops.' },
  { type: 'fact', text: 'Lightning is about five times hotter than the surface of the sun!' },
  { type: 'fact', text: 'Raindrops are not shaped like tears. Small ones are round, and big ones look like the top of a hamburger bun.' },
  { type: 'fact', text: 'Snow looks white, but each snowflake is made of clear ice. All the bumpy edges bounce light around and make it look white.' },
  { type: 'fact', text: 'The windiest place on Earth is in Antarctica, where winds can blow faster than a race car.' },
  { type: 'fact', text: 'Crickets chirp faster when it is warm. Count their chirps for 14 seconds and add 40 to guess the temperature in °F.' },
  { type: 'fact', text: 'A rainbow is really a full circle. From the ground we only see the top half.' },
  { type: 'fact', text: 'Fog is just a cloud that is lying down on the ground.' },
  { type: 'fact', text: 'The hottest temperature ever measured on Earth was 134°F in Death Valley, California.' },
  { type: 'fact', text: 'The coldest temperature ever measured was about -128°F in Antarctica. Brrr!' },
  { type: 'fact', text: 'Hail can grow as big as a softball when strong winds toss it up and down inside a storm cloud.' },
  { type: 'fact', text: 'The sky is blue because air scatters blue sunlight all over the place, so blue comes at you from every direction.' },
  { type: 'fact', text: 'Sunsets look orange and red because the light travels through more air, and the blue gets scattered away first.' },
  { type: 'fact', text: 'Thunder is the sound of air jumping out of the way of a lightning bolt.' },
  { type: 'fact', text: 'You can tell how far away lightning is. Count the seconds until the thunder, then divide by five for miles.' },
  { type: 'fact', text: 'Clouds that look like cotton balls are called cumulus. That word means "heap" or "pile".' },
  { type: 'fact', text: 'Wispy clouds way up high are called cirrus. They are made of ice, even in summer!' },
  { type: 'fact', text: 'Pinecones close up when the air is wet and open when it is dry. They are tiny weather stations!' },
  { type: 'fact', text: 'Dew is not rain. It is water from the air that sticks to cool grass at night.' },
  { type: 'fact', text: 'Frost makes feathery shapes because ice crystals grow in branches, like tiny trees.' },
  { type: 'fact', text: 'The wind is named for where it comes from. A north wind blows from the north.' },
  { type: 'fact', text: 'Weather balloons go up twice a day all over the world to measure the air high above us.' },
  { type: 'fact', text: 'Most snowflakes have six sides because of the way water molecules hold hands when they freeze.' },
  { type: 'fact', text: 'Earth has about 2,000 thunderstorms happening right now, every moment of the day.' },
  { type: 'fact', text: 'Puddles disappear because the sun and wind turn the water into invisible water vapor. That is called evaporation.' },
  { type: 'fact', text: 'The air around you is pushing on you with about 15 pounds on every square inch. You do not feel it because you are used to it.' },
  { type: 'fact', text: 'Meteorologists are scientists who study the weather. They use satellites, radar and balloons to make forecasts.' },
  { type: 'fact', text: 'Radar works by sending out invisible beams that bounce off raindrops and come back, like an echo.' },
  { type: 'fact', text: 'Some frogs croak louder before it rains because the damp air makes them happy.' },
  { type: 'fact', text: 'Contrails are clouds made by airplanes. Hot, wet engine air freezes into ice in the cold sky.' },
  { type: 'fact', text: 'The Moon has no weather, because it has almost no air.' },
  { type: 'fact', text: 'Jupiter has a storm called the Great Red Spot that is bigger than the whole Earth!' },
  { type: 'fact', text: 'It can snow when it is a little warmer than freezing on the ground, if the air up high is cold enough.' },
  { type: 'fact', text: 'A drizzle drop is smaller than the head of a pin.' },
  { type: 'fact', text: 'Trees help make rain. Their leaves let out water vapor that floats up and helps build clouds.' },
  { type: 'fact', text: 'Humidity is how much water vapor is in the air. On sticky days, there is a lot!' },
  { type: 'joke', text: 'What did one raindrop say to the other?', answer: 'Two\'s company, three\'s a cloud!' },
  { type: 'joke', text: 'What do clouds wear under their clothes?', answer: 'Thunderwear!' },
  { type: 'joke', text: 'What is a tornado\'s favorite game?', answer: 'Twister!' },
  { type: 'joke', text: 'How do hurricanes see?', answer: 'With one eye!' },
  { type: 'joke', text: 'What did the lightning bolt say to the other lightning bolt?', answer: 'You\'re shocking!' },
  { type: 'joke', text: 'What kind of bow can\'t be tied?', answer: 'A rainbow!' },
  { type: 'joke', text: 'What falls but never gets hurt?', answer: 'Rain!' },
  { type: 'joke', text: 'Why did the snowman call his dog Frost?', answer: 'Because Frost bites!' },
  { type: 'joke', text: 'What does a cloud do when it is itchy?', answer: 'It finds the nearest sky-scraper!' },
  { type: 'joke', text: 'What do you call a grumpy cloud?', answer: 'A thunder-grump!' },
  { type: 'joke', text: 'How does the moon cut his hair?', answer: 'Eclipse it!' },
  { type: 'joke', text: 'What did the sun say when it was introduced to Earth?', answer: 'Pleased to heat you!' },
  { type: 'joke', text: 'What is a snowman\'s favorite breakfast?', answer: 'Frosted flakes!' },
  { type: 'joke', text: 'Why are raccoons great forecasters?', answer: 'They always know when it\'s going to be a little "masked" with clouds!' },
];

export function dailyFact(date) {
  // Walk through the list in a shuffled order that repeats about every two months.
  const day = Math.floor(Date.parse(`${date}T12:00Z`) / 86_400_000);
  const cycle = Math.floor(day / FACTS.length);
  const order = shuffle(FACTS.map((_, i) => i), seeded(`cycle:${cycle}`));
  const pick = FACTS[order[day % FACTS.length]];
  const speech = pick.type === 'joke' ? `Here's a joke. ${pick.text} ... ${pick.answer}` : `Did you know? ${pick.text}`;
  return { ...pick, date, speech };
}

// ---- Weather bingo -----------------------------------------------------------
// Each square has tags; squares that match today's weather are picked first.
export const BINGO_SQUARES = [
  { id: 'bird', emoji: '🐦', label: 'A bird flying', tags: ['any'] },
  { id: 'contrail', emoji: '✈️', label: 'An airplane trail', tags: ['clear', 'partly'] },
  { id: 'flag', emoji: '🚩', label: 'A flag flapping in the wind', tags: ['windy', 'any'] },
  { id: 'animal-cloud', emoji: '🐘', label: 'A cloud shaped like an animal', tags: ['partly'] },
  { id: 'puffy', emoji: '☁️', label: 'A big puffy cloud', tags: ['partly'] },
  { id: 'gray-sky', emoji: '🌥️', label: 'Gray sky all over', tags: ['cloudy'] },
  { id: 'shadow', emoji: '👤', label: 'Your own shadow', tags: ['clear', 'partly'] },
  { id: 'sun-peek', emoji: '🌤️', label: 'Sun peeking out of a cloud', tags: ['partly'] },
  { id: 'sunglasses', emoji: '🕶️', label: 'Someone in sunglasses', tags: ['clear', 'hot'] },
  { id: 'shorts', emoji: '🩳', label: 'Someone wearing shorts', tags: ['hot'] },
  { id: 'puddle', emoji: '💧', label: 'A puddle', tags: ['wet', 'rained'] },
  { id: 'worm', emoji: '🪱', label: 'A worm on the sidewalk', tags: ['wet', 'rained'] },
  { id: 'umbrella', emoji: '☂️', label: 'Someone with an umbrella', tags: ['wet'] },
  { id: 'window-drops', emoji: '🪟', label: 'Raindrops on a window', tags: ['wet'] },
  { id: 'mud', emoji: '🟫', label: 'Mud!', tags: ['rained', 'wet'] },
  { id: 'rainbow', emoji: '🌈', label: 'A rainbow', tags: ['rainbow'] },
  { id: 'breath', emoji: '😮‍💨', label: 'Your breath making a cloud', tags: ['cold'] },
  { id: 'hat', emoji: '🧢', label: 'Someone in a warm hat', tags: ['cold'] },
  { id: 'frost', emoji: '🥶', label: 'Frost on grass or a car', tags: ['frosty'] },
  { id: 'ice-puddle', emoji: '🧊', label: 'Ice on a puddle', tags: ['frosty'] },
  { id: 'snowflake', emoji: '❄️', label: 'A snowflake on your glove', tags: ['snow'] },
  { id: 'snowman', emoji: '⛄', label: 'A snowman', tags: ['snow'] },
  { id: 'footprints', emoji: '👣', label: 'Footprints in the snow', tags: ['snow'] },
  { id: 'fog', emoji: '🌫️', label: 'Fog hiding something far away', tags: ['fog'] },
  { id: 'swaying', emoji: '🌳', label: 'Tree branches swaying', tags: ['windy'] },
  { id: 'fast-cloud', emoji: '💨', label: 'A cloud zooming by', tags: ['windy'] },
  { id: 'leaf', emoji: '🍂', label: 'A leaf blowing around', tags: ['windy', 'fall'] },
  { id: 'web', emoji: '🕸️', label: 'A spider web', tags: ['any', 'humid'] },
  { id: 'dew', emoji: '✨', label: 'Dew drops on grass', tags: ['humid'] },
  { id: 'squirrel', emoji: '🐿️', label: 'A squirrel', tags: ['any'] },
  { id: 'bug', emoji: '🐞', label: 'A bug', tags: ['warm'] },
  { id: 'flower', emoji: '🌼', label: 'A flower', tags: ['warm'] },
  { id: 'windsock', emoji: '🎐', label: 'Wind chimes or a pinwheel moving', tags: ['windy', 'any'] },
  { id: 'moon', emoji: '🌙', label: 'The Moon', tags: ['any'] },
  { id: 'thunder', emoji: '⛈️', label: 'Hear thunder (from inside!)', tags: ['thunder'] },
  { id: 'sunset', emoji: '🌇', label: 'Pink or orange sunset colors', tags: ['clear', 'partly'] },
];

function weatherTags(forecast) {
  const c = forecast.current || {};
  const metric = forecast.units?.temp === '°C';
  const f = (v) => (v == null ? null : metric ? v * 9 / 5 + 32 : v);
  const temp = f(c.temp) ?? 60;
  const low = f(forecast.daily?.[0]?.low) ?? temp;
  const wind = (metric ? (c.windGust ?? 0) / 1.609 : c.windGust ?? 0);
  const hours = (forecast.hourly || []).slice(0, 12);
  const tags = new Set(['any']);
  const code = c.code;
  if (code <= 1) tags.add('clear');
  if (code === 2 || code === 1) tags.add('partly');
  if (code === 3) tags.add('cloudy');
  if ([45, 48].includes(code)) tags.add('fog');
  if (isWet(code) || hours.some((h) => (h.precipChance ?? 0) >= 60)) tags.add('wet');
  if ((forecast.recent?.precipLast24h ?? 0) > 0) tags.add('rained');
  if ((tags.has('wet') || tags.has('rained')) && hours.some((h) => h.isDay && (h.cloudCover ?? 100) < 70)) tags.add('rainbow');
  if (isSnow(code) || hours.some((h) => isSnow(h.code)) || (forecast.daily?.[0]?.snowTotal ?? 0) > 0) tags.add('snow');
  if (isThunder(code) || hours.some((h) => isThunder(h.code))) tags.add('thunder');
  if (temp < 45) tags.add('cold');
  if (low <= 34 || isFreezing(code)) tags.add('frosty');
  if (temp >= 80) tags.add('hot');
  if (temp >= 60) tags.add('warm');
  if (wind >= 20) tags.add('windy');
  if ((c.humidity ?? 0) >= 80) tags.add('humid');
  const month = Number(localDate(forecast).slice(5, 7));
  if ([9, 10, 11].includes(month)) tags.add('fall');
  return tags;
}

// A 3x3 card with a free square in the middle.
export function bingoCard(forecast, date = localDate(forecast)) {
  const tags = weatherTags(forecast);
  const rand = seeded(`bingo:${date}`);
  const matches = (s) => s.tags.some((t) => t !== 'any' && tags.has(t));
  const fits = BINGO_SQUARES.filter(matches);
  const filler = BINGO_SQUARES.filter((s) => !matches(s) && s.tags.includes('any'));
  const picked = [...shuffle(fits, rand).slice(0, 6), ...shuffle(filler, rand)].slice(0, 8);
  const squares = shuffle(picked, rand).map(({ id, emoji, label }) => ({ id, emoji, label }));
  squares.splice(4, 0, { id: 'free', emoji: '🦝', label: 'Free! Rocky waves hi', free: true });
  return { date, squares };
}

// Rows, columns and diagonals of a 3x3 card, by index.
export const BINGO_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

// ---- Storm-safe mode -----------------------------------------------------------
// Calm words for kids. The real alert name is still shown in small print for grown-ups.
const PLANS = [
  {
    id: 'tornado', match: /tornado/i, emoji: '🏠',
    title: 'Time to go to our safe spot',
    calm: 'Weather helpers saw a spinning storm somewhere nearby. Going to the safe spot keeps everyone cozy and protected.',
    steps: ['Put on your shoes', 'Grab a flashlight', 'Go to the lowest floor, in a small room with no windows', 'Cover your head with a pillow or a helmet', 'Stay with your grown-up until they say it is all clear'],
  },
  {
    id: 'hurricane', match: /hurricane|tropical/i, emoji: '🌀',
    title: 'A big ocean storm is visiting',
    calm: 'Grown-ups have been getting ready for days. Your job is to stay inside and help.',
    steps: ['Stay inside and away from windows', 'Help put flashlights and snacks in one place', 'Keep your shoes and a favorite toy nearby', 'Listen for your grown-up'],
  },
  {
    id: 'flood', match: /flood/i, emoji: '🌊',
    title: 'Lots of rain today',
    calm: 'So much rain is falling that creeks and roads can fill up. We stay dry and high.',
    steps: ['Stay away from creeks, ditches and moving water', 'Never walk, bike or play in flood water', 'Go upstairs if your grown-up asks', 'Stay with your grown-up'],
  },
  {
    id: 'thunder', match: /thunder|lightning|severe/i, emoji: '⚡',
    title: 'Thunder time means inside time',
    calm: 'Storms are noisy, but you are safe inside. When thunder roars, go indoors!',
    steps: ['Come inside right away', 'Stay away from windows', 'Save bath time for after the storm', 'Wait 30 minutes after the last thunder before going out'],
  },
  {
    id: 'wind', match: /wind/i, emoji: '🌬️',
    title: 'A very windy day',
    calm: 'Strong wind can knock down branches. We play inside where it is calm.',
    steps: ['Bring outside toys in', 'Stay away from big trees and power lines', 'Play inside until the wind calms down'],
  },
  {
    id: 'winter', match: /winter|snow|ice|blizzard|freez|frost|cold|chill/i, emoji: '❄️',
    title: 'A snow and ice day',
    calm: 'Roads and sidewalks can be slippery. A warm day inside is a good plan.',
    steps: ['Wear warm layers', 'Ask a grown-up before going outside', 'Help find blankets and flashlights', 'Come in if your fingers or toes feel numb'],
  },
  {
    id: 'heat', match: /heat|hot/i, emoji: '🥵',
    title: 'A super hot day',
    calm: 'The sun is extra strong today. Water and shade are your best friends.',
    steps: ['Drink lots of water', 'Play in the shade or inside', 'Rest when you feel tired', 'Never stay in a parked car'],
  },
  {
    id: 'air', match: /air quality|smoke|dust/i, emoji: '😷',
    title: 'The air is hazy today',
    calm: 'Smoke or dust is in the air. Inside play keeps your lungs happy.',
    steps: ['Play inside today', 'Keep the windows closed', 'Tell a grown-up if it is hard to breathe'],
  },
];
const GENERIC = {
  id: 'general', match: /./, emoji: '📢',
  title: 'Weather helpers sent a message',
  calm: 'Grown-ups are reading it now. Stay close to them and listen.',
  steps: ['Stay close to your grown-up', 'Listen for what to do next'],
};

// A practice plan for storm drills on calm days.
export const DRILL_PLAN = {
  ...PLANS[0], match: undefined, grownUpName: 'Practice drill', ends: null,
  title: "Let's practice going to our safe spot",
  calm: 'This is just practice. If weather helpers ever see a spinning storm nearby, this is what we do.',
};

const SEVERITY = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };

export function stormSafe(alerts = [], forecast = {}) {
  const serious = alerts.filter((a) => (SEVERITY[a.severity] ?? 0) >= 3 || /warning/i.test(a.event || ''));
  const thunderNow = isThunder(forecast.current?.code) || (forecast.hourly || []).slice(0, 2).some((h) => isThunder(h.code));
  const sources = serious.length ? serious : thunderNow ? [{ event: 'Thunderstorm nearby', severity: 'Moderate' }] : [];
  if (!sources.length) return { active: false, drill: DRILL_PLAN };
  const ranked = [...sources].sort((a, b) => (SEVERITY[b.severity] ?? 0) - (SEVERITY[a.severity] ?? 0));
  const plans = [];
  for (const a of ranked) {
    const plan = PLANS.find((p) => p.match.test(a.event || '')) || GENERIC;
    if (!plans.some((p) => p.id === plan.id)) plans.push({ ...plan, match: undefined, grownUpName: a.event, ends: a.ends || null });
  }
  return {
    active: true,
    plans: plans.slice(0, 2),
    reassure: 'Grown-ups and weather helpers are keeping watch. You are doing great.',
    drill: DRILL_PLAN,
  };
}

