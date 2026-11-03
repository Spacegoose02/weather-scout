import { useState } from 'react';
import { CHASER_GROUPS, CHASER_SECTIONS } from '../../../kid/chaser/sections.js';
import '../../../kid/chaser/chaser.css';

const KEY = 'weather-scout:chaser-section';
const remembered = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

// Junior Storm Chaser: a sub-nav over every part listed in sections.js.
// Each part also gets go(id), to jump to another part.
export default function StormChaser(props) {
  const [id, setId] = useState(() => (CHASER_SECTIONS.some((s) => s.id === remembered()) ? remembered() : CHASER_SECTIONS[0].id));
  const pick = (next) => {
    setId(next);
    try {
      sessionStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
  };
  const section = CHASER_SECTIONS.find((s) => s.id === id) || CHASER_SECTIONS[0];
  const { Component } = section;
  return (
    <div className="chaser">
      <header className="card chaser-head">
        <span className="chaser-badge" aria-hidden>🌪️</span>
        <div>
          <h2>Junior Storm Chaser</h2>
          <p>Real storms, real radar, real chasers. Rocky is your chase partner. Remember: real chasers are grown-ups, and the safest chase is from home!</p>
        </div>
      </header>
      <nav className="chaser-nav" aria-label="Storm chaser">
        {CHASER_GROUPS.map(([g, label]) => {
          const list = CHASER_SECTIONS.filter((s) => s.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="chaser-nav-group">
              <span className="chaser-nav-label">{label}</span>
              <div className="chaser-pills">
                {list.map((s) => (
                  <button key={s.id} className={s.id === section.id ? 'active' : ''} aria-current={s.id === section.id} onClick={() => pick(s.id)}>
                    <span aria-hidden>{s.emoji}</span> {s.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="kid-grid chaser-body">
        <Component {...props} go={pick} />
      </div>
    </div>
  );
}
