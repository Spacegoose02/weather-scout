import { describe, it, expect } from 'vitest';
import { voiceLabel, changedValues } from './settings.js';

const settings = [
  { key: 'AI_MODEL', value: 'claude-opus-5-5', source: 'env' },
  { key: 'OLLAMA_URL', value: '', source: 'default' },
  { key: 'ANTHROPIC_API_KEY', secret: true, set: true, hint: '1234' },
];

describe('AI settings form', () => {
  it('sends only what changed, and secrets only when typed', () => {
    expect(changedValues(settings, { AI_MODEL: 'claude-opus-5-5', OLLAMA_URL: '', ANTHROPIC_API_KEY: '' })).toEqual({});
    expect(changedValues(settings, { AI_MODEL: 'claude-sonnet-5-5', OLLAMA_URL: 'http://o:11434', ANTHROPIC_API_KEY: '  sk-new  ' }))
      .toEqual({ AI_MODEL: 'claude-sonnet-5-5', OLLAMA_URL: 'http://o:11434', ANTHROPIC_API_KEY: 'sk-new' });
    // Blanking a template value is a real change (it turns that thing off).
    expect(changedValues(settings, { AI_MODEL: '', OLLAMA_URL: '', ANTHROPIC_API_KEY: '' })).toEqual({ AI_MODEL: '' });
  });

  it('names Kokoro voices', () => {
    expect(voiceLabel('bf_emma')).toBe('Emma (British, female)');
    expect(voiceLabel('am_adam')).toBe('Adam (American, male)');
    expect(voiceLabel('weird')).toBe('weird');
  });
});
