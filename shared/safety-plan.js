// The family severe weather safety plan: which hazards it covers, the
// "where to shelter" guidance for each, the starter emergency kit, and the
// clean-up that keeps a saved plan a safe, known shape.
//
// No JSX and no dependencies, so the server (storage, push notifications) and
// the web app (the plan editor and the pop-up shelter guide) share one copy.
// Guidance follows the National Weather Service and Ready.gov advice.

export const LIMITS = { spot: 120, note: 400, name: 60, phone: 30, label: 80, notes: 1500, contacts: 12, kit: 60 };

/**
 * The hazards that get a shelter spot and a pop-up guide. `warn` matches the
 * NWS alert names that should open the guide on their own (warnings and
 * emergencies, never watches or advisories). Order is priority: when two
 * warnings are out at once the first hazard here is shown first.
 */
export const HAZARDS = [
  {
    id: 'tornado',
    name: 'Tornado',
    emoji: '🌪️',
    warn: /tornado (warning|emergency)|extreme wind warning/i,
    spotLabel: 'Tornado shelter spot',
    spotHint: 'the basement, or the downstairs closet under the stairs',
    headline: 'Go to your tornado shelter now',
    steps: [
      'Go to the lowest floor, in a small room in the middle of the house with no windows (a basement, closet, bathroom or under the stairs).',
      'Put as many walls between you and the outside as you can. Stay away from windows and doors.',
      'Wear sturdy shoes. Cover your head and neck with helmets, pillows, blankets or your arms.',
      'In a mobile home, car or outdoors, get to a sturdy building right away. If you cannot, lie flat in a low spot and cover your head.',
      'Stay put until the warning ends or officials say it is safe.',
    ],
    kidTitle: 'Time to go to our safe spot',
    kidSteps: ['Put on your shoes', 'Go to our safe spot with your grown-up', 'Sit down low and cover your head', 'Stay there until your grown-up says all clear'],
  },
  {
    id: 'thunder',
    name: 'Severe thunderstorm',
    emoji: '⛈️',
    warn: /severe thunderstorm warning/i,
    spotLabel: 'Severe storm room',
    spotHint: 'an inside room downstairs, away from windows',
    headline: 'Get inside and away from windows',
    steps: [
      'Get indoors right away. A car with a hard roof is next best. Picnic shelters and tents are not safe.',
      'Move to an inside room on the lowest floor, away from windows. Damaging winds and hail can break glass.',
      'If the warning says a tornado is possible, go to your tornado spot instead.',
      'Stay off corded phones, out of the bath and shower, and away from plugged-in electronics.',
      'Wait 30 minutes after the last thunder before going back outside.',
    ],
    kidTitle: 'Thunder time means inside time',
    kidSteps: ['Come inside right away', 'Stay away from windows', 'Save bath time for after the storm', 'Wait for your grown-up to say all clear'],
  },
  {
    id: 'flood',
    name: 'Flood',
    emoji: '🌊',
    warn: /flash flood (warning|emergency)|(^|coastal |areal )flood (warning|emergency)/i,
    spotLabel: 'High ground to go to',
    spotHint: "upstairs, or Grandma's house on the hill",
    headline: 'Move to higher ground',
    steps: [
      'Move to higher ground right away. In a flash flood, do not wait to be told.',
      'Never walk, swim or drive through flood water. Turn around, don\'t drown: 6 inches of moving water can knock you down and 1 foot can float a car.',
      'If water is coming into the house, go to the highest floor. Do not go into a closed attic, where you could be trapped. Go onto the roof only if you must, and call 911.',
      'Stay away from creeks, ditches, storm drains and downed power lines.',
      'Follow evacuation orders from local officials.',
    ],
    kidTitle: 'We stay dry and high',
    kidSteps: ['Stay away from creeks, ditches and puddles that move', 'Never walk or play in flood water', 'Go upstairs if your grown-up asks', 'Stay close to your grown-up'],
  },
  {
    id: 'hurricane',
    name: 'Hurricane',
    emoji: '🌀',
    warn: /hurricane (warning|emergency)|tropical storm warning|storm surge (warning|emergency)|typhoon warning/i,
    spotLabel: 'Hurricane room (if staying home)',
    spotHint: 'the downstairs hallway with no windows',
    headline: 'Shelter or leave, as officials say',
    steps: [
      'If officials tell your zone to evacuate, go. Take your emergency kit, medicines, pets and important papers.',
      'If you stay, use a small inside room or hallway on the lowest floor that will not flood, away from windows and glass doors.',
      'Do not go outside in the calm eye of the storm. The winds come back fast from the other side.',
      'If storm surge or flood water rises, move higher, but not into a closed attic.',
      'Run generators only outdoors and far from windows. Never inside or in a garage.',
    ],
    kidTitle: 'A big ocean storm is visiting',
    kidSteps: ['Stay inside and away from windows', 'Keep your shoes and a favorite toy close', 'Help put flashlights and snacks in one place', 'Listen for your grown-up'],
  },
];

export const HAZARD = Object.fromEntries(HAZARDS.map((h) => [h.id, h]));

/** The hazard whose shelter guide should pop up for an NWS alert, or null. */
export function hazardFor(alert) {
  const event = alert?.event || '';
  return HAZARDS.find((h) => h.warn.test(event)) || null;
}

