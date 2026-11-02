import { useEffect, useRef, useState } from 'react';
import { GROUPS, MODES, THEMES, themeById } from '../theme/themes.js';
import Raccoon from './Raccoon.jsx';
import RockyFace from './RockyFace.jsx';

// The 🎨 button in the header. Shows every theme as a swatch; Rocky's themes
// show Rocky in the outfit that goes with them.
export default function ThemePicker({ value = 'auto', active, why, onChange, signedIn }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const current = themeById(active);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (id) => onChange(id);

  return (
    <div className="theme-picker" ref={ref}>
      <button className="ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" title="Change colors" aria-label={`Theme: ${current.name}`}>
        🎨
      </button>
      {open && (
        <div className="theme-panel" role="dialog" aria-label="Pick a theme">
          <h3>Automatic</h3>
          <div className="theme-grid">
            {MODES.map((m) => (
              <button key={m.id} aria-pressed={value === m.id} onClick={() => pick(m.id)} title={m.blurb}>
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
                  <button key={t.id} aria-pressed={value === t.id} onClick={() => pick(t.id)} title={t.blurb}>
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
      )}
      {current.outfit && (
        <div className="theme-buddy" aria-hidden>
          <Raccoon items={current.outfit} size={84} />
        </div>
      )}
    </div>
  );
}
