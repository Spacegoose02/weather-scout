// One look for radar everywhere. The US mosaic (IEM's NEXRAD n0q) and the
// Canada/Mexico layer (RainViewer) come as pictures in different colours and
// detail, so both are turned back into dBZ per pixel, cleaned the same way and
// painted with the same NWS colours. Zoomed in past a source's real detail, the
// dBZ is smoothed up from its last real zoom, so edges are curves, not blocks.

import { ubToDbz } from './radarColors.js';

// A pixel's dBZ is stored as one byte: code = dBZ * 2 + 64 (0.5 dBZ steps from
// -32), which is IEM's own n0q index. 0 means no echo.
export const toCode = (dbz) => Math.max(1, Math.min(255, Math.round(dbz * 2 + 64)));
export const toDbz = (code) => (code ? code / 2 - 32 : null);

// Under 10 dBZ is mostly clear-air return, bugs and ground clutter, which
// sprinkled grey dots over half the country.
export const MIN_DBZ = 10;
const MIN_CODE = toCode(MIN_DBZ);

// IEM's n0q colour table, index = code. Read from the mosaic's own PNG palette.
const N0Q = [
  '000000', '85718f', '85728f', '86738d', '87758b', '87768b', '887789', '897987', '897a87', '8a7b85', '8b7d84', '8b7e84', '8c7f82', '8d8180', '8d8280', '8e837e',
  '8f847c', '8f857c', '90877b', '918879', '918979', '928b77', '938d75', '969153', '989457', '9b975b', '9d9a60', 'a09d64', 'a3a068', 'a5a36d', 'a8a671', 'aaa976',
  'adac7a', 'b0af7e', 'b2b283', 'b7b88c', 'babb90', 'bdbe94', 'bfc199', 'c2c49d', 'c4c7a2', 'c7caa6', 'cacdaa', 'ccd0af', 'd2d4b4', 'cfd2b4', 'c9ccb4', 'c6c9b4',
  'c3c7b4', 'c0c4b4', 'bdc1b4', 'b9beb4', 'b6bbb4', 'b3b9b4', 'b0b6b4', 'adb3b4', 'aab0b4', 'a4abb4', 'a0a8b4', '9da5b4', '9aa2b4', '97a0b4', '949db4', '919ab4',
  '949bb5', '9098b4', '8c95b3', '8892b2', '808cb0', '7c89af', '7886ae', '7483ac', '7080ab', '6c7daa', '6779a9', '6376a8', '5f73a7', '5b70a6', '576da4', '4f67a2',
  '4b64a1', '4761a0', '435e9f', '415b9e', '4361a2', '4568a6', '486faa', '4a76ae', '4d7db2', '4f84b6', '518bbb', '5699c3', '599fc7', '5ba6cb', '5eadcf', '60b4d4',
  '62bbd8', '65c2dc', '67c9e0', '6ad0e4', '6fd6e8', '68d6d7', '59d6b3', '52d6a2', '4bd690', '43d67e', '3cd66d', '35d65b', '11d518', '11d117', '10cd17', '10c816',
  '10c416', '0fbc15', '0fb714', '0eb314', '0eaf13', '0eab13', '0da612', '0da212', '0d9e11', '0c9911', '0c9510', '0c9110', '0b880f', '0b840e', '0a800e', '0a7c0d',
  '0a770d', '09730c', '096f0c', '096b0b', '08660b', '08620a', '095e09', '327308', '467d08', '5b8807', '6f9207', '849d06', '98a806', 'adb205', 'c1bd05', 'd6c704',
  'ead204', 'ffe200', 'ffd800', 'ffd300', 'ffce00', 'ffc900', 'ffc400', 'ffc000', 'ffbb00', 'ffb600', 'ffb100', 'ffac00', 'ffa700', 'ffa200', 'ff9900', 'ff9400',
  'ff8f00', 'ff8a00', 'ff8500', 'ff8000', 'ff0000', 'f80000', 'f10000', 'ea0000', 'e30000', 'd50000', 'cd0000', 'c60000', 'bf0000', 'b80000', 'b10000', 'aa0000',
  'a30000', '9b0000', '940000', '8d0000', '7f0000', '780000', '710000', 'ffffff', 'fff5ff', 'ffeaff', 'ffdfff', 'ffd4ff', 'ffc9ff', 'ffbeff', 'ffb3ff', 'ff9dff',
  'ff92ff', 'ff75ff', 'fc6bfd', 'f960fa', 'f656f7', 'f34bf4', 'f040f1', 'ed36ef', 'ea2bec', 'e720e9', 'e10be3', 'b200ff', 'ac00fc', 'a400f7', '9b00f4', '9300ef',
  '8800ea', '8300e8', '7900e2', '7200dd', '6900db', '05ecf0', '05ebf0', '05eaf0', '05dde0', '05dce0', '05dbe0', '05cdd0', '05ccd0', '04bdc0', '04bcc0', '04bbc0',
  '04aeb0', '04adb0', '049ea0', '049da0', '049ca0', '038e90', '038d90', '038c90', '037e80', '037d80', '036f70', '036e70', '036d70', '025f60', '025e60', '024f50',
  '024e50', '024d50', '023f40', '023e40', '023d40', '013030', '012f30', '012020', '011f20', '011e20', '3a67b5', '3a66b5', '3a65b5', '3a64b5', '3a63b5', '3a62b5',];
