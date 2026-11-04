import { TEXT_SIZES, normalizeA11y } from '../a11y.js';

// The "Easier to see" group in Settings.
export default function EasierToSee({ value, onChange }) {
  const a = normalizeA11y(value);
  const set = (patch) => onChange({ ...a, ...patch });
  return (
    <>
      <div className="prefs-row">
        <span id="a11y-text">Text size</span>
        <span className="seg" role="group" aria-labelledby="a11y-text">
          {TEXT_SIZES.map((t) => (
            <button key={t.id} className={a.text === t.id ? 'active' : 'ghost'} aria-pressed={a.text === t.id} onClick={() => set({ text: t.id })}>{t.label}</button>
          ))}
        </span>
      </div>
      <label className="check">
        <input type="checkbox" checked={a.cbRadar} onChange={(e) => set({ cbRadar: e.target.checked })} />
        <span><strong>Color-blind friendly radar</strong> <span className="tile-note">Shifts the radar's greens, yellows and reds so they stay apart for red-green color blindness.</span></span>
      </label>
      <label className="check">
        <input type="checkbox" checked={a.lessMotion} onChange={(e) => set({ lessMotion: e.target.checked })} />
        <span><strong>Less motion</strong> <span className="tile-note">Stops animations and the radar loop from playing by itself. Your device's "reduce motion" setting does this too.</span></span>
      </label>
    </>
  );
}
