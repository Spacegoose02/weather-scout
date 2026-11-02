// Read-aloud for kids who are not reading yet, using the browser's built-in voices.
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text) {
  if (!canSpeak() || !text) return false;
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

export const stopSpeaking = () => canSpeak() && window.speechSynthesis.cancel();
