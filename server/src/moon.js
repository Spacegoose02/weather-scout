// Moon phase for Sky watch. Low-precision lunar and solar longitudes (good to a
// fraction of a degree, so phase times land within an hour or two), which is
// plenty for "how much of the Moon is lit tonight" and "when is the next full Moon".

const RAD = Math.PI / 180;
const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12); // JD 2451545.0
const wrap = (deg) => ((deg % 360) + 360) % 360;

// Moon's ecliptic longitude minus the Sun's: 0 = new, 90 = first quarter, 180 = full.
export function moonAngle(ms) {
  const d = (ms - J2000) / DAY;
  const Ms = (357.5291 + 0.98560028 * d) * RAD;
  const sunLon = wrap(Ms / RAD + 1.9148 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms) + 0.0003 * Math.sin(3 * Ms) + 102.9372 + 180);
  const L = 218.316 + 13.176396 * d;
  const Mm = (134.963 + 13.064993 * d) * RAD;
  const D = (297.8502 + 12.19074912 * d) * RAD; // mean elongation, for the evection and variation terms
  const moonLon = wrap(L + 6.289 * Math.sin(Mm) + 1.274 * Math.sin(2 * D - Mm) + 0.658 * Math.sin(2 * D) - 0.186 * Math.sin(Ms));
  return wrap(moonLon - sunLon);
}

const PHASES = [
  { id: 'new', name: 'New Moon', emoji: '🌑', kid: 'The Moon is hiding! Its sunny side faces away from us, so the sky is extra dark for stars.' },
  { id: 'waxing-crescent', name: 'Waxing crescent', emoji: '🌒', kid: 'A skinny smile of a Moon. Look low in the west after sunset.' },
  { id: 'first-quarter', name: 'First quarter', emoji: '🌓', kid: 'Half the Moon is lit. It is a quarter of the way around its trip around Earth.' },
  { id: 'waxing-gibbous', name: 'Waxing gibbous', emoji: '🌔', kid: 'Almost full and getting bigger every night!' },
  { id: 'full', name: 'Full Moon', emoji: '🌕', kid: 'The whole face is lit up. It rises right around sunset and shines all night.' },
  { id: 'waning-gibbous', name: 'Waning gibbous', emoji: '🌖', kid: 'A little less than full, and shrinking each night. It rises after dark.' },
  { id: 'last-quarter', name: 'Last quarter', emoji: '🌗', kid: 'Half lit again, the other half this time. Early birds can spot it in the morning sky.' },
  { id: 'waning-crescent', name: 'Waning crescent', emoji: '🌘', kid: 'A thin sliver, best seen before sunrise. A new Moon is coming soon.' },
];

// Next time the angle reaches `target` (0 or 180) after `from`.
function nextAngle(target, from) {
  const behind = (ms) => wrap(target - moonAngle(ms)); // degrees still to go
  let lo = from;
  let hi = from + 6 * 3_600_000;
  for (let i = 0; i < 140 && behind(hi) < behind(lo); i++) { lo = hi; hi += 6 * 3_600_000; }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (behind(mid) < behind(lo) && behind(mid) < 180) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export function moonInfo(now = Date.now()) {
  const angle = moonAngle(now);
  const phase = PHASES[Math.round(angle / 45) % 8];
  const illumination = Math.round(((1 - Math.cos(angle * RAD)) / 2) * 100);
  const nextFull = nextAngle(180, now);
  const nextNew = nextAngle(0, now);
  return {
    phase: phase.id,
    name: phase.name,
    emoji: phase.emoji,
    illumination,
    waxing: angle < 180,
    ageDays: Math.round((angle / 360) * 29.53 * 10) / 10,
    nextFull: new Date(nextFull).toISOString(),
    nextNew: new Date(nextNew).toISOString(),
    daysToFull: Math.round((nextFull - now) / DAY),
    kid: phase.kid,
  };
}
