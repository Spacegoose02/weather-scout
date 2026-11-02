import { describe, it, expect } from 'vitest';
import { toHistory, suggestions, speakable } from './logic.js';

const cloud = { cloudType: 'cumulus', confidence: 'high', title: 'Puffy clouds', explanation: 'Fluffy tops.', weatherHint: 'Fair weather.', funFact: 'They weigh a lot!', lookFor: 'Flat bottoms.' };

describe('toHistory', () => {
  it('turns photos and cloud cards into text and drops errors', () => {
    const h = toHistory([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'oops', error: true },
      { role: 'user', kind: 'photo', image: 'data:...' },
      { role: 'assistant', kind: 'cloud', cloud },
      { role: 'user', text: 'will it rain?' },
    ]);
    expect(h.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(h[1].content).toMatch(/photo of the sky/);
    expect(h[2].content).toMatch(/Puffy clouds \(Cumulus, high confidence\)/);
    expect(JSON.stringify(h)).not.toContain('data:');
  });
});

describe('suggestions', () => {
  it('fits the weather and mode', () => {
    const wet = { forecast: { current: { temp: 30 }, daily: [{ precipChance: 80 }] }, alerts: [{ event: 'Winter Storm Warning' }] };
    expect(suggestions(wet, true)[0]).toBe('What does a Winter Storm Warning mean?');
    expect(suggestions(wet, true)).toContain('Will it rain at recess?');
    expect(suggestions(wet, false)).toContain('When will the rain start and stop?');
    expect(suggestions(null, true).length).toBeGreaterThan(2);
  });
});

it('speakable reads cloud cards in order', () => {
  expect(speakable({ kind: 'cloud', cloud })).toBe('Puffy clouds Fluffy tops. Fair weather. Fun fact: They weigh a lot! Flat bottoms.');
});
