import { useEffect, useRef, useState } from 'react';
import { HAZARD } from '../../../../shared/safety-plan.js';
import Raccoon from '../Raccoon.jsx';
import SpeakButton from '../kid/SpeakButton.jsx';

const until = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `until ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};
const telHref = (phone) => `tel:${phone.replace(/[^\d+*#]/g, '')}`;

// "Where to shelter": opens by itself when a tornado, severe thunderstorm,
// flood or hurricane warning comes in. Big and plain for grown-ups; calm, with
// Rocky, in Kid Mode. `active` is [{ hazard, alert }]; with no warning out it
// shows one hazard as a practice run.
export default function ShelterGuide({ active, practice, focus, plan, kidMode, onClose, onPlan, onDrillDone }) {
  const list = active.length ? active : [{ hazard: HAZARD[practice] || HAZARD.tornado, alert: null }];
  const [pick, setPick] = useState(list.some((x) => x.hazard.id === focus) ? focus : list[0].hazard.id);
  const box = useRef();
  const current = list.find((x) => x.hazard.id === pick) || list[0];
  const { hazard: h, alert } = current;
  const shelter = plan.shelters[h.id] || {};
  const spot = shelter.spot;
  const isPractice = !active.length;

  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const steps = kidMode ? h.kidSteps : h.steps;
  const title = kidMode ? h.kidTitle : h.headline;
  const words = [
    isPractice ? 'This is just practice.' : '',
    title + '.',
    spot ? `${kidMode ? 'Our safe spot is' : 'Go to'} ${spot}.` : '',
    ...steps.map((s, i) => `Step ${i + 1}. ${s}`),
    kidMode ? 'Rocky is staying safe with you. You are doing great.' : '',
  ].join(' ');

  return (
    <div className="shelter-backdrop">
      <div
        ref={box}
        tabIndex={-1}
        className={`shelter card ${kidMode ? 'kid' : ''} ${isPractice ? 'practice' : ''} hz-${h.id}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="shelter-title"
      >
        <div className="shelter-head">
          <span className="shelter-emoji" aria-hidden>{h.emoji}</span>
          <div>
            <p className="shelter-kicker">
              {isPractice ? 'Practice drill' : alert?.event}
              {!isPractice && alert?.ends ? ` ${until(alert.ends)}` : ''}
            </p>
            <h2 id="shelter-title">{title}</h2>
          </div>
          <button className="ghost shelter-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {list.length > 1 && (
          <div className="shelter-tabs" role="tablist" aria-label="Warnings">
            {list.map(({ hazard }) => (
              <button key={hazard.id} role="tab" aria-selected={hazard.id === h.id} className={hazard.id === h.id ? 'active' : ''} onClick={() => setPick(hazard.id)}>
                {hazard.emoji} {hazard.name}
              </button>
            ))}
          </div>
        )}

        <div className="shelter-go">
          {kidMode && <Raccoon size={96} items={h.id === 'tornado' ? [] : ['raincoat', 'boots']} />}
          <div>
            <p className="shelter-go-label">{kidMode ? 'Our safe spot' : h.id === 'flood' ? 'Move to' : 'Go to'}</p>
            <p className="shelter-spot">{spot || (kidMode ? 'Ask your grown-up where to go' : h.spotHint.replace(/^./, (c) => c.toUpperCase()))}</p>
            {shelter.note && <p className="shelter-note">{shelter.note}</p>}
            {!spot && !kidMode && (
              <p className="shelter-note">
                Your family hasn't picked a spot for this yet. <button className="link" onClick={onPlan}>Set it in the safety plan</button>
              </p>
            )}
          </div>
        </div>

        <ol className="shelter-steps">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>

        {kidMode && (
          <div className="breathe" aria-hidden>
            <div className="breathe-ball" />
            <p>Smell the flower… blow out the candle…</p>
          </div>
        )}

        {!kidMode && h.id === 'hurricane' && (plan.evacuation.zone || plan.evacuation.destination) && (
          <p className="shelter-line">🚗 Evacuation zone <strong>{plan.evacuation.zone || 'not set'}</strong>{plan.evacuation.destination ? <>, going to <strong>{plan.evacuation.destination}</strong></> : null}</p>
        )}
        {(plan.meeting.home || plan.meeting.away) && (
          <p className="shelter-line">
            🤝 {kidMode ? 'If we get split up, we meet at' : 'Meet up at'} <strong>{plan.meeting.home || plan.meeting.away}</strong>
            {!kidMode && plan.meeting.home && plan.meeting.away ? <> (or <strong>{plan.meeting.away}</strong> if you can't get home)</> : null}
          </p>
        )}
        {!kidMode && plan.contacts.length > 0 && (
          <ul className="shelter-contacts">
            {plan.contacts.map((c, i) => (
              <li key={i}>
                {c.phone ? <a href={telHref(c.phone)}>📞 {c.name || c.phone}</a> : <span>{c.name}</span>}
                {c.phone && c.name ? <small> {c.phone}</small> : null}
                {c.note ? <small> · {c.note}</small> : null}
              </li>
            ))}
          </ul>
        )}

        {!isPractice && alert?.headline && !kidMode && <p className="shelter-small">{alert.headline}</p>}
        <p className="shelter-small">
          {kidMode ? 'Rocky is staying safe with you. Grown-ups and weather helpers are keeping watch.' : 'Follow instructions from local officials and the National Weather Service. In an emergency, call 911.'}
        </p>

        <div className="shelter-actions">
          <SpeakButton text={words} />
          <button className="ghost" onClick={onPlan}>{kidMode ? 'Our family plan' : 'Full safety plan'}</button>
          {isPractice && onDrillDone && <button onClick={onDrillDone}>✅ We practiced!</button>}
          <button className="shelter-ok" onClick={onClose}>{isPractice ? 'Close' : kidMode ? "I'm with my grown-up" : "Got it, we're sheltering"}</button>
        </div>
      </div>
    </div>
  );
}
