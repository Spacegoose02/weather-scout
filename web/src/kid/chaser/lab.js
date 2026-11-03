// Tornado Lab: an original, very simplified storm model for kids. Four
// ingredients (warm wet air near the ground, cold dry air up high, spin from
// winds that change with height, and a push to get the air rising) decide what
// kind of storm grows. Real storms are much messier, but the recipe is the
// same one forecasters check every day.

export const INGREDIENTS = [
  { id: 'warm', emoji: '🔥', label: 'Warm, wet air', low: 'Cool and dry', high: 'Hot and sticky', help: 'Warm, wet air near the ground is the storm\'s fuel.' },
  { id: 'cold', emoji: '🧊', label: 'Cold air up high', low: 'Mild up high', high: 'Icy cold up high', help: 'The colder it is up high, the faster warm air bubbles up, like a hot-air balloon.' },
  { id: 'spin', emoji: '🌀', label: 'Spin (wind shear)', low: 'Calm winds', high: 'Winds twisting with height', help: 'When the wind changes direction and speed as you go up, the air starts to roll. A strong updraft can tip that roll up and make the whole storm spin.' },
  { id: 'push', emoji: '⬆️', label: 'Push (lift)', low: 'No push', high: 'Strong cold front', help: 'Air needs a push to start rising: a cold front, a hill, or the sun heating the ground.' },
];

export const START = { warm: 50, cold: 40, spin: 20, push: 50 };

const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));

const KINDS = {
  clear: { emoji: '☀️', title: 'Clear skies', say: 'There is not enough warm, wet air to make clouds grow. Nice picnic weather!' },
  fair: { emoji: '⛅', title: 'Puffy fair-weather clouds', say: 'Warm bubbles of air make little puffy clouds, but they run out of energy before they can grow into storms.' },
  capped: { emoji: '🫖', title: 'Capped! The lid stayed on', say: 'There is plenty of fuel, but nothing gave the air a push. A layer of warm air up high acts like a lid on a pot. Forecasters call this the cap.' },
  shower: { emoji: '🌦️', title: 'Rain showers', say: 'The clouds grew tall enough to rain, but the air was not unstable enough for thunder.' },
  pulse: { emoji: '⛈️', title: 'Pop-up thunderstorm', say: 'A storm shot up, rained, and then its own rain fell down its updraft and shut it off. Without spin, storms like this last less than an hour.' },
  hailstorm: { emoji: '🧊', title: 'Big thunderstorm with hail', say: 'Lots of fuel made a super strong updraft that held ice up high until it grew into hail. Without spin, it still died out fast.' },
  multicell: { emoji: '🌧️', title: 'A line of storms', say: 'Some spin let new storms keep popping up next to old ones, so they formed a line marching along with the push.' },
  bow: { emoji: '🏹', title: 'Bow echo windstorm', say: 'Lots of fuel plus some spin made a strong line that bowed out as a rush of cold wind pushed through its middle. Watch out for straight-line winds!' },
  supercell: { emoji: '👑', title: 'Supercell!', say: 'Strong spin got tipped up by a strong updraft, so the whole storm turned. This rotating storm can last for hours and make giant hail.' },
  tornado: { emoji: '🌪️', title: 'Tornado!', say: 'A supercell with strong spin near the ground and warm, wet air low down (which makes a low cloud base) stretched its spin into a tornado.' },
};

// What grows from these ingredients. Every number is 0-100.
export function brewStorm(input = {}) {
  const warm = clamp(input.warm);
  const cold = clamp(input.cold);
  const spin = clamp(input.spin);
  const push = clamp(input.push);
  // instability: warm fuel below cold air (0-100)
  const fuel = Math.round((warm * (40 + cold * 0.6)) / 100);
  let kind;
  if (fuel < 12) kind = 'clear';
  else if (fuel < 22) kind = 'fair';
  else if (push < 20) kind = 'capped';
  else if (fuel < 34) kind = 'shower';
  else if (spin < 30) kind = fuel >= 65 ? 'hailstorm' : 'pulse';
  else if (spin < 60) kind = fuel >= 70 && push >= 50 ? 'bow' : 'multicell';
  else kind = spin >= 72 && warm >= 62 && fuel >= 45 ? 'tornado' : 'supercell';

  const storm = !['clear', 'fair', 'capped', 'shower'].includes(kind);
  const updraft = storm ? Math.min(100, Math.round(fuel * (0.6 + push / 250) + (kind === 'supercell' || kind === 'tornado' ? 15 : 0))) : Math.round(fuel / 2);
  let ef = null;
  if (kind === 'tornado') {
    const s = ((spin - 72) / 28) * 0.55 + ((fuel - 45) / 55) * 0.3 + ((warm - 62) / 38) * 0.15;
    ef = Math.max(0, Math.min(5, Math.floor(s * 6)));
  }
  let hail = 'none';
  if (storm) {
    if (updraft >= 92) hail = 'baseball';
    else if (updraft >= 78) hail = 'golf-ball';
    else if (updraft >= 62) hail = 'quarter';
    else if (updraft >= 45) hail = 'pea';
  }
  return {
    kind,
    ...KINDS[kind],
    fuel,
    updraft,
    storm,
    lightning: storm,
    rain: kind === 'clear' || kind === 'fair' || kind === 'capped' ? 0 : kind === 'shower' ? 1 : 2,
    rotation: kind === 'tornado' ? 1 : kind === 'supercell' ? 0.6 : 0,
    tower: kind === 'clear' ? 0 : kind === 'fair' || kind === 'capped' ? 0.2 : kind === 'shower' ? 0.45 : Math.min(1, 0.55 + updraft / 220),
    anvil: storm ? Math.min(1, 0.35 + spin / 160) : 0,
    cloudBase: Math.round(100 - warm), // lower number = lower cloud base
    hail,
    ef,
    notes: labNotes({ warm, cold, spin, push, fuel, kind }),
  };
}

