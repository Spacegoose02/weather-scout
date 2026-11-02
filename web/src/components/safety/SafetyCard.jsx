import { readiness, shelterAlerts } from '../../../../shared/safety-plan.js';
import { openSafety, useSafetyPlan } from '../../safety/useSafetyPlan.js';

// Dashboard card: the family's tornado spot, how ready the plan is, and a
// big "where to shelter" button while a warning is out.
export default function SafetyCard({ weather, user, kidMode }) {
  const { plan } = useSafetyPlan(user?.id);
  const r = readiness(plan);
  const now = shelterAlerts(weather?.alerts);
  return (
    <section className="card dash-safety">
      <div className="card-title">
        <h2>🛡️ {kidMode ? 'Our storm plan' : 'Family safety plan'}</h2>
        <button className="link" onClick={() => openSafety('plan')}>Open</button>
      </div>
      {now.length > 0 && (
        <button className="shelter-now" onClick={() => openSafety('shelter', now[0].hazard.id)}>
          {now[0].hazard.emoji} {now[0].alert.event}: where to shelter
        </button>
      )}
      <p className="hint">{kidMode ? 'Our safe spot' : 'Tornado spot'}</p>
      <p className="safety-card-spot">{plan.shelters.tornado.spot || 'Not picked yet'}</p>
      <p className="hint">
        Kit {r.kitDone}/{r.kitTotal} packed · {plan.lastDrill ? `last drill ${new Date(`${plan.lastDrill}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'no drill yet'}
      </p>
      {r.todo[0] && <p className="hint">Next: {r.todo[0]}</p>}
    </section>
  );
}
