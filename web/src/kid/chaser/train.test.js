import { describe, it, expect } from 'vitest';
import { BADGES } from '../logic.js';
import {
  RADAR_LESSONS, SCENES, COUPLET, challengeRounds, dbzColor, hitTarget, radarField, radarStatus, velocityAt, velocityColor, CHALLENGE_KINDS,
} from './radar.js';
import { MODULES, PASS_EXAM, EXAM_QUESTIONS, buildReport, certificateHtml, examQuestions, spotterStatus } from './spotter.js';
import { MISSIONS, START, brewStorm, EF_SCALE, efWindLabel } from './lab.js';
import { RANKS, addEntry, entryPoints, logBadges, logStats } from './logbook.js';

const badgeIds = new Set(BADGES.map((b) => b.id));
const W = 200;
const H = 150;
const peakNear = (field, { x, y }, rad = 0.03) => {
  let best = 0;
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
    if (Math.hypot(i / W - x, (j / H) * 0.75 - y) <= rad) best = Math.max(best, field[j * W + i]);
  }
  return best;
};

describe('radar detective', () => {
  it('colors radar like a forecaster: nothing for tiny echoes, purple for hail', () => {
    expect(dbzColor(5)).toBe(null);
    expect(dbzColor(25)).toEqual([40, 200, 90]);
    expect(dbzColor(72)).toEqual([160, 60, 255]);
    expect(velocityColor(null)).toBe(null);
    expect(velocityColor(1)).toEqual([96, 100, 112]);
    expect(velocityColor(-40)[1]).toBeGreaterThan(200); // toward = green
    expect(velocityColor(40)[0]).toBeGreaterThan(200); // away = red
  });

  it('puts the thing to find where the lesson says it is', () => {
    for (const l of RADAR_LESSONS) {
      if (l.scene === 'velocity') continue;
      const f = radarField(l.scene);
      expect(peakNear(f, SCENES[l.scene].target), l.id).toBeGreaterThan(40);
    }
    // the hail core is the hottest spot: purple
    expect(peakNear(radarField('hail'), SCENES.hail.target, 0.02)).toBeGreaterThan(65);
    // nothing in a clear corner
    expect(radarField('supercell')[0]).toBe(0);
  });

  it('draws a spin couplet: toward on one side, away on the other', () => {
    expect(velocityAt(COUPLET.x, COUPLET.y - 0.02)).toBeLessThan(-30);
    expect(velocityAt(COUPLET.x, COUPLET.y + 0.02)).toBeGreaterThan(30);
    expect(velocityAt(0.01, 0.01)).toBe(null);
  });

  it('checks taps, including on shifted challenge pictures', () => {
    const t = SCENES.hook.target;
    expect(hitTarget(t, { x: t.x, y: t.y })).toBe(true);
    expect(hitTarget(t, { x: 0.1, y: 0.1 })).toBe(false);
    expect(hitTarget(t, { x: t.x + 0.05, y: t.y }, { ox: 0.05 })).toBe(true);
    expect(hitTarget(SCENES.line.target, { x: 0.6, y: 0.2 })).toBe(true);
  });

  it('builds a challenge where every answer is a choice', () => {
    const rounds = challengeRounds(42);
    expect(rounds).toHaveLength(6);
    const kinds = new Set(CHALLENGE_KINDS.map((k) => k.kind));
    rounds.forEach((r) => expect(kinds.has(r.answer)).toBe(true));
    expect(new Set(rounds.map((r) => r.answer)).size).toBe(kinds.size);
    expect(challengeRounds(42)).toEqual(rounds);
  });

  it('every lesson has a quiz with valid answers', () => {
    for (const l of RADAR_LESSONS) {
      expect(l.quiz.length).toBeGreaterThan(0);
      l.quiz.forEach((q) => expect(q.options[q.answer]).toBeTruthy());
    }
    expect(radarStatus({ lessons: Object.fromEntries(RADAR_LESSONS.map((l) => [l.id, 2])) }).all).toBe(true);
    expect(radarStatus({}).done).toBe(0);
  });
});

describe('spotter academy', () => {
  it('unlocks the exam after every lesson is passed', () => {
    expect(spotterStatus({}).examReady).toBe(false);
    expect(spotterStatus({}).next.id).toBe('safety');
    const mods = Object.fromEntries(MODULES.map((m) => [m.id, 2]));
    expect(spotterStatus({ modules: { ...mods, report: 1 } }).next.id).toBe('report');
    const s = spotterStatus({ modules: mods, exam: PASS_EXAM });
    expect(s.examReady).toBe(true);
    expect(s.certified).toBe(true);
  });

  it('builds a 10 question exam with no repeats and something from every lesson', () => {
    const qs = examQuestions(7);
    expect(qs).toHaveLength(EXAM_QUESTIONS);
    expect(new Set(qs.map((q) => q.q)).size).toBe(EXAM_QUESTIONS);
    for (const m of MODULES) expect(qs.some((q) => m.quiz.includes(q)), m.id).toBe(true);
  });

  it('writes a clear practice report', () => {
    expect(buildReport({ who: 'Sam', what: 'hail', hail: 'quarter', distance: '2', direction: 'west', time: '4:15 PM' }))
      .toBe('Sam: Quarter size hail, 2 miles west of me, at 4:15 PM.');
    expect(buildReport({ what: 'funnel cloud', distance: '0' })).toBe('Funnel cloud, right here.');
  });

  it('makes a certificate with the name escaped and the not-official note', () => {
    const html = certificateHtml({ name: '<Sam>', date: '2026-11-03', score: 9 });
    expect(html).toContain('&lt;Sam&gt;');
    expect(html).not.toContain('<Sam>');
    expect(html).toContain('not an official NWS certification');
    expect(html).toContain('9 of 10');
  });
});

