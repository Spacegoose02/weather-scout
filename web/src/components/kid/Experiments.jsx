import { useState } from 'react';
import { EXPERIMENTS, BADGES } from '../../kid/logic.js';
import SpeakButton from './SpeakButton.jsx';

const badgeOf = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export default function Experiments({ weather, kid, today }) {
  const [open, setOpen] = useState(null);
  const done = kid.data.experiments || {};
  const finish = (e) => {
    const next = { ...done, [e.id]: today };
    kid.update(() => ({ experiments: next }));
    const ids = [e.badge];
    if (EXPERIMENTS.every((x) => next[x.id])) ids.push('mad-scientist');
    kid.earn(...ids);
  };
  const tips = Object.fromEntries(EXPERIMENTS.map((e) => [e.id, e.fit(weather)]));
  const sorted = [...EXPERIMENTS].sort((a, b) => Number(!!tips[b.id]) - Number(!!tips[a.id]));

  return (
    <section className="card experiments">
      <h2>Backyard experiments</h2>
      <p className="hint">Be a weather scientist at home. Each one earns a badge!</p>
      <ul>
        {sorted.map((e) => (
          <li key={e.id}>
            <button className="exp-btn" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
              <span className="emoji" aria-hidden>{e.emoji}</span>
              <span><strong>{e.title}</strong><small>{e.time}{e.grownUp ? ' · grown-up helper' : ''}</small></span>
              {done[e.id] ? <span className="exp-done" aria-label="done">{badgeOf[e.badge].emoji}</span> : tips[e.id] && <span className="exp-today">Good today!</span>}
            </button>
            {open === e.id && (
              <div className="exp-body">
                {tips[e.id] && <p className="exp-tip">🦝 {tips[e.id]}</p>}
                <h3>You need</h3>
                <ul className="materials">{e.materials.map((m) => <li key={m}>{m}</li>)}</ul>
                <h3>Steps</h3>
                <ol>{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <p><strong>What to look for:</strong> {e.observe}</p>
                {e.live && <p className="exp-live">📡 {e.live(weather)}</p>}
                <div className="row">
                  <SpeakButton text={[e.title, 'You need:', e.materials.join(', '), 'Steps:', ...e.steps, e.observe].join('. ')} />
                  {done[e.id] ? <span>✅ Done! You earned {badgeOf[e.badge].name}.</span> : <button onClick={() => finish(e)}>I did it! 🏅</button>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
