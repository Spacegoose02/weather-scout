// RainViewer's free tiles come in one colour scheme ("Universal Blue": blue,
// then yellow, red and pink), while the US NEXRAD mosaic uses the NWS colours
// (cyan, green, yellow, red). Side by side they looked like two different storms.
// These turn a RainViewer pixel back into its dBZ and paint it in NWS colours.

// Universal Blue, from RainViewer's colour table, dBZ -10 up: rain, then snow.
const RAIN = [
  '63615914', '66635a19', '69665c1e', '6c685d24', '6f6b5f29', '726e612e', '75706234', '78736439', '7c75653e', '7f786744',
  '827b6949', '857d6a4e', '88806c54', '8b826d59', '8e856f5e', '92887164', '9e93756e', 'aa9e7978', 'b6a97e82', 'c2b4828c',
  'cec08796', 'd2c48ba0', 'd6c88faa', 'dacc93b4', 'ded097be', '88ddeeff', '6cd1ebff', '51c5e8ff', '36bae5ff', '1baee2ff',
  '00a3e0ff', '009ad5ff', '0091caff', '0088bfff', '007fb4ff', '0077aaff', '0070a3ff', '00699cff', '006295ff', '005b8eff',
  '005588ff', '005180ff', '004e78ff', '004a70ff', '004768ff', 'ffee00ff', 'ffe000ff', 'ffd200ff', 'ffc500ff', 'ffb700ff',
  'ffaa00ff', 'ff9f00ff', 'ff9500ff', 'ff8b00ff', 'ff8100ff', 'ff4400ff', 'f23600ff', 'e62800ff', 'd91b00ff', 'cd0d00ff',
  'c10000ff', 'a80000ff', '8f0000ff', '760000ff', '5d0000ff', 'ffaaffff', 'ff9fffff', 'ff95ffff', 'ff8bffff', 'ff81ffff',
  'ff77ffff', 'ff6cffff', 'ff62ffff', 'ff58ffff', 'ff4effff', 'ffffffff',
];
const SNOW = [
  'ceffff0c', 'cdffff19', 'ccffff26', 'cbffff33', 'cbffff3f', 'caffff4c', 'c9ffff59', 'c8ffff66', 'c7ffff72',
  'c7ffff7f', 'c6ffff8c', 'c5ffff99', 'c4ffffa5', 'c3ffffb2', 'c3ffffbf', 'c2ffffcc', 'c1ffffd8', 'c0ffffe5', 'bffffff2',
  'bfffffff', 'b8f8ffff', 'b2f2ffff', 'abebffff', 'a5e5ffff', '9fdfffff', '98d8ffff', '92d2ffff', '8bcbffff', '85c5ffff',
  '7fbfffff', '78b8ffff', '72b2ffff', '6babffff', '65a5ffff', '5f9fffff', '5b9bffff', '5898ffff', '5595ffff', '5292ffff',
  '4f8fffff', '4b8bffff', '4888ffff', '4585ffff', '4282ffff', '3f7fffff', '3b7bffff', '3878ffff', '3575ffff', '3272ffff',
  '2f6fffff', '2b6bffff', '2868ffff', '2565ffff', '2262ffff', '1f5fffff', '1b5bffff', '1858ffff', '1555ffff', '1252ffff',
  '0f4fffff', '0c4bffff', '0948ffff', '0645ffff', '0242ffff', '003fffff', '003bffff', '0038ffff', '0035ffff', '0032ffff',
  '002fffff', '002bffff', '0028ffff', '0025ffff', '0022ffff', '001fffff',
];
const hex = (h) => [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
const ENTRIES = [
  ...RAIN.map((h, i) => ({ c: hex(h), dbz: -10 + i })),
  ...SNOW.map((h, i) => ({ c: hex(h), dbz: -9 + i })),
];

// NWS reflectivity colours (as on the NEXRAD mosaic), one per 5 dBZ from 5.
const NWS = ['04e9e7', '019ff4', '0300f4', '02fd02', '01c501', '008e00', 'fdf802', 'e5bc00', 'fd9500', 'fd0000', 'd40000', 'bc0000', 'f800fd', '9854c6', 'fdfdfd']
  .map((h) => hex(`${h}ff`));

/** NWS colour [r, g, b, a] for a dBZ value; light drizzle under 5 dBZ is left out. */
export function nwsColor(dbz) {
  if (dbz == null || dbz < 5) return [0, 0, 0, 0];
  return NWS[Math.min(NWS.length - 1, Math.floor((dbz - 5) / 5))];
}

/** The dBZ of a Universal Blue pixel (rain or snow), or null for an empty one. */
export function ubToDbz(r, g, b, a) {
  if (a < 24) return null;
  let best = null;
  let bestD = Infinity;
  for (const e of ENTRIES) {
    // Smoothed edges fade out, so faint pixels are matched mostly on colour.
    const da = a > 240 ? (e.c[3] - a) * 0.5 : 0;
    const d = (e.c[0] - r) ** 2 + (e.c[1] - g) ** 2 + (e.c[2] - b) ** 2 + da * da;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best.dbz;
}

const memo = new Map();

/** Repaint RGBA pixels (an ImageData's data) from Universal Blue to NWS colours, in place. */
export function recolorPixels(px) {
  for (let o = 0; o < px.length; o += 4) {
    const a = px[o + 3];
    if (!a) continue;
    const key = ((px[o] << 24) | (px[o + 1] << 16) | (px[o + 2] << 8) | a) >>> 0;
    let out = memo.get(key);
    if (!out) {
      const c = nwsColor(ubToDbz(px[o], px[o + 1], px[o + 2], a));
      // Keep the soft edge: a half-faded pixel stays half faded.
      out = [c[0], c[1], c[2], c[3] ? Math.min(255, Math.round(255 * Math.min(1, a / 200))) : 0];
      if (memo.size > 50_000) memo.clear();
      memo.set(key, out);
    }
    px[o] = out[0]; px[o + 1] = out[1]; px[o + 2] = out[2]; px[o + 3] = out[3];
  }
  return px;
}
