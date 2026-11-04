import { describe, it, expect } from 'vitest';
import { GUIDES, LEGENDS, guideFor, legendFor, productGroups, shortName } from './radarGuide.js';

const products = [
  { id: 'composite', name: 'Radar', legend: 'dbz' },
  { id: 'site', name: 'Reflectivity', legend: 'dbz', site: true },
  { id: 'velocity', name: 'Velocity', legend: 'vel', site: true },
  { id: 'srv', name: 'Storm-relative velocity', legend: 'vel', site: true },
  { id: 'cc', name: 'Correlation coefficient', legend: 'cc', site: true },
  { id: 'zdr', name: 'Differential reflectivity (ZDR)', legend: 'zdr', site: true },
  { id: 'kdp', name: 'Specific differential phase (KDP)', legend: 'kdp', site: true },
  { id: 'echotops', name: 'Echo tops', legend: 'eet' },
];

describe('radar guide', () => {
  it('has a color scale for every product, falling back to reflectivity', () => {
    for (const p of products) expect(legendFor(p)).toBe(LEGENDS[p.legend]);
    expect(legendFor({ legend: 'nope' })).toBe(LEGENDS.dbz);
    expect(legendFor(undefined)).toBe(LEGENDS.dbz);
    for (const l of Object.values(LEGENDS)) {
      expect(l.stops.length).toBeGreaterThan(2);
      expect(l.ends.length).toBe(3);
    }
  });
  it('explains every one-radar product and pairs it with another real one', () => {
    for (const p of products.filter((x) => x.site)) {
      const g = guideFor(p);
      expect(g.title).toBeTruthy();
      expect(g.look.length).toBeGreaterThan(0);
      expect(products.some((x) => x.id === g.pair && x.id !== p.id)).toBe(true);
    }
    expect(guideFor(products[0])).toBe(null);
    expect(guideFor(null)).toBe(null);
  });
  it('calls out the tornado debris signature and the velocity couplet', () => {
    expect(GUIDES.cc.look.join(' ')).toMatch(/debris/i);
    expect(GUIDES.cc.safety).toMatch(/shelter/i);
    expect(GUIDES.velocity.look.join(' ')).toMatch(/couplet/i);
    expect(GUIDES.velocity.look.join(' ')).toMatch(/microburst/i);
    expect(GUIDES.srv.look.join(' ')).toMatch(/mesocyclone/i);
    expect(GUIDES.zdr.look.join(' ')).toMatch(/hail/i);
  });
  it('groups the picker into whole-US and one-radar products', () => {
    const g = productGroups(products);
    expect(g.map((x) => x.products.map((p) => p.id))).toEqual([['composite', 'echotops'], ['site', 'velocity', 'srv', 'cc', 'zdr', 'kdp']]);
    expect(productGroups([products[0]]).length).toBe(1);
    expect(shortName(products[4])).toBe('CC');
    expect(shortName(products[0])).toBe('Radar');
  });
});
