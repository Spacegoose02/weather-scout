import { GROUPS, MODES, THEMES, themeById } from '../theme/themes.js';
import Raccoon from './Raccoon.jsx';
import RockyFace from './RockyFace.jsx';

// Every theme as a swatch (in Settings). Rocky's themes show Rocky in the
// outfit that goes with them.
export function ThemeChoices({ value = 'auto', why, onChange, signedIn }) {
  return (
    <div className="theme-choices">
      <h3>Automatic</h3>
      <div className="theme-grid">
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={value === m.id} onClick={() => onChange(m.id)} title={m.blurb}>
            <span className="theme-swatch" style={{ background: 'var(--card)' }}>{m.id === 'weather' ? <RockyFace /> : m.emoji}</span>
            {m.name}
          </button>
        ))}
      </div>
      {value === 'weather' && why && (
        <p className="theme-why" role="status"><RockyFace /> {why}</p>
      )}

      {GROUPS.map(([group, label]) => (
        <section key={group}>
          <h3>{label}</h3>
          <div className="theme-grid">
            {THEMES.filter((t) => t.group === group).map((t) => (
              <button key={t.id} aria-pressed={value === t.id} onClick={() => onChange(t.id)} title={t.blurb}>
                <span className="theme-swatch" style={{ background: t.color }}>
                  {t.outfit ? <Raccoon items={t.outfit} size={34} /> : <span aria-hidden>{t.emoji}</span>}
                </span>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="theme-hint">{signedIn ? 'Saved to your account, so it follows you to other devices.' : 'Saved on this device. Sign in to keep it everywhere.'}</p>
    </div>
  );
}

// Rocky's themes put Rocky, in that outfit, in the corner of the screen.
export function ThemeBuddy({ active }) {
  const current = themeById(active);
  if (!current.outfit) return null;
  return (
    <div className="theme-buddy" aria-hidden>
      <Raccoon items={current.outfit} size={84} />
    </div>
  );
}
