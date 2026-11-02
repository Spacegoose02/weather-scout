// Read-aloud for kids who are not reading yet. Uses the server's Kokoro voice
// when the admin set one up (much nicer than most built-in voices), and the
// browser's own speech otherwise, or whenever Kokoro can't answer.
const browserCanSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// A short silent clip: playing it inside the tap keeps phones (iPhone Safari)
// willing to play the real audio once it arrives from the server.
function silentWav(samples = 800) {
  const b = new Uint8Array(44 + samples * 2);
  const v = new DataView(b.buffer);
  const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples * 2, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
}
let SILENT = null;

let tts = { enabled: false, voice: '' }; // voice: '' = server default, 'browser', or a Kokoro voice id
let audio = null;
let turn = 0;

export function configureVoice({ enabled, voice } = {}) {
  tts = { enabled: !!enabled, voice: voice || '' };
}

export const usesKokoro = () => tts.enabled && tts.voice !== 'browser';
export const canSpeak = () => usesKokoro() || browserCanSpeak();

function browserSpeak(text) {
  if (!browserCanSpeak()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.pitch = 1.15;
  const voices = synth.getVoices();
  const lang = navigator.language?.slice(0, 2) || 'en';
  u.voice = voices.find((v) => v.lang?.startsWith(lang) && /female|samantha|google/i.test(v.name)) || voices.find((v) => v.lang?.startsWith(lang)) || null;
  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  turn += 1;
  if (browserCanSpeak()) window.speechSynthesis.cancel();
  if (audio) {
    audio.pause();
    if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
  }
}

async function kokoroSpeak(text, voice, mine) {
  audio ||= new Audio();
  audio.src = SILENT ||= silentWav();
  audio.play().catch(() => {});
  const res = await fetch('/api/tts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 1500), ...(voice ? { voice } : {}) }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const blob = await res.blob();
  if (mine !== turn) return; // another read-aloud started meanwhile
  audio.src = URL.createObjectURL(blob);
  await audio.play();
}

export function speak(text, { voice = tts.voice } = {}) {
  if (!text) return false;
  stopSpeaking();
  const mine = turn;
  if (tts.enabled && voice !== 'browser') {
    kokoroSpeak(text, voice, mine).catch(() => {
      if (mine === turn) browserSpeak(text);
    });
    return true;
  }
  return browserSpeak(text);
}
