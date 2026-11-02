import { useMemo, useState } from 'react';
import { whyLessons } from '../../learn/why.js';
import SpeakButton from '../kid/SpeakButton.jsx';
import RockyFace from '../RockyFace.jsx';

// Tap-to-expand micro-lessons explaining today's weather with today's numbers.
export default function WhyNow({ weather, audience, onTopic, limit = 6 }) {
  const lessons = useMemo(() => whyLessons(weather.forecast, { alerts: weather.alerts }).slice(0, limit), [weather, limit]);
  const [open, setOpen] = useState(lessons[0]?.id ?? null);
  if (!lessons.length) return null;
  const kid = audience === 'kid';
  return (
    <section className="card why-now">
      <h2 className="card-title">
        <span>Why is this happening?</span>
        <span className="hint">Tap a question</span>
      </h2>
      <ul>
        {lessons.map((l) => {
          const isOpen = open === l.id;
          const body = kid ? l.kid : l.adult;
          return (
            <li key={l.id} className={isOpen ? 'open' : ''}>
              <button className="why-q" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
                <span className="emoji" aria-hidden>{l.emoji}</span>
                <span className="why-title">{l.title}</span>
                <span className="why-reading">{l.reading}</span>
              </button>
              {isOpen && (
                <div className="why-body">
                  <p>{kid && <RockyFace className="inline" />} {body}</p>
                  <div className="why-actions">
                    <SpeakButton text={body} />
                    {l.topic && <button className="ghost" onClick={() => onTopic(l.topic)}>Learn more →</button>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
