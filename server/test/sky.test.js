import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonAngle, moonPhase } from '../src/sky.js';

const HOUR = 3_600_000;
// Published (USNO) times of new and full Moons.
const NEW = ['2000-01-06T18:14Z', '2024-04-08T18:21Z', '2026-01-18T19:52Z'];
const FULL = ['2024-04-23T23:49Z', '2025-03-14T06:55Z', '2026-03-03T11:38Z'];

test('new and full Moons line up with published times', () => {
  for (const t of NEW) {
    const a = moonAngle(Date.parse(t));
    assert.ok(Math.min(a, 360 - a) < 2, `${t}: ${a}`);
  }
  for (const t of FULL) assert.ok(Math.abs(moonAngle(Date.parse(t)) - 180) < 2, t);
});

test('next full and new Moon are found within a few hours', () => {
  const full = Date.parse(FULL[0]);
  const info = moonPhase(full - 5 * 24 * HOUR);
  assert.ok(Math.abs(Date.parse(info.nextFull) - full) < 3 * HOUR, info.nextFull);
  assert.equal(info.daysToFull, 5);
  const nu = Date.parse(NEW[1]);
  assert.ok(Math.abs(Date.parse(moonPhase(nu - 10 * 24 * HOUR).nextNew) - nu) < 3 * HOUR);
});

test('phase names and lit fraction', () => {
  const full = moonPhase(Date.parse(FULL[1]));
  assert.equal(full.phase, 'full');
  assert.ok(full.illumination >= 99);
  assert.equal(moonPhase(Date.parse(NEW[0])).phase, 'new');
  const waxing = moonPhase(Date.parse(NEW[1]) + 7.4 * 24 * HOUR);
  assert.equal(waxing.phase, 'first-quarter');
  assert.ok(waxing.waxing);
  assert.ok(Math.abs(waxing.illumination - 50) < 8);
  const waning = moonPhase(Date.parse(FULL[0]) + 3 * 24 * HOUR);
  assert.equal(waning.phase, 'waning-gibbous');
  assert.equal(waning.waxing, false);
});
