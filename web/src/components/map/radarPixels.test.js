import { describe, it, expect } from 'vitest';
import { toCode, toDbz, decodeN0q, decodeUb, despeckle, upsample, paint, codeColor, MIN_DBZ } from './radarPixels.js';

const rgba = (...colors) => new Uint8ClampedArray(colors.flatMap((h) => [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16))));

describe('one radar look for North America', () => {
  it('stores dBZ as IEM n0q codes', () => {
    expect(toCode(0)).toBe(64);
    expect(toDbz(toCode(42.5))).toBe(42.5);
    expect(toDbz(0)).toBeNull();
  });

  it('reads the US mosaic back to dBZ', () => {
    // n0q palette: index 105 (20.5 dBZ) is 43d67e, 145 (40.5) is ffe200, 164 (50) is ff0000.
    const codes = decodeN0q(rgba('43d67eff', 'ffe200ff', 'ff0000ff', '00000000'));
    expect([...codes].map(toDbz)).toEqual([20.5, 40.5, 50, null]);
    // A resampled in-between colour lands on the closest entry.
    expect(toDbz(decodeN0q(rgba('fe0101ff'))[0])).toBe(50);
  });

  it('reads Canada/Mexico back to dBZ on the same scale', () => {
    // Universal Blue 40 dBZ is ffaa00 (yellow), its first rain colour above 25 dBZ.
    const [c] = decodeUb(rgba('ffaa00ff'));
    expect(toDbz(c)).toBe(40);
    expect(decodeUb(rgba('00000000'))[0]).toBe(0);
  });

  it('paints both in the same NWS colours, nothing under the cut-off', () => {
    expect(codeColor(toCode(37))).toEqual([0xfd, 0xf8, 0x02, 255]); // 35-40 dBZ yellow
    expect(codeColor(toCode(MIN_DBZ - 1))[3]).toBe(0);
    const px = new Uint8ClampedArray(8);
    paint(Uint8Array.of(toCode(37), 0), px);
    expect([...px]).toEqual([0xfd, 0xf8, 0x02, 255, 0, 0, 0, 0]);
  });

  it('drops lonely weak dots but keeps patches and strong cells', () => {
    const w = 5;
    const g = new Uint8Array(25);
    g[0] = toCode(15); // lonely, weak: speckle
    g[4] = toCode(45); // lonely but strong: a real small cell
    for (const i of [17, 18, 22, 23]) g[i] = toCode(15); // a weak patch
    g[10] = toCode(5); // under the cut-off
    const out = despeckle(g, w, 5);
    expect(out[0]).toBe(0);
    expect(out[4]).toBe(g[4]);
    expect([17, 18, 22, 23].every((i) => out[i] === g[i])).toBe(true);
    expect(out[10]).toBe(0);
  });

  it('smooths a zoomed-in square in dBZ, tapering at the edges', () => {
    const size = 4;
    const g = new Uint8Array(16);
    g[5] = toCode(40); g[6] = toCode(40); g[9] = toCode(40); g[10] = toCode(40);
    // Blow up the middle 2x2 to 4x4: all solid 40 in the middle...
    const mid = upsample(g, size, 1, 1, 2);
    expect(toDbz(mid[1 * 4 + 1])).toBe(40);
    // ...and a soft but present edge, never a colour that isn't on the scale.
    const edge = upsample(g, size, 0, 0, 2);
    expect(edge[0]).toBe(0);
    expect(toDbz(edge[15])).toBeGreaterThan(MIN_DBZ);
    expect(toDbz(edge[15])).toBeLessThanOrEqual(40);
  });
});
