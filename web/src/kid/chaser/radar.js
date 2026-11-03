// Radar Detective: lessons on reading storm radar, plus the pretend radar
// scenes they use. Every scene is drawn from simple shapes (blobs and curved
// strokes) with a little seeded noise, so it looks like real radar without
// copying any real image. Plain functions so they are easy to test.

// ---- the color scale -------------------------------------------------------------
// Radar measures how much the beam bounces back (reflectivity, in dBZ).
export const DBZ_SCALE = [
  { min: 10, color: [64, 160, 255], label: 'Sprinkles' },
  { min: 20, color: [40, 200, 90], label: 'Light rain' },
  { min: 30, color: [20, 140, 40], label: 'Steady rain' },
  { min: 40, color: [250, 220, 30], label: 'Heavy rain' },
  { min: 48, color: [250, 140, 20], label: 'Very heavy rain' },
  { min: 55, color: [225, 30, 30], label: 'Pouring, maybe hail' },
  { min: 62, color: [235, 50, 200], label: 'Hail likely' },
  { min: 68, color: [160, 60, 255], label: 'Big hail' },
];

export function dbzColor(dbz) {
  if (!(dbz >= DBZ_SCALE[0].min)) return null;
  let c = DBZ_SCALE[0].color;
  for (const s of DBZ_SCALE) if (dbz >= s.min) c = s.color;
  return c;
}

// Doppler velocity: green is wind toward the radar, red is away.
export function velocityColor(v) {
  if (v == null || Number.isNaN(v)) return null;
  if (Math.abs(v) < 4) return [96, 100, 112];
  const t = Math.min(1, Math.abs(v) / 50);
  return v < 0 ? [20, Math.round(90 + 165 * t), 40] : [Math.round(120 + 135 * t), 20, 30];
}

// ---- seeded noise ------------------------------------------------------------------
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function noiseGrid(seed, n = 24) {
  const r = rng(seed);
  return Array.from({ length: (n + 1) * (n + 1) }, () => r() * 2 - 1);
}
function valueNoise(grid, x, y, n = 24) {
  const gx = Math.max(0, Math.min(n - 0.001, x * n));
  const gy = Math.max(0, Math.min(n - 0.001, y * n));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const s = (t) => t * t * (3 - 2 * t);
  const at = (i, j) => grid[j * (n + 1) + i];
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * s(fx);
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * s(fx);
  return a + (b - a) * s(fy);
}

// ---- shapes (coordinates are 0..1 across, 0..0.75 down) ---------------------------------
function blob({ x, y, rx, ry, peak, rot = 0 }) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (px, py) => {
    const dx = px - x;
    const dy = py - y;
    const u = (dx * c + dy * s) / rx;
    const v = (-dx * s + dy * c) / ry;
    return peak * Math.exp(-(u * u + v * v));
  };
}

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function stroke({ points, width, peak }) {
  return (px, py) => {
    let d = Infinity;
    for (let i = 1; i < points.length; i += 1) d = Math.min(d, segDist(px, py, ...points[i - 1], ...points[i]));
    return peak * Math.exp(-((d / width) ** 2));
  };
}

// ---- scenes --------------------------------------------------------------------------
// Each scene: shapes, a target (where the thing to find is, with a radius) and
// what a detective should notice. ox/oy shift the whole picture so the
// challenge does not show the same picture every time.
const supercellShapes = (hookPeak = 46) => [
  blob({ x: 0.56, y: 0.33, rx: 0.075, ry: 0.06, peak: 64 }),
  blob({ x: 0.68, y: 0.24, rx: 0.2, ry: 0.07, peak: 36, rot: -0.55 }),
  blob({ x: 0.5, y: 0.39, rx: 0.05, ry: 0.05, peak: 44 }),
  stroke({ points: [[0.52, 0.4], [0.47, 0.45], [0.46, 0.51], [0.5, 0.545], [0.545, 0.525], [0.555, 0.49]], width: 0.018, peak: hookPeak }),
];

