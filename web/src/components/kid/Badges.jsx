import { BADGES } from '../../kid/logic.js';

export default function Badges({ kid }) {
  const earned = kid.data.badges || {};
  const count = BADGES.filter((b) => earned[b.id]).length;
  return (
    <section className="card badges">
      <h2>My badges <span className="points">{count} of {BADGES.length}</span></h2>
      <ul className="badge-grid">
        {BADGES.map((b) => (
          <li key={b.id} className={earned[b.id] ? 'earned' : ''}>
            <span className="badge-emoji" aria-hidden>{earned[b.id] ? b.emoji : '🔒'}</span>
            <strong>{b.name}</strong>
            <small>{earned[b.id] ? `Earned ${earned[b.id]}` : b.how}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BadgeToast({ ids }) {
  if (!ids?.length) return null;
  const list = BADGES.filter((b) => ids.includes(b.id));
  return (
    <div className="badge-toast" role="status">
      {list.map((b) => <p key={b.id}><span aria-hidden>{b.emoji}</span> New badge: <strong>{b.name}</strong>{b.name.endsWith('!') ? '' : '!'}</p>)}
    </div>
  );
}