function labNotes({ warm, cold, spin, push, fuel, kind }) {
  const out = [];
  if (fuel < 22) out.push(warm < 40 ? 'Add more warm, wet air. That is the storm\'s fuel.' : 'Make it colder up high so warm air rises faster.');
  else if (push < 20) out.push('Give the air a push, like a cold front, to break the lid.');
  if (fuel >= 34 && push >= 20 && spin < 30) out.push('Add spin so the storm can keep going instead of raining on itself.');
  if (kind === 'supercell' && spin < 72) out.push('Tornadoes need even more spin.');
  if (kind === 'supercell' && spin >= 72 && warm < 62) out.push('Make the low air warmer and wetter. A low cloud base helps a tornado touch down.');
  if (kind === 'supercell' && spin >= 72 && warm >= 62 && fuel < 45) out.push('Add more fuel so the updraft can stretch the spin.');
  if (kind === 'tornado') out.push('In real life, most supercells never make a tornado. Scientists are still studying why some do!');
  return out;
}

// Lab missions: try to make each kind of storm.
export const MISSIONS = [
  { id: 'storm', emoji: '⛈️', title: 'Make any thunderstorm', done: (r) => r.storm },
  { id: 'capped', emoji: '🫖', title: 'Find the lid: lots of fuel but no storm', done: (r) => r.kind === 'capped' },
  { id: 'hail', emoji: '⛳', title: 'Make golf ball hail or bigger', done: (r) => r.hail === 'golf-ball' || r.hail === 'baseball' },
  { id: 'line', emoji: '🌧️', title: 'Make a line of storms', done: (r) => r.kind === 'multicell' || r.kind === 'bow' },
  { id: 'supercell', emoji: '👑', title: 'Make a supercell with no tornado', done: (r) => r.kind === 'supercell' },
  { id: 'tornado', emoji: '🌪️', title: 'Make a tornado', done: (r) => r.kind === 'tornado' },
  { id: 'ef4', emoji: '💥', title: 'Make an EF4 or stronger', done: (r) => r.ef != null && r.ef >= 4 },
];

// ---- the Enhanced Fujita scale ------------------------------------------------------------
// Wind speeds are 3-second gusts estimated from damage, as the NWS uses them.
export const EF_SCALE = [
  { ef: 0, mph: [65, 85], label: 'Light damage', color: '#7ec8e3', damage: 'Shingles blow off roofs, gutters bend, and branches snap off trees. Fences may lean over.', share: 'The most common kind.' },
  { ef: 1, mph: [86, 110], label: 'Moderate damage', color: '#7bd389', damage: 'Roofs get badly peeled, windows break, mobile homes can tip over, and trees snap or get pulled out of the ground.', share: 'Together, EF0 and EF1 tornadoes are about 3 of every 4 tornadoes.' },
  { ef: 2, mph: [111, 135], label: 'Considerable damage', color: '#ffd166', damage: 'Whole roofs come off houses, mobile homes are destroyed, big trees are snapped or uprooted, and cars can be lifted off the ground.', share: '' },
  { ef: 3, mph: [136, 165], label: 'Severe damage', color: '#f8961e', damage: 'Walls of well-built houses fall down, big buildings like stores get badly hurt, trains can tip over, and trees lose their bark.', share: 'EF3 and up are called "intense" tornadoes.' },
  { ef: 4, mph: [166, 200], label: 'Devastating damage', color: '#f3722c', damage: 'Well-built houses are flattened, and cars are thrown through the air.', share: 'EF4 and EF5 together are fewer than 1 in every 100 tornadoes.' },
  { ef: 5, mph: [201, null], label: 'Incredible damage', color: '#c1121f', damage: 'Strong houses are swept clean off their foundations, and even tall buildings made of concrete and steel are badly damaged.', share: 'So rare that years can go by without one.' },
];

export const mphToKmh = (mph) => Math.round(mph * 1.609);
export function efWindLabel(row, units = 'imperial') {
  const [lo, hi] = row.mph;
  if (units === 'metric') return hi ? `${mphToKmh(lo)} to ${mphToKmh(hi)} km/h` : `over ${mphToKmh(lo - 1)} km/h`;
  return hi ? `${lo} to ${hi} mph` : `over ${lo - 1} mph`;
}

export const EF_QUIZ = [
  { q: 'How do scientists give a tornado its EF rating?', options: ['By looking at the damage after it\'s gone', 'By how scary it looked', 'By how long it lasted'], answer: 0, why: 'Survey teams walk the path and check damage to 28 kinds of things, like houses, schools and trees, to estimate the wind.' },
  { q: 'Which EF rating is the most common?', options: ['EF0', 'EF3', 'EF5'], answer: 0, why: 'Most tornadoes are weak EF0s and EF1s. The really strong ones are rare.' },
  { q: 'An EF2 tornado can…', options: ['Only bend a few flowers', 'Tear the whole roof off a house', 'Blow a house off its foundation'], answer: 1, why: 'EF2 winds of 111 to 135 mph can lift whole roofs off houses. That is why we go to our safe spot for every tornado warning.' },
];