export const SCENES = {
  popcorn: {
    kind: 'popcorn',
    shapes: () => [
      blob({ x: 0.2, y: 0.2, rx: 0.04, ry: 0.035, peak: 42 }),
      blob({ x: 0.38, y: 0.5, rx: 0.05, ry: 0.04, peak: 48 }),
      blob({ x: 0.62, y: 0.3, rx: 0.055, ry: 0.05, peak: 58 }),
      blob({ x: 0.8, y: 0.58, rx: 0.035, ry: 0.035, peak: 38 }),
      blob({ x: 0.15, y: 0.6, rx: 0.03, ry: 0.025, peak: 33 }),
      blob({ x: 0.5, y: 0.14, rx: 0.03, ry: 0.03, peak: 35 }),
      blob({ x: 0.85, y: 0.15, rx: 0.04, ry: 0.03, peak: 40 }),
    ],
    target: { x: 0.62, y: 0.3, r: 0.07 },
  },
  hail: {
    kind: 'hail',
    shapes: () => [
      blob({ x: 0.5, y: 0.36, rx: 0.12, ry: 0.09, peak: 50 }),
      blob({ x: 0.5, y: 0.35, rx: 0.04, ry: 0.035, peak: 74 }),
      blob({ x: 0.62, y: 0.3, rx: 0.16, ry: 0.06, peak: 30, rot: -0.4 }),
      blob({ x: 0.22, y: 0.58, rx: 0.04, ry: 0.035, peak: 38 }),
    ],
    target: { x: 0.5, y: 0.35, r: 0.06 },
  },
  supercell: {
    kind: 'supercell',
    shapes: () => supercellShapes(),
    target: { x: 0.56, y: 0.33, r: 0.08 },
  },
  hook: {
    kind: 'supercell',
    shapes: () => [...supercellShapes(52), blob({ x: 0.553, y: 0.495, rx: 0.014, ry: 0.014, peak: 60 })],
    target: { x: 0.53, y: 0.52, r: 0.055 },
  },
  bow: {
    kind: 'bow',
    shapes: () => [
      stroke({ points: [[0.4, 0.06], [0.52, 0.17], [0.6, 0.3], [0.63, 0.38], [0.6, 0.47], [0.52, 0.59], [0.4, 0.7]], width: 0.028, peak: 58 }),
      stroke({ points: [[0.36, 0.08], [0.47, 0.2], [0.53, 0.38], [0.47, 0.56], [0.36, 0.68]], width: 0.06, peak: 34 }),
      blob({ x: 0.27, y: 0.38, rx: 0.12, ry: 0.26, peak: 27 }),
      blob({ x: 0.38, y: 0.08, rx: 0.06, ry: 0.05, peak: 44 }),
    ],
    target: { x: 0.62, y: 0.38, r: 0.075 },
  },
  line: {
    kind: 'line',
    shapes: () => [
      stroke({ points: [[0.56, 0.02], [0.6, 0.2], [0.63, 0.38], [0.66, 0.56], [0.68, 0.74]], width: 0.022, peak: 55 }),
      stroke({ points: [[0.5, 0.02], [0.54, 0.2], [0.57, 0.38], [0.6, 0.56], [0.62, 0.74]], width: 0.06, peak: 32 }),
      stroke({ points: [[0.4, 0.02], [0.44, 0.38], [0.5, 0.74]], width: 0.1, peak: 25 }),
      blob({ x: 0.61, y: 0.25, rx: 0.025, ry: 0.025, peak: 60 }),
      blob({ x: 0.665, y: 0.58, rx: 0.025, ry: 0.025, peak: 61 }),
    ],
    target: { x: 0.635, y: 0.38, r: 0.1, line: [[0.56, 0.02], [0.68, 0.74]] },
  },
};

