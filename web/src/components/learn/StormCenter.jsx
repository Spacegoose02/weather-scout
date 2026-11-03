import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { HAZARDS, hazardById, hazardAlerts, nearbyStorms } from '../../learn/storms.js';
import SpeakButton from '../kid/SpeakButton.jsx';
import Quiz from './Quiz.jsx';
import LiveChasers from '../chasers/LiveChasers.jsx';

function LiveNow({ hazard, alerts, location, storms }) {
  const mine = hazardAlerts(alerts, hazard);
  const tropical = hazard.id === 'hurricane' ? nearbyStorms(storms?.storms || [], location) : [];
  return (
    <div className="storm-live">
      <h3>Live near you</h3>
      {mine.length > 0 ? (
        <ul className="storm-alerts">
          {mine.map((a) => <li key={a.id} className={`sev-${(a.severity || '').toLowerCase()}`}><strong>{a.event}</strong>{a.headline ? ` · ${a.headline}` : ''}</li>)}
        </ul>
      ) : (
        <p className="hint">✅ No {hazard.noun} alerts for your location right now.</p>
      )}
      {hazard.id === 'hurricane' && (
        storms == null ? <p className="hint">Checking the tropics…</p>
          : tropical.length ? (
            <ul className="storm-tropics">
              {tropical.map((s) => (
                <li key={s.id}>
                  🌀 <strong>{s.kind} {s.name}</strong>{s.windMph ? `, ${s.windMph} mph winds` : ''}
                  {s.miles != null && <> · about {s.miles.toLocaleString()} miles away</>}
                  {s.advisoryUrl && <> · <a href={s.advisoryUrl} target="_blank" rel="noreferrer">advisory</a></>}
                </li>
              ))}
            </ul>
          ) : <p className="hint">The National Hurricane Center is not tracking any storms right now.</p>
      )}
    </div>
  );
}

export default function StormCenter({ audience, weather, location, onBack, initial = 'tornado', chasers }) {
  const kid = audience === 'kid';
  const pick = (x) => (kid ? x.kid : x.adult);
  const [id, setId] = useState(initial);
  const [storms, setStorms] = useState(null);
  const hazard = hazardById(id);
  const alerts = weather?.alerts || [];

  useEffect(() => {
    if (id !== 'hurricane' || storms) return;
    api('/api/tropics').then(setStorms).catch(() => setStorms({ storms: [] }));
  }, [id, storms]);

  return (
    <article className="card storm-center" style={{ '--topic': hazard.color }}>
      <button className="link back" onClick={onBack}>← All topics</button>
      <h2>⛈️ Storm Center</h2>
      <div className="storm-tabs" role="tablist" aria-label="Storm types">
        {HAZARDS.map((h) => {
          const live = hazardAlerts(alerts, h).length;
          return (
            <button key={h.id} role="tab" aria-selected={id === h.id} className={`chip ${id === h.id ? 'active' : ''}`} onClick={() => setId(h.id)}>
              <span aria-hidden>{h.emoji}</span> {h.title}{live > 0 && <span className="live-dot" title="Active alert near you" />}
            </button>
          );
        })}
      </div>

      <p className="topic-intro">{pick(hazard)}</p>
      <SpeakButton text={pick(hazard)} />

      <LiveNow hazard={hazard} alerts={alerts} location={location} storms={storms} />

      <LiveChasers kid={kid} popups={chasers} />

      <section className="topic-section">
        <h3>How {hazard.title.toLowerCase()} form</h3>
        <ol className="storm-steps">{hazard.forms.map((f) => <li key={f.adult}>{pick(f)}</li>)}</ol>
      </section>

      <section className="topic-section">
        <h3>{hazard.scale.name}</h3>
        <table className="storm-scale">
          <tbody>
            {hazard.scale.rows.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="topic-section safety">
        <h3>🛟 Stay safe</h3>
        <ul>{hazard.safety.map((s) => <li key={s}>{s}</li>)}</ul>
        <SpeakButton text={`Stay safe. ${hazard.safety.join(' ')}`} label="Read the safety steps" />
      </section>

      <section className="topic-section">
        <h3>Did you know?</h3>
        <ul className="facts">{hazard.facts.map((f) => <li key={f}>💡 {f}</li>)}</ul>
      </section>

      <Quiz key={hazard.id} questions={hazard.quiz} quizId={`storm-${hazard.id}`} />

      <p className="topic-links">
        Learn more: {hazard.links.map((l, i) => (
          <span key={l.url}>{i > 0 && ' · '}<a href={l.url} target="_blank" rel="noreferrer">{l.label}</a></span>
        ))}
      </p>
    </article>
  );
}
