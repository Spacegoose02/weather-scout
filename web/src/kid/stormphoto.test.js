import { describe, it, expect } from 'vitest';
import { stormPhotoSpeech, countStormDay } from './stormphoto.js';

describe('storm picture of the day', () => {
  it('Rocky reads the caption, the fact, the safety line and the credit', () => {
    const s = stormPhotoSpeech({ caption: 'A big tornado.', fact: 'Tornadoes spin.', rocky: 'Stay safe!', credit: { artist: 'NOAA' } });
    expect(s).toBe("A big tornado. Here's a fun fact. Tornadoes spin. Stay safe! This picture was taken by NOAA.");
    expect(stormPhotoSpeech({ caption: 'Zap.', credit: { artist: 'Unknown photographer' } })).toBe('Zap.');
    expect(stormPhotoSpeech(null)).toBe('');
  });

  it('counts each day once toward Storm Gazer', () => {
    const a = countStormDay(undefined, '2026-11-03');
    expect(a).toEqual(['2026-11-03']);
    expect(countStormDay(a, '2026-11-03')).toBe(a);
    const many = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    expect(countStormDay(many, '2026-11-03')).toHaveLength(30);
  });
});
