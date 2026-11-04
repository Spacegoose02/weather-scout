import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, tabsFor } from './nav.js';

describe('tabsFor', () => {
  it('gives grown-ups six tabs with AI on and five without', () => {
    expect(tabsFor(false, true).map((t) => t.id)).toEqual(['today', 'map', 'learn', 'models', 'news', 'ask']);
    expect(tabsFor(false, false)).toHaveLength(5);
  });
  it('gives kids their own row with no Models, News or full radar', () => {
    const ids = tabsFor(true, true).map((t) => t.id);
    expect(ids).toEqual(['today', 'play', 'explore', 'chaser', 'school', 'ask']);
    expect(ids).not.toContain('models');
    expect(ids).not.toContain('news');
  });
});

describe('parseRoute', () => {
  it('reads a tab and a Learn section', () => {
    expect(parseRoute('#map')).toEqual({ tab: 'map', section: null });
    expect(parseRoute('#learn/ocean')).toEqual({ tab: 'learn', section: 'ocean' });
    expect(parseRoute('#learn')).toEqual({ tab: 'learn', section: 'lessons' });
  });
  it('sends old links to where things live now', () => {
    expect(parseRoute('#ocean')).toEqual({ tab: 'learn', section: 'ocean' });
    expect(parseRoute('#kids')).toEqual({ tab: 'today', section: null });
    expect(parseRoute('#ocean', { kidMode: true })).toEqual({ tab: 'school', section: 'ocean' });
    expect(parseRoute('#learn/storms', { kidMode: true })).toEqual({ tab: 'school', section: 'storms' });
  });
  it('keeps kids out of grown-up tabs and the other way round', () => {
    expect(parseRoute('#models', { kidMode: true }).tab).toBe('today');
    expect(parseRoute('#map', { kidMode: true }).tab).toBe('chaser');
    expect(parseRoute('#play').tab).toBe('today');
  });
  it('hides Ask when AI is off and falls back to Today for junk', () => {
    expect(parseRoute('#ask').tab).toBe('today');
    expect(parseRoute('#ask', { aiOn: true }).tab).toBe('ask');
    expect(parseRoute('#nope/zzz')).toEqual({ tab: 'today', section: null });
    expect(parseRoute('')).toEqual({ tab: 'today', section: null });
    expect(parseRoute('#learn/zzz').section).toBe('lessons');
  });
});

describe('routeHash', () => {
  it('round-trips', () => {
    expect(routeHash({ tab: 'learn', section: 'ocean' })).toBe('#learn/ocean');
    expect(routeHash({ tab: 'learn', section: 'lessons' })).toBe('#learn');
    expect(routeHash({ tab: 'map', section: null })).toBe('#map');
    expect(parseRoute(routeHash({ tab: 'school', section: 'storms' }), { kidMode: true })).toEqual({ tab: 'school', section: 'storms' });
  });
});