describe('tornado lab', () => {
  it('needs fuel, a push and spin for a tornado', () => {
    expect(brewStorm({ warm: 5, cold: 50, spin: 90, push: 90 }).kind).toBe('clear');
    expect(brewStorm({ warm: 90, cold: 80, spin: 90, push: 5 }).kind).toBe('capped');
    expect(brewStorm({ warm: 85, cold: 70, spin: 10, push: 60 }).kind).toBe('hailstorm');
    expect(brewStorm({ warm: 60, cold: 50, spin: 10, push: 60 }).kind).toBe('pulse');
    expect(brewStorm({ warm: 60, cold: 50, spin: 45, push: 60 }).kind).toBe('multicell');
    expect(brewStorm({ warm: 50, cold: 60, spin: 80, push: 60 }).kind).toBe('supercell');
    const t = brewStorm({ warm: 85, cold: 80, spin: 90, push: 70 });
    expect(t.kind).toBe('tornado');
    expect(t.ef).toBeGreaterThanOrEqual(0);
  });

  it('makes stronger tornadoes with more spin and fuel', () => {
    const weak = brewStorm({ warm: 65, cold: 50, spin: 73, push: 60 });
    const strong = brewStorm({ warm: 100, cold: 100, spin: 100, push: 100 });
    expect(weak.ef).toBe(0);
    expect(strong.ef).toBe(5);
    expect(strong.hail).toBe('baseball');
  });

  it('every mission can be finished and the start is not already a storm', () => {
    expect(brewStorm(START).kind).not.toBe('tornado');
    const grid = [0, 10, 20, 30, 45, 60, 75, 90, 100];
    for (const m of MISSIONS) {
      let ok = false;
      for (const warm of grid) for (const cold of grid) for (const spin of grid) for (const push of grid) {
        if (!ok && m.done(brewStorm({ warm, cold, spin, push }))) ok = true;
      }
      expect(ok, m.id).toBe(true);
    }
  });

  it('lists the EF scale wind speeds in both units', () => {
    expect(EF_SCALE).toHaveLength(6);
    expect(efWindLabel(EF_SCALE[0])).toBe('65 to 85 mph');
    expect(efWindLabel(EF_SCALE[5])).toBe('over 200 mph');
    expect(efWindLabel(EF_SCALE[2], 'metric')).toBe('179 to 217 km/h');
  });
});

describe('chaser logbook', () => {
  it('adds points and climbs ranks', () => {
    expect(entryPoints({ saw: ['lightning', 'hail'], note: 'loud!', photoId: 3 })).toBe(7);
    let log = [];
    expect(logStats(log).rank.name).toBe(RANKS[0].name);
    log = addEntry(log, { id: 'a', day: '2026-05-01', saw: ['wall', 'shelf', 'hail'] });
    const s = logStats(log);
    expect(s.points).toBe(10);
    expect(s.rank.name).toBe('Cloud Rookie');
    expect(s.toNext).toBe(5);
  });

  it('keeps the newest storm first', () => {
    let log = addEntry([], { id: 'a', day: '2026-05-01', time: '15:00', saw: ['lightning'] });
    log = addEntry(log, { id: 'b', day: '2026-06-01', time: '10:00', saw: ['hail'] });
    log = addEntry(log, { id: 'c', day: '2026-05-01', time: '18:00', saw: ['thunder'] });
    expect(log.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('awards logbook badges', () => {
    expect(logBadges([])).toEqual([]);
    const ids = logBadges([{ id: 'a', day: '2026-05-01', saw: ['hail', 'wall'], photoId: 1 }]);
    expect(ids).toEqual(expect.arrayContaining(['log-first', 'log-photo', 'log-hail', 'log-structure']));
    expect(ids).not.toContain('log-10');
  });
});

describe('chaser training badges', () => {
  it('are all on the badge shelf', () => {
    const used = ['radar-rookie', 'radar-detective', 'radar-ace', 'spotter-safety', 'spotter-cadet', 'spotter-certified', 'lab-first', 'lab-tornado', 'lab-master', 'lab-ef',
      ...logBadges(Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, day: '2026-05-01', saw: ['tornado', 'hail', 'wall', 'funnel'], photoId: 1 })))];
    used.forEach((id) => expect(badgeIds.has(id), id).toBe(true));
    BADGES.filter((b) => /^(radar|log|spotter|lab)-/.test(b.id)).forEach((b) => expect(b.group).toBe('chaser'));
  });
});
