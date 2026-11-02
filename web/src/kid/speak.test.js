import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureVoice, speak, canSpeak } from './speak.js';

class FakeAudio {
  constructor() { this.src = ''; FakeAudio.last = this; }
  play() { FakeAudio.played.push(this.src); return Promise.resolve(); }
  pause() {}
}
FakeAudio.played = [];

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('speak', () => {
  let synthSpoken;
  beforeEach(() => {
    synthSpoken = [];
    FakeAudio.played = [];
    globalThis.Audio = FakeAudio;
    globalThis.URL.createObjectURL = () => 'blob:voice';
    globalThis.URL.revokeObjectURL = () => {};
    globalThis.SpeechSynthesisUtterance = function U(t) { this.text = t; };
    globalThis.window = { speechSynthesis: { cancel() {}, getVoices: () => [], speak: (u) => synthSpoken.push(u.text) } };
    globalThis.navigator ||= {};
    globalThis.btoa ||= (s) => Buffer.from(s, 'binary').toString('base64');
  });

  it('uses the browser voice when Kokoro is off', () => {
    configureVoice({ enabled: false });
    globalThis.fetch = vi.fn();
    expect(canSpeak()).toBe(true);
    speak('Hello');
    expect(fetch).not.toHaveBeenCalled();
    expect(synthSpoken).toEqual(['Hello']);
  });

  it('plays the Kokoro voice from the server', async () => {
    configureVoice({ enabled: true, voice: 'bf_emma' });
    globalThis.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) }));
    speak('Hi there');
    await flush(); await flush();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('/api/tts');
    expect(JSON.parse(opts.body)).toEqual({ text: 'Hi there', voice: 'bf_emma' });
    expect(FakeAudio.played.at(-1)).toBe('blob:voice');
    expect(synthSpoken).toEqual([]);
  });

  it('falls back to the browser when Kokoro fails, or when the device voice is picked', async () => {
    configureVoice({ enabled: true });
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 502 }));
    speak('Storm steps');
    await flush(); await flush();
    expect(synthSpoken).toEqual(['Storm steps']);

    configureVoice({ enabled: true, voice: 'browser' });
    globalThis.fetch = vi.fn();
    speak('Device');
    expect(fetch).not.toHaveBeenCalled();
    expect(synthSpoken.at(-1)).toBe('Device');
  });
});