/**
 * The warnings that call for the shelter guide, one per hazard, most urgent
 * hazard first: [{ hazard, alert }].
 */
export function shelterAlerts(alerts = []) {
  const found = new Map();
  for (const a of alerts || []) {
    const h = hazardFor(a);
    if (h && !found.has(h.id)) found.set(h.id, { hazard: h, alert: a });
  }
  return HAZARDS.filter((h) => found.has(h.id)).map((h) => found.get(h.id));
}

/** A starter kit based on Ready.gov's basic disaster supplies list. */
export const DEFAULT_KIT = [
  ['water', 'Water: 1 gallon per person per day, for at least 3 days'],
  ['food', 'Food that will not spoil, for at least 3 days'],
  ['can-opener', 'Manual can opener'],
  ['radio', 'NOAA Weather Radio with spare batteries (or hand-crank)'],
  ['flashlight', 'Flashlights and extra batteries'],
  ['first-aid', 'First aid kit'],
  ['meds', 'A week of medicines, glasses and contacts'],
  ['chargers', 'Phone chargers and a charged power bank'],
  ['whistle', 'Whistle to signal for help'],
  ['masks', 'Dust masks'],
  ['shoes', 'Sturdy shoes for everyone, by the shelter spot'],
  ['helmets', 'Bike helmets for everyone (head protection in a tornado)'],
  ['blankets', 'Blankets or sleeping bags'],
  ['papers', 'Copies of IDs, insurance and medical info in a waterproof bag'],
  ['cash', 'Some cash in small bills'],
  ['tools', 'Wrench or pliers to turn off utilities'],
  ['pets', 'Pet food, leash, carrier and water'],
  ['comfort', "A comfort toy, book or game for each kid"],
  ['map', 'Paper map of the area with the evacuation route marked'],
];

export function defaultPlan() {
  return {
    shelters: Object.fromEntries(HAZARDS.map((h) => [h.id, { spot: '', note: '' }])),
    meeting: { home: '', away: '' },
    evacuation: { zone: '', destination: '' },
    contacts: [],
    kit: DEFAULT_KIT.map(([id, label]) => ({ id, label, done: false })),
    notes: '',
    lastDrill: null,
  };
}

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '');
const longText = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const kitId = (label, taken = new Set()) => {
  const base = (label || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'item';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

/**
 * Make any stored or submitted plan safe to keep and draw: known keys only,
 * strings trimmed and capped, lists capped, kit ids unique. Missing parts fall
 * back to the defaults, so an old plan picks up hazards added later.
 */
export function cleanPlan(input) {
  const p = input && typeof input === 'object' ? input : {};
  const base = defaultPlan();
  const shelters = {};
  for (const h of HAZARDS) {
    const s = p.shelters?.[h.id] || {};
    shelters[h.id] = { spot: text(s.spot, LIMITS.spot), note: longText(s.note, LIMITS.note) };
  }
  const contacts = (Array.isArray(p.contacts) ? p.contacts : [])
    .map((c) => ({ name: text(c?.name, LIMITS.name), phone: text(c?.phone, LIMITS.phone), note: text(c?.note, LIMITS.label) }))
    .filter((c) => c.name || c.phone)
    .slice(0, LIMITS.contacts);
  const taken = new Set();
  const kitIn = Array.isArray(p.kit) ? p.kit : base.kit;
  const kit = [];
  for (const k of kitIn) {
    const label = text(k?.label, LIMITS.label);
    if (!label) continue;
    const id = typeof k.id === 'string' && ID.test(k.id) && !taken.has(k.id) ? k.id : kitId(label, taken);
    taken.add(id);
    kit.push({ id, label, done: k.done === true });
    if (kit.length >= LIMITS.kit) break;
  }
  return {
    shelters,
    meeting: { home: text(p.meeting?.home, LIMITS.spot), away: text(p.meeting?.away, LIMITS.spot) },
    evacuation: { zone: text(p.evacuation?.zone, LIMITS.name), destination: text(p.evacuation?.destination, LIMITS.spot) },
    contacts,
    kit,
    notes: longText(p.notes, LIMITS.notes),
    lastDrill: typeof p.lastDrill === 'string' && DAY.test(p.lastDrill) ? p.lastDrill : null,
  };
}

/** How ready the family is: kit progress, spots chosen, and what to do next. */
export function readiness(plan) {
  const p = plan || defaultPlan();
  const kitDone = p.kit.filter((k) => k.done).length;
  const spots = HAZARDS.filter((h) => p.shelters[h.id]?.spot).length;
  const todo = [];
  if (!p.shelters.tornado?.spot) todo.push('Pick a tornado shelter spot');
  if (!p.meeting.home) todo.push('Choose a meeting place outside the house');
  if (!p.contacts.length) todo.push('Add an emergency contact');
  if (kitDone < p.kit.length) todo.push(`Pack the kit (${p.kit.length - kitDone} to go)`);
  if (!p.lastDrill) todo.push('Practice a drill together');
  return { kitDone, kitTotal: p.kit.length, spots, spotTotal: HAZARDS.length, todo, ready: todo.length === 0 };
}

/** The family's spot for a hazard, as one short line (for push notifications). */
export function shelterLine(plan, hazardId) {
  const spot = plan?.shelters?.[hazardId]?.spot;
  if (!spot) return '';
  return hazardId === 'flood' ? `Move to: ${spot}` : `Shelter: ${spot}`;
}
