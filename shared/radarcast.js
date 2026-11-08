// Minute-by-minute rain from the radar itself (a "nowcast"): take the two
// latest US radar mosaics 10 minutes apart, work out which way the rain is
// sliding, and slide it forward an hour to see when it reaches you. This is
// how most "rain starting in 12 minutes" apps work; it is very good for the
// next 30 to 60 minutes and knows nothing about storms that have not formed
// yet. Pure functions on small grids, shared by the server and the web app.

export const STEP_MIN = 5;
export const HORIZON_MIN = 60;
export const WET_DBZ = 18; // light rain on radar
export const FRAME_GAP_MIN = 10;

// Radar reflectivity (dBZ) -> rain rate in mm per hour (Marshall-Palmer, Z = 200 R^1.6).
export function dbzToRate(dbz) {
  if (dbz == null || dbz < WET_DBZ) return 0;
  const z = 10 ** (Math.min(dbz, 60) / 10);
  return Math.round(((z / 200) ** (1 / 1.6)) * 100) / 100;
}

// A rough word for a rain rate in mm/h (snow reads lighter on radar, but the
// words still work: light, moderate, heavy).
export function rateWord(mmh) {
  if (!mmh) return 'dry';
  if (mmh < 2.5) return 'light';
  if (mmh < 8) return 'moderate';
  if (mmh < 30) return 'heavy';
  return 'very heavy';
}

// The shift (in grid cells) that best moves frame `a` onto frame `b`: the
// smallest average difference over the cells where either frame has rain.
// Grids are { w, h, data: Float32Array of dBZ (NaN or < WET_DBZ = dry) }.
export function estimateMotion(a, b, { maxShift = 10, minWet = 25 } = {}) {
  const { w, h } = a;
  const val = (g, x, y) => {
    const v = g.data[y * w + x];
    return Number.isFinite(v) && v >= WET_DBZ ? v : 0;
  };
  let wet = 0;
  for (let i = 0; i < w * h; i++) if ((b.data[i] ?? 0) >= WET_DBZ) wet++;
  if (wet < minWet) return null;
  let best = null;
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sum = 0;
      let n = 0;
      // b(x, y) should look like a(x - dx, y - dy)
      for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y++) {
        for (let x = Math.max(0, dx); x < Math.min(w, w + dx); x++) {
          const vb = val(b, x, y);
          const va = val(a, x - dx, y - dy);
          if (!vb && !va) continue;
          sum += Math.abs(vb - va);
          n++;
        }
      }
      if (n < minWet) continue;
      // A tiny nudge toward "no motion" so a flat, featureless field does not drift.
      const score = sum / n + 0.02 * Math.hypot(dx, dy);
      if (!best || score < best.score) best = { dx, dy, score, n };
    }
  }
  return best;
}

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

// What the radar will show over cell (x, y) every 5 minutes for the next hour,
// if the rain keeps sliding `perMin` cells a minute. A 3 x 3 median keeps one
// noisy pixel from starting a "rain in 5 minutes".
export function extrapolate(grid, x, y, perMin, { horizon = HORIZON_MIN, step = STEP_MIN, ageMin = 0 } = {}) {
  const out = [];
  for (let m = 0; m <= horizon; m += step) {
    const t = m + ageMin; // the frame is a few minutes old already
    const sx = Math.round(x - (perMin ? perMin.dx * t : 0));
    const sy = Math.round(y - (perMin ? perMin.dy * t : 0));
    const vals = [];
    let inside = false;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const xx = sx + i;
        const yy = sy + j;
        if (xx < 0 || yy < 0 || xx >= grid.w || yy >= grid.h) continue;
        inside = true;
        const v = grid.data[yy * grid.w + xx];
        vals.push(Number.isFinite(v) ? v : -30);
      }
    }
    const dbz = inside ? median(vals) : null;
    out.push({ min: m, dbz: dbz == null ? null : Math.round(dbz), rate: dbz == null ? null : dbzToRate(dbz) });
  }
  return out;
}

// "Rain starting in about 15 minutes", "Rain ending in about 25 minutes",
// "No rain on radar for the next hour". `snow` swaps the word.
export function nowcastText(steps, { snow = false } = {}) {
  const word = snow ? 'Snow' : 'Rain';
  const known = steps.filter((s) => s.rate != null);
  if (!known.length) return null;
  const wetNow = (known[0].rate || 0) > 0;
  const change = known.findIndex((s) => ((s.rate || 0) > 0) !== wetNow);
  const peak = known.reduce((p, s) => (s.rate > (p?.rate || 0) ? s : p), null);
  const about = (m) => (m <= 5 ? 'in the next 5 minutes' : `in about ${Math.round(m / 5) * 5} minutes`);
  if (wetNow) {
    if (change < 0) return `${word} for at least the next hour${peak && rateWord(peak.rate) !== rateWord(known[0].rate) ? `, ${rateWord(peak.rate)} at times` : ''}.`;
    return `${rateWord(known[0].rate)[0].toUpperCase()}${rateWord(known[0].rate).slice(1)} ${word.toLowerCase()} ending ${about(known[change].min)}.`;
  }
  if (change < 0) return `No ${word.toLowerCase()} on radar for the next hour.`;
  const start = known[change];
  const after = known.slice(change);
  const top = after.reduce((p, s) => Math.max(p, s.rate || 0), 0);
  const stop = after.findIndex((s) => !(s.rate > 0));
  return `${rateWord(top)[0].toUpperCase()}${rateWord(top).slice(1)} ${word.toLowerCase()} starting ${about(start.min)}${stop > 0 ? `, lasting about ${after[stop].min - start.min} minutes` : ''}.`;
}

// Cells a minute -> compass heading and miles per hour.
export function motionVector(perMin, cellMiles) {
  if (!perMin) return null;
  const east = perMin.dx * cellMiles.x;
  const north = -perMin.dy * cellMiles.y;
  const mph = Math.round(Math.hypot(east, north) * 60);
  if (mph < 2) return { heading: null, mph: 0 };
  const heading = Math.round((((Math.atan2(east, north) * 180) / Math.PI) + 360) % 360);
  return { heading, mph };
}
