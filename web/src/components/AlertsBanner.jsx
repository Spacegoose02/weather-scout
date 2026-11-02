import { useState } from 'react';
import { hazardFor } from '../../../shared/safety-plan.js';
import { openSafety } from '../safety/useSafetyPlan.js';

const COLORS = { Extreme: 'extreme', Severe: 'severe', Moderate: 'moderate', Minor: 'minor' };

export default function AlertsBanner({ alerts, kidMode }) {
  const [open, setOpen] = useState(null);
  if (!alerts?.length) return null;
  return (
    <section className="alerts" aria-label="Weather alerts">
      {alerts.map((a) => (
        <article key={a.id} className={`alert ${COLORS[a.severity] || 'minor'}`}>
          <button className="alert-head" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
            <strong>⚠️ {a.event}</strong>
            <span>{kidMode ? a.kid : a.headline}</span>
          </button>
          {hazardFor(a) && (
            <button className="shelter-btn" onClick={() => openSafety('shelter', hazardFor(a).id)}>
              🛡️ {kidMode ? 'Where is our safe spot?' : 'Where to shelter'}
            </button>
          )}
          {open === a.id && (
            <div className="alert-body">
              {kidMode && <p className="kid-text">{a.kid}</p>}
              <p className="area">{a.areaDesc}</p>
              <pre>{a.description}</pre>
              {a.instruction && (
                <>
                  <h4>What to do</h4>
                  <pre>{a.instruction}</pre>
                </>
              )}
              <p className="area">Issued by {a.sender}. Ends {a.ends ? new Date(a.ends).toLocaleString() : 'when cancelled'}.</p>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
