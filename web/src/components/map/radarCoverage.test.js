import { describe, it, expect } from 'vitest';
import { pairFill, NEXRAD_EXTENT, maskRect, worldPixel, inView } from '../../../../shared/radarcoverage.js';

describe('radar fill for Canada and Mexico', () => {
  it('projects like Leaflet', () => {
    expect(worldPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(worldPixel(0, -180, 1).x).toBe(0);
  });

  it('cuts the NEXRAD box out of tiles', () => {
    // z4 tile 3,5 is about 112-90°W, 41-56°N: Minnesota/Ontario, partly inside.
    const r = maskRect({ x: 3, y: 5, z: 4 });
    expect(r.full).toBe(false);
    expect(r.x).toBe(0);
    expect(r.y).toBeGreaterThan(0);
    expect(r.y + r.h).toBe(256);
    // A tile over Kansas at z7 is entirely US: skip it.
    const k = worldPixel(38.5, -98, 7);
    expect(maskRect({ x: Math.floor(k.x / 256), y: Math.floor(k.y / 256), z: 7 }).full).toBe(true);
    // Mexico City (19.4°N, 99.1°W) at z7 is outside the box.
    const p = worldPixel(19.4, -99.1, 7);
    expect(maskRect({ x: Math.floor(p.x / 256), y: Math.floor(p.y / 256), z: 7 })).toBeNull();
    expect(NEXRAD_EXTENT.north).toBe(50);
  });

  it('pairs each NEXRAD frame with the closest earlier fill frame', () => {
    const fill = ['18:00', '18:10', '18:20'].map((t) => ({ time: `2026-11-07T${t}:00.000Z`, url: t }));
    expect(pairFill('2026-11-07T18:15:00.000Z', fill).url).toBe('18:20');
    expect(pairFill('2026-11-07T18:14:00.000Z', fill).url).toBe('18:10');
    expect(pairFill('2026-11-07T17:30:00.000Z', fill).url).toBe('18:00');
    expect(pairFill('2026-11-07T18:15:00.000Z', [])).toBeNull();
  });

  it('knows the covered area', () => {
    expect(inView(45.4, -75.7)).toBe(true); // Ottawa
    expect(inView(19.4, -99.1)).toBe(true); // Mexico City
    expect(inView(21.3, -157.9)).toBe(true); // Honolulu
    expect(inView(51.5, -0.1)).toBe(false); // London
  });
});
