// Moon phase from the mean synodic month. Accurate to within about half a day,
// which is plenty for "is tonight a full moon?".
const SYNODIC = 29.530588853; // days
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
const DAY = 86400_000;

const PHASES = [
  [1.84566, 'New moon', '🌑'],
  [5.53699, 'Waxing crescent', '🌒'],
  [9.22831, 'First quarter', '🌓'],
  [12.91963, 'Waxing gibbous', '🌔'],
  [16.61096, 'Full moon', '🌕'],
  [20.30228, 'Waning gibbous', '🌖'],
  [23.99361, 'Last quarter', '🌗'],
  [27.68493, 'Waning crescent', '🌘'],
  [Infinity, 'New moon', '🌑'],
];

export function moonPhase(now = Date.now()) {
  const age = ((((now - KNOWN_NEW_MOON) / DAY) % SYNODIC) + SYNODIC) % SYNODIC;
  const illumination = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2) * 100);
  const [, name, emoji] = PHASES.find(([max]) => age < max);
  const untilFull = (SYNODIC / 2 - age + SYNODIC) % SYNODIC;
  const untilNew = SYNODIC - age;
  return {
    name,
    emoji,
    age: Math.round(age * 10) / 10,
    illumination,
    waxing: age < SYNODIC / 2,
    nextFull: new Date(now + untilFull * DAY).toISOString(),
    nextNew: new Date(now + untilNew * DAY).toISOString(),
  };
}