// A velocity (spin) scene: a tight pair of toward/away winds is rotation.
export const COUPLET = { x: 0.55, y: 0.4, r: 0.06 };
const VEL_NOISE = noiseGrid(11);
export function velocityAt(px, py, { x, y } = COUPLET) {
  // outside the storm there is nothing to measure (ragged edges from the noise)
  const echo = Math.exp(-(((px - 0.55) / 0.3) ** 2 + ((py - 0.38) / 0.24) ** 2)) + valueNoise(VEL_NOISE, px, py / 0.75) * 0.12;
  if (echo < 0.3) return null;
  // the radar sits off to the left, so it only sees the left-right part of the wind.
  // General flow: gentle winds, a little toward it on the left and away on the right.
  let v = (px - 0.55) * 36 + valueNoise(VEL_NOISE, 1 - px, 1 - py / 0.75) * 6;
  // a small vortex spinning counterclockwise, like most US tornadoes: fastest a
  // little way out from the middle and calm again further away. North is up,
  // so the wind is toward the radar on top and away below.
  const R = 0.028;
  const d = Math.hypot(px - x, py - y);
  const vt = 60 * (d / R) * Math.exp(0.5 * (1 - (d / R) ** 2));
  if (d > 0) v += ((py - y) / d) * vt;
  return v;
}

// Make a scene for the challenge: shifted a little.
export function variant(name, seed = 1) {
  const r = rng(seed * 7919 + name.length);
  return { name, seed, ox: (r() - 0.5) * 0.16, oy: (r() - 0.5) * 0.1 };
}

// dBZ at one point of a scene (0..1 across, 0..0.75 down).
export function dbzAt(scene, shapes, grid, px, py, v = {}) {
  const x = px - (v.ox || 0);
  const y = py - (v.oy || 0);
  let dbz = 0;
  for (const f of shapes) dbz = Math.max(dbz, f(x, y));
  if (dbz < 6) return 0;
  const n = valueNoise(grid, px, py / 0.75) * 0.7 + valueNoise(grid, (px * 3) % 1, ((py / 0.75) * 3) % 1) * 0.3;
  return dbz + n * 7;
}

// The whole picture as a w x h grid of dBZ values.
export function radarField(name, { w = 200, h = 150, seed = 3, ox = 0, oy = 0 } = {}) {
  const scene = SCENES[name];
  const shapes = scene.shapes();
  const grid = noiseGrid(seed);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) out[j * w + i] = dbzAt(scene, shapes, grid, i / w, (j / h) * 0.75, { ox, oy });
  }
  return out;
}

export function velocityField({ w = 200, h = 150 } = {}) {
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) out[j * w + i] = velocityAt(i / w, (j / h) * 0.75) ?? NaN;
  }
  return out;
}

// Did a tap (0..1 across, 0..0.75 down) land on the target?
export function hitTarget(target, tap, v = {}) {
  const tx = target.x + (v.ox || 0);
  const ty = target.y + (v.oy || 0);
  if (target.line) {
    const [[ax, ay], [bx, by]] = target.line;
    return segDist(tap.x, tap.y, ax + (v.ox || 0), ay + (v.oy || 0), bx + (v.ox || 0), by + (v.oy || 0)) <= 0.05;
  }
  return Math.hypot(tap.x - tx, tap.y - ty) <= target.r;
}

