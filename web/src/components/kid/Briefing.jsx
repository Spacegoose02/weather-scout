import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { canSpeak, speak, stopSpeaking } from '../../kid/speak.js';
import './briefing.css';

const AI_KEY = 'weather-scout:briefing-ai';
const readAi = () => {
  try {
    return localStorage.getItem(AI_KEY) === '1';
  } catch {
    return false;
  }
};

export function briefingUrl({ location, units, name, ai }) {
  const q = new URLSearchParams({ lat: location.lat, lon: location.lon });
  if (units) q.set('units', units);
  if (location.name) q.set('place', location.name.split(',')[0].slice(0, 80));
  if (name) q.set('name', name.slice(0, 60));
  if (ai) q.set('ai', 'true');
  return `/api/briefing?${q}`;
}

// Rocky's morning briefing: the day in a few friendly sentences, read aloud
// with the Kokoro voice (or the browser's own voice).
export default function Briefing({ location, units, name, highlight = false, onAlerts }) {
  const [aiReady, setAiReady] = useState(false);
  const [useAi, setUseAi] = useState(readAi);
  const [b, setB] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    api('/api/ai/status').then((s) => setAiReady(!!s.enabled)).catch(() => {});
    return () => stopSpeaking();
  }, []);

  const ai = aiReady && useAi;
  useEffect(() => {
    if (!location) return undefined;
    let live = true;
    setError('');
    api(briefingUrl({ location, units, name, ai }))
      .then((r) => live && setB(r))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [location?.lat, location?.lon, units, name, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAi = (v) => {
    setUseAi(v);
    try {
      localStorage.setItem(AI_KEY, v ? '1' : '0');
    } catch { /* private mode */ }
  };

  const play = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    speak(b.text);
    setPlaying(true);
    // Rough length of the read-aloud, so the button flips back on its own.
    setTimeout(() => setPlaying(false), Math.min(90_000, 2500 + b.text.split(/\s+/).length * 400));
  };

  return (
    <section className={`card briefing ${highlight ? 'highlight' : ''}`} aria-live="polite">
      <h2>🌅 Rocky's morning briefing</h2>
      {error && <p className="error-text">{error}</p>}
      {!b && !error && <p>Rocky is checking the sky…</p>}
      {b && (
        <>
          <p className="briefing-text">{b.text}</p>
          <div className="row-actions">
            {canSpeak() && (
              <button type="button" className="speak" onClick={play}>
                <span aria-hidden>{playing ? '⏹️' : '🔊'}</span> {playing ? 'Stop' : 'Play my briefing'}
              </button>
            )}
            {aiReady && (
              <label className="check">
                <input type="checkbox" checked={useAi} onChange={(e) => toggleAi(e.target.checked)} />
                <span>Rocky's own words</span>
              </label>
            )}
          </div>
          {onAlerts && (
            <p className="hint">
              Want it every morning? <button type="button" className="link" onClick={onAlerts}>Get it as a notification</button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
