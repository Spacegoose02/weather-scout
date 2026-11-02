import { canSpeak, speak } from '../../kid/speak.js';

export default function SpeakButton({ text, label = 'Read to me', onSpeak, className = '' }) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      className={`speak ${className}`}
      onClick={() => {
        speak(typeof text === 'function' ? text() : text);
        onSpeak?.();
      }}
    >
      <span aria-hidden>🔊</span> {label}
    </button>
  );
}