const pack = (r, g, b) => (r << 16) | (g << 8) | b;
const N0Q_CODE = new Map();
N0Q.forEach((h, i) => { if (i) N0Q_CODE.set(parseInt(h, 16), i); });

// NWS reflectivity colours, one per 5 dBZ from 5 (as in the legend).
const NWS = ['04e9e7', '019ff4', '0300f4', '02fd02', '01c501', '008e00', 'fdf802', 'e5bc00', 'fd9500', 'fd0000', 'd40000', 'bc0000', 'f800fd', '9854c6', 'fdfdfd'];

/** [r, g, b, a] painted for a code. */
export function codeColor(code) {
  if (!code || code < MIN_CODE) return [0, 0, 0, 0];
  const h = NWS[Math.min(NWS.length - 1, Math.floor((toDbz(code) - 5) / 5))];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(255);
}
// Canvas pixels are little-endian RGBA, so one 32-bit word per colour.
const LUT = new Uint32Array(256);
for (let c = 0; c < 256; c++) {
  const [r, g, b, a] = codeColor(c);
  LUT[c] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function nearest(table, r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < table.length; i++) {
    const v = parseInt(table[i], 16);
    const d = ((v >> 16) - r) ** 2 + (((v >> 8) & 255) - g) ** 2 + ((v & 255) - b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const n0qMemo = new Map();
/** dBZ codes from an IEM n0q tile's RGBA pixels. */
export function decodeN0q(px) {
  const out = new Uint8Array(px.length / 4);
  let lastKey = -1;
  let last = 0;
  for (let o = 0, i = 0; o < px.length; o += 4, i++) {
    if (px[o + 3] < 128) continue;
    const key = pack(px[o], px[o + 1], px[o + 2]);
    if (key !== lastKey) {
      lastKey = key;
      last = N0Q_CODE.get(key);
      if (last === undefined) {
        // Not an exact palette colour (a resampled edge): take the closest.
        last = n0qMemo.get(key);
        if (last === undefined) {
          last = nearest(N0Q, px[o], px[o + 1], px[o + 2]);
          if (n0qMemo.size > 20_000) n0qMemo.clear();
          n0qMemo.set(key, last);
        }
      }
    }
    out[i] = last;
  }
  return out;
}

const ubMemo = new Map();
/** dBZ codes from a RainViewer "Universal Blue" tile's RGBA pixels. */
export function decodeUb(px) {
  const out = new Uint8Array(px.length / 4);
  for (let o = 0, i = 0; o < px.length; o += 4, i++) {
    const a = px[o + 3];
    if (a < 24) continue;
    const key = ((px[o] << 24) | (px[o + 1] << 16) | (px[o + 2] << 8) | a) >>> 0;
    let c = ubMemo.get(key);
    if (c === undefined) {
      const dbz = ubToDbz(px[o], px[o + 1], px[o + 2], a);
      c = dbz == null ? 0 : toCode(dbz);
      if (ubMemo.size > 50_000) ubMemo.clear();
      ubMemo.set(key, c);
    }
    out[i] = c;
  }
  return out;
}

/**
 * Drops weak, lonely pixels (clutter and clear-air speckle): under 20 dBZ with
 * at most one shown neighbour. Real light rain comes in patches and stays.
 */
export function despeckle(codes, w, h) {
  const weak = toCode(20);
  const out = new Uint8Array(codes);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = codes[y * w + x];
      if (!c || c >= weak) continue;
      if (c < MIN_CODE) { out[y * w + x] = 0; continue; }
      let n = 0;
      for (let dy = -1; dy <= 1 && n < 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if ((dx || dy) && xx >= 0 && xx < w && codes[yy * w + xx] >= MIN_CODE) n++;
        }
      }
      if (n < 2) out[y * w + x] = 0;
    }
  }
  return out;
}

/**
 * Smooths one square of a size x size code grid (from sx, sy, `span` pixels
 * wide) up to a full size x size grid, blending dBZ (not colours) so the
 * outlines come out as curves. No echo blends as 0 dBZ, so edges taper.
 */
export function upsample(codes, size, sx, sy, span) {
  const out = new Uint8Array(size * size);
  const zero = toCode(0);
  const at = (x, y) => {
    const c = codes[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
    return c > zero ? c : zero;
  };
  const step = span / size;
  for (let y = 0; y < size; y++) {
    const fy = sy + (y + 0.5) * step - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = sx + (x + 0.5) * step - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      const v = Math.round(top * (1 - ty) + bot * ty);
      out[y * size + x] = v >= MIN_CODE ? v : 0;
    }
  }
  return out;
}

/** Paints codes into an ImageData's pixels. */
export function paint(codes, data) {
  const words = new Uint32Array(data.buffer, data.byteOffset, codes.length);
  for (let i = 0; i < codes.length; i++) words[i] = LUT[codes[i]];
  return data;
}
