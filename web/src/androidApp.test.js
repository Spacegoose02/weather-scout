import { describe, expect, it } from 'vitest';
import { noteAndroidApp, inAndroidApp } from './androidApp.js';

const fakeWindow = (href, referrer = '') => {
  const store = new Map();
  const win = {
    location: { href },
    document: { referrer },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    history: { state: null, replaceState: (s, t, url) => { win.replaced = url; } },
  };
  return win;
};

describe('Android app detection', () => {
  it('remembers ?app=android and tidies it out of the address', () => {
    const win = fakeWindow('https://wx.example.com/?app=android#kids');
    noteAndroidApp(win);
    expect(inAndroidApp(win)).toBe(true);
    expect(win.replaced).toBe('/#kids');
  });

  it('also spots the app from its referrer', () => {
    const win = fakeWindow('https://wx.example.com/', 'android-app://app.weatherscout.android/');
    noteAndroidApp(win);
    expect(inAndroidApp(win)).toBe(true);
    expect(win.replaced).toBeUndefined();
  });

  it('stays off in a normal browser', () => {
    const win = fakeWindow('https://wx.example.com/?lat=1');
    noteAndroidApp(win);
    expect(inAndroidApp(win)).toBe(false);
  });
});