// ---- lessons ----------------------------------------------------------------------------
export const RADAR_LESSONS = [
  {
    id: 'colors', emoji: '🎨', title: 'Radar colors',
    scene: 'popcorn',
    say: 'A radar dish spins around and sends out invisible pulses of microwaves. When a pulse hits raindrops, hail or even bugs, a little bit bounces back. The more that bounces back, the hotter the color. Green is light rain, yellow is heavy rain, red is pouring, and pink or purple usually means hail.',
    look: ['Green and blue: light rain', 'Yellow and orange: heavy rain', 'Red: pouring rain', 'Pink and purple: hail!'],
    find: 'Tap the strongest storm on this radar.',
    found: 'Yes! The red middle is the storm\'s core, where the heaviest rain is falling.',
    quiz: [
      { q: 'What does purple usually mean on radar?', options: ['Snow', 'Hail', 'Fog'], answer: 1, why: 'Hailstones are big and icy, so they bounce back lots of the radar beam. That makes the hottest colors.' },
      { q: 'What does the radar send out?', options: ['Sound waves', 'Invisible microwave pulses', 'Tiny balloons'], answer: 1, why: 'Weather radar sends out microwave pulses and listens for the echo, a bit like a bat.' },
    ],
  },
  {
    id: 'hail', emoji: '🧊', title: 'Hail cores',
    scene: 'hail',
    say: 'When a storm\'s updraft is super strong, it holds ice up high and lets it grow bigger and bigger. Those hailstones make a tight spot of pink and purple on radar called a hail core. If the core is huge, the hail can be as big as golf balls or even baseballs.',
    look: ['A small, tight spot of pink or purple', 'Inside a big red storm', 'Under the strongest updraft'],
    find: 'Tap the hail core.',
    found: 'Got it! That purple spot is where hail is falling. Cars and roofs under it could get dented.',
    quiz: [
      { q: 'What makes hail grow big?', options: ['A strong updraft holding it up', 'A cold sunny day', 'Lots of wind at the ground'], answer: 0, why: 'A strong updraft keeps lifting the ice so more water freezes on it, layer after layer.' },
      { q: 'A hail core looks like…', options: ['A long green line', 'A tight pink or purple spot', 'A big blue circle'], answer: 1, why: 'Hail bounces back so much of the beam that it shows up as the hottest colors.' },
    ],
  },
  {
    id: 'supercell', emoji: '👑', title: 'Supercells',
    scene: 'supercell',
    say: 'A supercell is the king of thunderstorms. Its updraft spins, like a giant slow merry-go-round called a mesocyclone. Supercells can live for hours and make the biggest hail and most of the strongest tornadoes. On radar, look for one big, strong storm standing all by itself, often shaped like a kidney bean, with a long tail of light rain blowing away from it.',
    look: ['One big storm standing alone', 'A strong red core', 'A long tail of light rain downwind', 'A bend or hook on the back side'],
    find: 'Tap the core of the supercell.',
    found: 'That is the core! The spinning updraft is right next to it.',
    quiz: [
      { q: 'What makes a supercell special?', options: ['It is always pink', 'Its updraft spins', 'It only happens in winter'], answer: 1, why: 'A spinning updraft, called a mesocyclone, is what makes a storm a supercell.' },
      { q: 'How long can a supercell last?', options: ['A few seconds', 'Hours', 'A whole month'], answer: 1, why: 'Because rain falls away from the updraft instead of on top of it, a supercell can keep going for hours.' },
    ],
  },
  {
    id: 'hook', emoji: '🪝', title: 'Hook echoes',
    scene: 'hook',
    say: 'As a supercell spins, it wraps a thin band of rain and hail around its spinning updraft. On radar that band looks like a fishing hook, usually on the back side of the storm. If a tornado forms, it is often right at the tip of the hook. Sometimes there is even a little round ball at the tip: that can be debris, stuff the tornado picked up.',
    look: ['A hook or curl on the back of a big storm', 'The tip of the hook is the danger spot', 'A tiny round ball at the tip can be debris'],
    find: 'Tap the tip of the hook, where a tornado would be.',
    found: 'Detective work! The tip of the hook is where forecasters look first for a tornado.',
    quiz: [
      { q: 'Where is a tornado most likely in a hook echo?', options: ['At the tip of the hook', 'In the light green rain', 'Far away from the storm'], answer: 0, why: 'The hook wraps around the spinning updraft, so the tip is where the spin touches down.' },
      { q: 'A little round ball at the hook\'s tip might be…', options: ['A rainbow', 'Debris lifted by a tornado', 'The radar dish'], answer: 1, why: 'Radar can see leaves, wood and dirt a tornado throws in the air. Forecasters call it a debris ball.' },
    ],
  },
  {
    id: 'spin', emoji: '🔄', title: 'Spin finder',
    scene: 'velocity',
    say: 'Doppler radar can also tell which way the wind is blowing. Green means wind coming toward the radar. Red means wind going away. When bright green and bright red are squished right next to each other, the air there is spinning! Forecasters call it a couplet, and it is how they find tornadoes they can\'t see.',
    look: ['Green: wind toward the radar', 'Red: wind going away', 'Bright red touching bright green: spin!'],
    find: 'Tap the spot where the storm is spinning.',
    found: 'You found the couplet! Forecasters would send a tornado warning for a spin like that.',
    quiz: [
      { q: 'On velocity radar, red right next to green means…', options: ['The radar is broken', 'The air is spinning', 'It is snowing'], answer: 1, why: 'Wind going away right beside wind coming toward means the air is turning in a circle.' },
      { q: 'Green on a velocity map means wind is…', options: ['Coming toward the radar', 'Going away from the radar', 'Not moving at all'], answer: 0, why: 'Green is toward and red is away. Some kids remember "red runs away".' },
    ],
  },
  {
    id: 'bow', emoji: '🏹', title: 'Bow echoes',
    scene: 'bow',
    say: 'Sometimes a line of storms bulges out in the middle like an archer\'s bow. That bulge happens because a rush of wind from behind is pushing the middle forward. The strongest straight-line winds are right at the front of the bulge. They can knock down trees like a tornado would. A long-lasting bow that travels hundreds of miles is called a derecho.',
    look: ['A line of storms bent like a bow', 'The strongest winds at the front of the bulge', 'Sometimes a curl at the top end'],
    find: 'Tap where the strongest winds would hit.',
    found: 'Right on target! The front of the bulge is where the wind is pushing hardest.',
    quiz: [
      { q: 'What does a bow echo usually bring?', options: ['Strong straight-line winds', 'A snowstorm', 'A clear sunny sky'], answer: 0, why: 'Wind rushing in from behind pushes the middle of the line forward and slams into the ground.' },
      { q: 'A bow echo that lasts a long way is called a…', options: ['Derecho', 'Rainbow', 'Hurricane'], answer: 0, why: 'A derecho is a long-lived windstorm made by a traveling bow echo.' },
    ],
  },
  {
    id: 'line', emoji: '📏', title: 'Squall lines',
    scene: 'line',
    say: 'A squall line is a long line of storms, often marching along a cold front. The front edge has the heaviest rain and gusty wind, and behind it comes a wide area of lighter, steady rain. When a squall line arrives, you get a burst of wind, then a downpour, then a long drizzle.',
    look: ['A long, skinny line of red and yellow', 'Light green rain behind it', 'Gusty winds right at the front edge'],
    find: 'Tap the front edge of the line.',
    found: 'Yes! The front edge is where the gusty wind and heavy rain arrive first.',
    quiz: [
      { q: 'What comes behind a squall line?', options: ['A wide area of lighter rain', 'A tornado every time', 'Snow'], answer: 0, why: 'Behind the strong line there is usually a big area of light, steady rain.' },
      { q: 'Squall lines often form along a…', options: ['Cold front', 'Rainbow', 'Mountain top'], answer: 0, why: 'A cold front pushes warm air up all along its edge, so storms pop up in a long line.' },
    ],
  },
];
export const lessonById = Object.fromEntries(RADAR_LESSONS.map((l) => [l.id, l]));

