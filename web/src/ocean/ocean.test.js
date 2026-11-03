import { describe, expect, test } from 'vitest';
import { CREATURES, LANDMARKS, MAX_DEPTH, OCEAN_QUIZ, ZONES, creatureOfWeek, depthLabel, lightAt, pressureAt, waveSense, zoneAt, zoneById } from './ocean.js';
import { depthAt, placeOf } from '../components/ocean/DepthExplorer.jsx';
import { dueBadges } from '../kid/badges.js';

describe('ocean content', () => {
  test('zones stack from the surface to Challenger Deep', () => {
    expect(ZONES[0].top).toBe(0);
    ZONES.slice(1).forEach((z, i) => expect(z.top).toBe(ZONES[i].bottom));
    expect(ZONES.at(-1).bottom).toBe(MAX_DEPTH);
    expect(zoneAt(150).id).toBe('sunlight');
    expect(zoneAt(3800).id).toBe('midnight');
    expect(zoneAt(MAX_DEPTH).id).toBe('trench');
  });
  test('every creature has a real zone and unique id; quiz answers are valid', () => {
    expect(new Set(CREATURES.map((c) => c.id)).size).toBe(CREATURES.length);
    for (const c of CREATURES) expect(zoneById(c.zone)).toBeTruthy();
    for (const q of OCEAN_QUIZ) expect(q.options[q.answer]).toBeTruthy();
    for (const l of LANDMARKS) expect(l.depth).toBeLessThanOrEqual(MAX_DEPTH);
  });
  test('creature of the week holds all week and changes on Monday', () => {
    const mon = creatureOfWeek(new Date(2026, 10, 2));
    expect(creatureOfWeek(new Date(2026, 10, 8))).toBe(mon);
    expect(creatureOfWeek(new Date(2026, 10, 9))).not.toBe(mon);
    expect(creatureOfWeek(new Date(2026, 10, 2), 1)).toBe(creatureOfWeek(new Date(2026, 10, 9)));
  });
  test('physics helpers', () => {
    expect(pressureAt(0)).toBe(1);
    expect(Math.round(pressureAt(MAX_DEPTH))).toBeGreaterThan(1000);
    expect(lightAt(200)).toBeCloseTo(1, 0);
    expect(depthLabel(1000, 'metric')).toBe('1,000 m');
    expect(depthLabel(1000, 'imperial')).toBe('3,281 ft');
    expect(waveSense(4)).toMatch(/counter/);
  });
  test('the depth scale gives each zone equal room and round-trips', () => {
    expect(depthAt(0)).toBe(0);
    expect(depthAt(0.2)).toBe(200);
    expect(depthAt(1)).toBe(MAX_DEPTH);
    for (const m of [0, 50, 200, 3800, 8849]) expect(depthAt(placeOf(m))).toBeCloseTo(m, 6);
  });
});

describe('ocean badges', () => {
  test('reading, meeting, diving, buoys and a perfect quiz', () => {
    const day = '2026-11-02';
    const progress = {
      discoveries: { a: day, b: day, c: day },
      creatures: Object.fromEntries(CREATURES.slice(0, 5).map((c) => [c.id, day])),
      oceanZones: Object.fromEntries(ZONES.map((z) => [z.id, day])),
      buoys: { 44014: day },
      quizzes: { 'ocean-explorer': 6 },
      perfect: { 'ocean-explorer': 1 },
    };
    expect(dueBadges({ progress })).toEqual(expect.arrayContaining(['ocean-reporter', 'creature-friend', 'deep-diver', 'buoy-watcher', 'ocean-scholar', 'quiz-first', 'quiz-perfect']));
    expect(dueBadges({ progress: { oceanZones: { sunlight: day } } })).not.toContain('deep-diver');
  });
});
