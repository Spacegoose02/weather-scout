import { describe, expect, test } from 'vitest';
import { RULES, badgeProgress, dueBadges, mergeProgress } from './badges.js';
import { BADGES } from './logic.js';
import { bestStreak } from '../dashboard/journal.js';
import { mergeKid } from './useKidData.js';

describe('badge catalog', () => {
  test('ids are unique and every rule has a badge', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.keys(RULES)) expect(ids).toContain(id);
    for (const b of BADGES) expect(b.group).toBeTruthy();
  });
});

describe('progress badges', () => {
  test('journal streaks unlock in steps', () => {
    expect(dueBadges({ progress: { journalPages: 1, journalBest: 1 } })).toEqual(['journal-first']);
    expect(dueBadges({ progress: { journalPages: 8, journalBest: 7 } })).toEqual(['journal-first', 'streak-3', 'streak-7']);
  });
  test('already earned badges are not due again', () => {
    expect(dueBadges({ badges: { 'journal-first': '2026-11-01' }, progress: { journalPages: 2, journalBest: 1 } })).toEqual([]);
  });
  test('quizzes: first, perfect, storm smart', () => {
    const progress = { quizzes: { 'storm-tornado': 2, 'storm-hurricane': 1, 'storm-wildfire': 2 }, perfect: { 'storm-tornado': 1 } };
    expect(dueBadges({ progress })).toEqual(['quiz-first', 'quiz-perfect', 'storm-smart']);
  });
  test('clouds count toward collector and master', () => {
    const clouds = Object.fromEntries(['cumulus', 'stratus', 'cirrus', 'nimbostratus', 'altocumulus'].map((c) => [c, '2026-11-02']));
    expect(dueBadges({ progress: { clouds } })).toEqual(['cloud-spotter', 'cloud-collector']);
    expect(badgeProgress('cloud-master', { progress: { clouds } })).toEqual([5, 8]);
  });
  test('ten badges makes a Super Scout', () => {
    const badges = Object.fromEntries(BADGES.slice(0, 9).map((b) => [b.id, '2026-11-01']));
    expect(dueBadges({ badges, progress: {} })).toEqual([]);
    expect(dueBadges({ badges, progress: { journalPages: 1 } })).toEqual(['journal-first', 'super-scout']);
  });
});

describe('merging', () => {
  test('numbers keep the max and maps union', () => {
    const out = mergeProgress({ journalBest: 9, clouds: { cumulus: 'a' }, quizzes: { clouds: 1 } }, { journalBest: 3, clouds: { cirrus: 'b' }, quizzes: { clouds: 2 } });
    expect(out).toEqual({ journalBest: 9, clouds: { cumulus: 'a', cirrus: 'b' }, quizzes: { clouds: 2 } });
  });
  test('mergeKid keeps progress from both sides', () => {
    const out = mergeKid({ progress: { clouds: { cumulus: 'a' } } }, { progress: { clouds: { stratus: 'b' }, journalBest: 4 } });
    expect(out.progress).toEqual({ clouds: { cumulus: 'a', stratus: 'b' }, journalBest: 4 });
  });
});

describe('best journal streak', () => {
  test('finds the longest run, not just the current one', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-10', '2026-10-11'];
    expect(bestStreak(days.map((day) => ({ day })))).toBe(4);
    expect(bestStreak([])).toBe(0);
  });
});
