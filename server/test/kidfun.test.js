import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForecast } from '../src/providers/openmeteo.js';
import { dailyFact, bingoCard, stormSafe, FACTS, BINGO_LINES } from '../src/kidfun.js';
import { kidReport } from '../src/kid.js';
import { fakeForecast } from './helpers.js';

const fc = (o) => normalizeForecast(fakeForecast(o), 'imperial');

test('daily fact is the same all day and changes the next day', () => {
  assert.deepEqual(dailyFact('2026-11-02'), dailyFact('2026-11-02'));
  assert.notEqual(dailyFact('2026-11-02').text, dailyFact('2026-11-03').text);
});

test('daily facts do not repeat within one cycle', () => {
  const start = Date.parse('2026-01-01T12:00Z');
  const day0 = Math.floor(start / 86_400_000);
  const firstOfCycle = (Math.ceil(day0 / FACTS.length)) * FACTS.length;
  const seen = new Set();
  for (let i = 0; i < FACTS.length; i++) {
    const d = new Date((firstOfCycle + i) * 86_400_000 + 43_200_000).toISOString().slice(0, 10);
    seen.add(dailyFact(d).text);
  }
  assert.equal(seen.size, FACTS.length);
});

test('jokes come with an answer and read-aloud text', () => {
  for (let i = 0; i < 90; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    const f = dailyFact(d);
    assert.ok(f.speech.length > 10);
    if (f.type === 'joke') assert.ok(f.answer && f.speech.includes(f.answer));
  }
});

test('bingo card is 3x3 with a free middle and no repeats', () => {
  const card = bingoCard(fc({}), '2026-11-02');
  assert.equal(card.squares.length, 9);
  assert.ok(card.squares[4].free);
  assert.equal(new Set(card.squares.map((s) => s.id)).size, 9);
  assert.equal(BINGO_LINES.length, 8);
});

test('rainy days put puddles and umbrellas on the card', () => {
  const ids = bingoCard(fc({ code: 63, chance: 90, precip: 0.2 }), '2026-11-02').squares.map((s) => s.id);
  const wet = ['puddle', 'worm', 'umbrella', 'window-drops', 'mud'];
  assert.ok(ids.filter((id) => wet.includes(id)).length >= 3, ids.join());
});

test('snow days get snow squares', () => {
  const ids = bingoCard(fc({ code: 73, temp: 28 }), '2026-12-20').squares.map((s) => s.id);
  assert.ok(ids.some((id) => ['snowflake', 'snowman', 'footprints'].includes(id)));
});

test('storm-safe mode is off on a calm day', () => {
  assert.equal(stormSafe([], fc({})).active, false);
  assert.equal(stormSafe([{ event: 'Special Weather Statement', severity: 'Minor' }], fc({})).active, false);
});

test('tornado warning gives the safe-spot plan first, with calm words', () => {
  const s = stormSafe([{ event: 'Wind Advisory', severity: 'Minor' }, { event: 'Tornado Warning', severity: 'Extreme' }], fc({}));
  assert.equal(s.active, true);
  assert.equal(s.plans[0].id, 'tornado');
  assert.equal(s.plans[0].grownUpName, 'Tornado Warning');
  const kidText = [s.plans[0].title, s.plans[0].calm, ...s.plans[0].steps].join(' ');
  assert.doesNotMatch(kidText, /danger|deadly|kill|destroy|die/i);
});

test('thunder without an alert still turns on storm-safe mode', () => {
  const s = stormSafe([], fc({ code: 95 }));
  assert.equal(s.active, true);
  assert.equal(s.plans[0].id, 'thunder');
});

test('kidReport includes the new daily sections', () => {
  const r = kidReport(fc({}), { alerts: [] });
  assert.ok(r.fact.text);
  assert.equal(r.bingo.squares.length, 9);
  assert.equal(r.stormSafe.active, false);
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
});