// ---- the detective challenge --------------------------------------------------------------
export const CHALLENGE_KINDS = [
  { kind: 'supercell', label: 'Supercell with a hook', emoji: '🪝' },
  { kind: 'bow', label: 'Bow echo', emoji: '🏹' },
  { kind: 'line', label: 'Squall line', emoji: '📏' },
  { kind: 'popcorn', label: 'Pop-up storms', emoji: '🍿' },
  { kind: 'hail', label: 'Hail core', emoji: '🧊' },
];
const CHALLENGE_SCENES = ['hook', 'bow', 'line', 'popcorn', 'hail', 'supercell'];
export const CHALLENGE_ROUNDS = 6;
export const ACE_SCORE = 5;

// A shuffled round list where every kind shows up at least once.
export function challengeRounds(seed = Date.now(), n = CHALLENGE_ROUNDS) {
  const r = rng(seed);
  const names = [...CHALLENGE_SCENES];
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, n).map((name, i) => ({ ...variant(name, (seed + i * 31) % 100000), answer: SCENES[name].kind }));
}

// Progress kept in kid data: data.radarDetective = { lessons: { id: score }, found: { id: 1 }, best }
export function radarStatus(rd = {}) {
  const lessons = rd.lessons || {};
  const done = RADAR_LESSONS.filter((l) => lessons[l.id] != null).length;
  return { done, total: RADAR_LESSONS.length, all: done === RADAR_LESSONS.length, best: rd.best || 0 };
}
