import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { speak } from '../kid/speak.js';
import '../ai/ask.css';

let voiceList = null; // shared between pickers, loaded once

// Pick Rocky's read-aloud voice. Only shown when the server has Kokoro.
export default function VoicePicker({ tts, value, onChange, sample = "Hi! I'm Rocky. Let's check the sky together!" }) {
  const [voices, setVoices] = useState(voiceList);
  useEffect(() => {
    if (!tts?.enabled || voiceList) return;
    api('/api/tts/voices').then((r) => { voiceList = r.voices; setVoices(r.voices); }).catch(() => setVoices([]));
  }, [tts?.enabled]);
  if (!tts?.enabled) return null;
  return (
    <span className="voice-picker">
      <label>
        <span aria-hidden>🗣️</span> Voice{' '}
        <select value={value || ''} onChange={(e) => { onChange(e.target.value); speak(sample, { voice: e.target.value }); }}>
          <option value="">Rocky's voice</option>
          {(voices || []).filter((v) => v.id !== tts.voice).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          <option value="browser">This device's voice</option>
        </select>
      </label>
      <button type="button" className="link" onClick={() => speak(sample, { voice: value })}>Try it</button>
    </span>
  );
}
