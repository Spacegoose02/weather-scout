import { useState } from 'react';
import SpeakButton from './SpeakButton.jsx';
import Raccoon from '../Raccoon.jsx';

function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : ` until ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// Calm, step-by-step help during a warning (or a practice drill).
export default function StormSafe({ plans, reassure, kid, drill = false, onDone }) {
  const [done, setDone] = useState([]);
  const [editing, setEditing] = useState(false);
  const plan = plans[0];
  const spot = kid.data.safeSpot || '';
  const allDone = plan.steps.every((_, i) => done.includes(i));
  const toggle = (i) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  const words = [plan.title, plan.calm, ...plan.steps.map((s, i) => `Step ${i + 1}. ${s}.`), spot && plan.id === 'tornado' ? `Our safe spot is ${spot}.` : '', reassure || ''].join(' ');

  return (
    <section className={`card storm-safe ${drill ? 'drill' : ''}`} aria-live="polite">
      <div className="storm-head">
        <span className="storm-emoji" aria-hidden>{plan.emoji}</span>
        <div>
          {drill && <p className="drill-tag">Practice drill</p>}
          <h2>{plan.title}</h2>
          <p className="storm-calm">{plan.calm}</p>
        </div>
      </div>

      {plan.id === 'tornado' && (
        <div className="safe-spot">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); setEditing(false); }}>
              <label>Our family's safe spot
                <input autoFocus value={spot} maxLength={80} placeholder="the basement bathroom" onChange={(e) => kid.update(() => ({ safeSpot: e.target.value }))} />
              </label>
              <button>Save</button>
            </form>
          ) : (
            <p>🏠 Our safe spot: <strong>{spot || 'ask a grown-up to pick one'}</strong> <button className="link" onClick={() => setEditing(true)}>{spot ? 'Change' : 'Set it'}</button></p>
          )}
        </div>
      )}

      <h3>Where to go and what to do</h3>
      <ol className="storm-steps">
        {plan.steps.map((s, i) => (
          <li key={s}>
            <button className={done.includes(i) ? 'checked' : ''} onClick={() => toggle(i)} aria-pressed={done.includes(i)}>
              <span className="emoji" aria-hidden>{done.includes(i) ? '✅' : i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>
      {allDone && <p className="yay">{drill ? '🛡️ Drill done! You know just what to do.' : '💙 You did every step. You are safe and doing great.'}</p>}

      <div className="breathe" aria-hidden>
        <div className="breathe-ball" />
        <p>Smell the flower… blow out the candle…</p>
      </div>

      <div className="storm-rocky">
        <Raccoon size={96} />
        <p className="storm-reassure">{reassure || 'Grown-ups and weather helpers are keeping watch. You are doing great.'} Rocky is staying safe with you.</p>
      </div>
      <div className="row">
        <SpeakButton text={words} />
        {drill && <button onClick={onDone}>{allDone ? 'Finish drill' : 'Stop drill'}</button>}
      </div>
      <p className="grown-up-note">
        For grown-ups: {plans.map((p) => `${p.grownUpName}${clock(p.ends)}`).join(' · ')}. Follow your local officials and the NWS.
      </p>
    </section>
  );
}
