import { useEffect, useRef, useState } from 'react';
import { BADGES } from '../../kid/logic.js';
import { BADGE_EVENT, badgeById, badgeProgress, requestShelf, setBadgeUser } from '../../kid/badges.js';
import { speak } from '../../kid/speak.js';
import RockyFace from '../RockyFace.jsx';
import '../../kid/badges.css';

const GROUPS = [
  ['journal', '📓 Weather journal'],
  ['learn', '🎓 Weather school'],
  ['clouds', '☁️ Cloud spotting'],
  ['ocean', '🌊 Ocean explorer'],
  ['play', '🎲 Games'],
  ['science', '🧪 Backyard science'],
  ['explore', '🔭 Explorer'],
  ['star', '⭐ Super star'],
];

const niceDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

// The badge shelf: every badge grouped by where you earn it, with a progress bar
// on the ones you are part way to.
export default function Badges({ kid }) {
  const earned = kid.data.badges || {};
  const count = BADGES.filter((b) => earned[b.id]).length;
  const next = BADGES.map((b) => ({ b, p: earned[b.id] ? null : badgeProgress(b.id, kid.data) }))
    .filter((x) => x.p && x.p[0] > 0)
    .sort((x, y) => y.p[0] / y.p[1] - x.p[0] / x.p[1])[0];
  return (
    <section className="card badges">
      <h2>My badge shelf <span className="points">{count} of {BADGES.length}</span></h2>
      <div className="badge-meter" role="progressbar" aria-valuemin={0} aria-valuemax={BADGES.length} aria-valuenow={count} aria-label="Badges earned">
        <i style={{ width: `${(count / BADGES.length) * 100}%` }} />
      </div>
      {next && <p className="hint badge-next">Almost there: <strong>{next.b.emoji} {next.b.name}</strong> ({next.p[0]} of {next.p[1]}). {next.b.how}</p>}
      {count === 0 && <p className="hint">Write in your weather journal, finish a quiz in Learn, or spot a cloud to earn your first badge!</p>}
      {GROUPS.map(([g, label]) => {
        const list = BADGES.filter((b) => b.group === g);
        if (!list.length) return null;
        const have = list.filter((b) => earned[b.id]).length;
        return (
          <div key={g} className="badge-shelf">
            <h3>{label} <small>{have}/{list.length}</small></h3>
            <ul className="badge-grid">
              {list.map((b) => {
                const p = earned[b.id] ? null : badgeProgress(b.id, kid.data);
                return (
                  <li key={b.id} className={earned[b.id] ? 'earned' : ''}>
                    <span className="badge-emoji" aria-hidden>{earned[b.id] ? b.emoji : '🔒'}</span>
                    <strong>{b.name}</strong>
                    <small>{earned[b.id] ? `Earned ${niceDay(earned[b.id])}` : b.how}</small>
                    {p && p[1] > 1 && p[0] > 0 && (
                      <span className="badge-progress" aria-label={`${Math.min(p[0], p[1])} of ${p[1]}`}>
                        <i style={{ width: `${Math.min(1, p[0] / p[1]) * 100}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// Mounted once in App: pops up a celebration whenever a new badge is earned,
// anywhere in the app.
export function BadgeCelebration({ user, onShelf }) {
  const [queue, setQueue] = useState([]);
  const seen = useRef(new Set());

  useEffect(() => {
    setBadgeUser(user);
  }, [user]);

  useEffect(() => {
    const onBadges = (e) => {
      const fresh = (e.detail.fresh || []).filter((id) => badgeById[id] && !seen.current.has(id));
      fresh.forEach((id) => seen.current.add(id));
      if (fresh.length) setQueue((q) => [...q, ...fresh]);
    };
    window.addEventListener(BADGE_EVENT, onBadges);
    return () => window.removeEventListener(BADGE_EVENT, onBadges);
  }, []);

  useEffect(() => {
    seen.current = new Set();
    setQueue([]);
  }, [user?.id]);

  const b = badgeById[queue[0]];
  useEffect(() => {
    if (!b) return undefined;
    const onKey = (e) => e.key === 'Escape' && setQueue((q) => q.slice(1));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [b]);
  if (!b) return null;

  const close = () => setQueue((q) => q.slice(1));
  const more = queue.length - 1;
  return (
    <div className="badge-celebrate" role="dialog" aria-modal="true" aria-labelledby="badge-celebrate-title" onClick={close}>
      <div className="badge-celebrate-card" onClick={(e) => e.stopPropagation()}>
        <div className="confetti" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
        <p className="badge-celebrate-rocky"><RockyFace /> Rocky says: you did it!</p>
        <span className="badge-celebrate-emoji" aria-hidden>{b.emoji}</span>
        <h2 id="badge-celebrate-title">New badge: {b.name}{b.name.endsWith('!') ? '' : '!'}</h2>
        <p>{b.how}</p>
        <div className="dash-row">
          <button onClick={close} autoFocus>{more > 0 ? `Next badge (${more} more) 🎉` : 'Yay! 🎉'}</button>
          <button className="ghost" onClick={() => speak(`You earned the ${b.name} badge! ${b.how}`)}>🔊 Hear it</button>
          {onShelf && <button className="ghost" onClick={() => { setQueue([]); requestShelf(); onShelf(); }}>See my shelf</button>}
        </div>
      </div>
    </div>
  );
}
