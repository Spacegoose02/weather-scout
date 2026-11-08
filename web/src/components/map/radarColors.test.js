import { describe, it, expect } from 'vitest';
import { nwsColor, recolorPixels, ubToDbz } from './radarColors.js';
import { nexradReach, worldPixel } from '../../../../shared/radarcoverage.js';

describe('Canada/Mexico radar in NEXRAD colours', () => {
  it('reads dBZ back from Universal Blue rain and snow', () => {
    expect(ubToDbz(0x00, 0xa3, 0xe0, 255)).toBe(20); // blue
    expect(ubToDbz(0xff, 0xee, 0x00, 255)).toBe(35); // yellow
    expect(ubToDbz(0xc1, 0x00, 0x00, 255)).toBe(50); // dark red
    expect(ubToDbz(0x4f, 0x8f, 0xff, 255)).toBe(30); // snow
    expect(ubToDbz(0, 0, 0, 0)).toBe(null);
  });

  it('paints them in NWS colours: green for moderate, yellow and red for heavy', () => {
    const px = new Uint8ClampedArray([0x00, 0x55, 0x88, 255, 0xff, 0xaa, 0x00, 255, 0x82, 0x7b, 0x69, 0x49, 0, 0, 0, 0]);
    recolorPixels(px);
    expect([...px.slice(0, 4)]).toEqual([...nwsColor(30)]); // 30 dBZ: green
    expect([...px.slice(4, 8)]).toEqual([...nwsColor(40)]); // 40 dBZ: gold
    expect(px[11]).toBe(0); // 0 dBZ mist: left out, as on the US mosaic
    expect(px[15]).toBe(0);
    expect(nwsColor(30)).toEqual([0x00, 0x8e, 0x00, 255]);
  });
});

describe('blending the US and Canada/Mexico radar', () => {
  const tileAt = (lat, lon, z) => { const p = worldPixel(lat, lon, z); return { x: Math.floor(p.x / 256), y: Math.floor(p.y / 256), z }; };
  const sites = [[46.04, -67.81], [42.95, -78.74], [38.81, -94.26]]; // Caribou, Buffalo, Kansas City

  it('skips tiles a US radar sees well', () => {
    expect(nexradReach(tileAt(38.8, -94.3, 8), sites).covered).toBe(true);
  });

  it('keeps the Canada/Mexico layer past their range inside the box, with a soft edge', () => {
    // Halifax: inside the NEXRAD box's east edge, but 330 km from Caribou.
    const r = nexradReach(tileAt(44.65, -63.57, 7), sites);
    expect(r.covered).toBe(false);
    // Over Maine the Caribou radar reaches in.
    const m = nexradReach(tileAt(45.5, -68.5, 6), sites);
    expect(m.circles.length).toBeGreaterThan(0);
    expect(m.circles[0].far).toBeGreaterThan(m.circles[0].near);
  });
});
