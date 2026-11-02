import { useState } from 'react';
import { HAZARDS, LIMITS, kitId, readiness } from '../../../../shared/safety-plan.js';
import Modal from '../Modal.jsx';
import { safetyActions } from '../../safety/useSafetyPlan.js';

const TABS = [
  ['shelter', '🏠 Shelter spots'],
  ['people', '🤝 Meet & call'],
  ['kit', '🎒 Emergency kit'],
  ['drill', '🛡️ Practice'],
];

const fmtDay = (day) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const monthsSince = (day) => (day ? (Date.now() - new Date(`${day}T12:00:00`).getTime()) / (30.4 * 86_400_000) : Infinity);

// The family severe weather safety plan. Grown-ups (admins) fill it in;
// everyone signed in can tick off the emergency kit and log a drill.
export default function SafetyPlan({ safety, user, kidMode, onClose, onPractice, onSignIn }) {
  const { plan, canEdit, canTick, contactsHidden, updatedAt, updatedBy, error: loadError } = safety;
  const [tab, setTab] = useState('shelter');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [newItem, setNewItem] = useState('');
  const view = draft || plan;
  const ready = readiness(plan);

  const edit = (fn) => setDraft((d) => fn(structuredClone(d || plan)));
  const run = async (fn, done) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      if (done) setMsg(done);
      return true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => {
    // Kit ticks made while editing go straight to the server; keep them.
    const ticks = Object.fromEntries(plan.kit.map((k) => [k.id, k.done]));
    await safetyActions.save({ ...draft, kit: draft.kit.map((k) => ({ ...k, done: ticks[k.id] ?? k.done })) });
    setDraft(null);
  }, 'Saved. Everyone in the family sees the new plan.');

  const field = (label, value, onChange, { max = LIMITS.spot, placeholder = '', area = false } = {}) => (
    <label className="safety-field">
      <span>{label}</span>
      {!canEdit ? (
        <strong className={value ? '' : 'muted'}>{value || 'Not set yet'}</strong>
      ) : area ? (
        <textarea value={value} maxLength={max} placeholder={placeholder} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );

  return (
    <Modal title="🛡️ Family safety plan" onClose={onClose} wide>
      <div className="safety-plan">
        <div className="safety-summary no-print">
          <div className="safety-meter" role="img" aria-label={`${ready.todo.length ? `${ready.todo.length} things left to do` : 'Plan complete'}`}>
            <strong>{ready.ready ? '✅ Ready' : `${5 - ready.todo.length}/5`}</strong>
            <span>{ready.ready ? 'Your family plan is complete' : 'steps done'}</span>
          </div>
          {ready.todo.length > 0 && (
            <ul className="safety-todo">{ready.todo.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
          )}
        </div>

        {!canEdit && (
          <p className="hint no-print">
            {kidMode ? 'This is your family\'s plan. A grown-up fills it in, and you can help pack the kit!' : user ? 'A grown-up with a Family & settings account fills in the plan. You can tick off the kit and log drills.' : <>Sign in as a grown-up to fill in the plan. <button className="link" onClick={onSignIn}>Sign in</button></>}
          </p>
        )}
        {loadError && <p className="hint no-print">Showing the copy saved on this device ({loadError}).</p>}

        <nav className="safety-tabs no-print" aria-label="Safety plan">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        {tab === 'shelter' && (
          <div className="safety-section no-print">
            <p className="hint">Pick where everyone goes for each kind of warning. This is what pops up, big and clear, when a warning comes in.</p>
            <div className="safety-hazards">
              {HAZARDS.map((h) => (
                <section key={h.id} className="safety-hazard">
                  <h3>{h.emoji} {h.name}</h3>
                  {field(h.spotLabel, view.shelters[h.id].spot, (v) => edit((d) => { d.shelters[h.id].spot = v; return d; }), { placeholder: h.spotHint })}
                  {(canEdit || view.shelters[h.id].note) && field('Notes (who grabs what)', view.shelters[h.id].note, (v) => edit((d) => { d.shelters[h.id].note = v; return d; }), { max: LIMITS.note, area: true, placeholder: 'Dad carries the baby, Sam grabs the weather radio' })}
                  <button className="link" onClick={() => onPractice(h.id)}>Preview the pop-up</button>
                </section>
              ))}
            </div>
          </div>
        )}

        {tab === 'people' && (
          <div className="safety-section no-print">
            <div className="safety-two">
              {field('Meeting place right outside the house', view.meeting.home, (v) => edit((d) => { d.meeting.home = v; return d; }), { placeholder: 'the big oak tree by the mailbox' })}
              {field("Meeting place if you can't get home", view.meeting.away, (v) => edit((d) => { d.meeting.away = v; return d; }), { placeholder: 'the public library on Main St' })}
              {field('Hurricane evacuation zone', view.evacuation.zone, (v) => edit((d) => { d.evacuation.zone = v; return d; }), { max: LIMITS.name, placeholder: 'Zone B' })}
              {field('Where we go if we evacuate', view.evacuation.destination, (v) => edit((d) => { d.evacuation.destination = v; return d; }), { placeholder: "Aunt Jo's house in Charlottesville" })}
            </div>
            <h3>Emergency contacts</h3>
            {contactsHidden && <p className="hint">Sign in to see the family's emergency contacts.</p>}
            {!contactsHidden && view.contacts.length === 0 && !canEdit && <p className="hint">No contacts yet.</p>}
            <ul className="safety-contacts">
              {view.contacts.map((c, i) => (
                <li key={i}>
                  {canEdit ? (
                    <>
                      <input aria-label="Name" value={c.name} maxLength={LIMITS.name} placeholder="Grandma" onChange={(e) => edit((d) => { d.contacts[i].name = e.target.value; return d; })} />
                      <input aria-label="Phone" type="tel" value={c.phone} maxLength={LIMITS.phone} placeholder="555-0100" onChange={(e) => edit((d) => { d.contacts[i].phone = e.target.value; return d; })} />
                      <input aria-label="Note" value={c.note} maxLength={LIMITS.label} placeholder="out-of-state contact" onChange={(e) => edit((d) => { d.contacts[i].note = e.target.value; return d; })} />
                      <button className="ghost" aria-label={`Remove ${c.name || 'contact'}`} onClick={() => edit((d) => { d.contacts.splice(i, 1); return d; })}>✕</button>
                    </>
                  ) : (
                    <span><strong>{c.name}</strong> {c.phone && <a href={`tel:${c.phone.replace(/[^\d+*#]/g, '')}`}>{c.phone}</a>} {c.note && <small>· {c.note}</small>}</span>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && view.contacts.length < LIMITS.contacts && (
              <button className="ghost" onClick={() => edit((d) => { d.contacts.push({ name: '', phone: '', note: '' }); return d; })}>+ Add a contact</button>
            )}
            <p className="hint">Tip: include one contact who lives out of state. After a big storm, long-distance calls and texts often get through when local ones don't.</p>
            {field('Other notes (medicines, pets, how to turn off the gas)', view.notes, (v) => edit((d) => { d.notes = v; return d; }), { max: LIMITS.notes, area: true, placeholder: 'Gas shut-off is by the side of the house; the wrench hangs on the hook.' })}
          </div>
        )}

        {tab === 'kit' && (
          <div className="safety-section no-print">
            <p className="hint">{ready.kitDone} of {ready.kitTotal} packed. Keep the kit by your tornado spot and check it each spring and fall.</p>
            <div className="safety-progress" aria-hidden><span style={{ width: `${ready.kitTotal ? (100 * ready.kitDone) / ready.kitTotal : 0}%` }} /></div>
            <ul className="safety-kit">
              {view.kit.map((k, i) => {
                const done = plan.kit.find((x) => x.id === k.id)?.done ?? false;
                return (
                  <li key={k.id}>
                    <label>
                      <input type="checkbox" checked={done} disabled={!canTick || !plan.kit.some((x) => x.id === k.id)} onChange={(e) => safetyActions.tick(k.id, e.target.checked).catch((err) => setMsg(err.message))} />
                      <span>{k.label}</span>
                    </label>
                    {canEdit && <button className="ghost" aria-label={`Remove ${k.label}`} onClick={() => edit((d) => { d.kit.splice(i, 1); return d; })}>✕</button>}
                  </li>
                );
              })}
            </ul>
            {!canTick && <p className="hint">Sign in to tick items off.</p>}
            {canEdit && view.kit.length < LIMITS.kit && (
              <form className="safety-add" onSubmit={(e) => {
                e.preventDefault();
                const label = newItem.trim();
                if (!label) return;
                edit((d) => { d.kit.push({ id: kitId(label, new Set(d.kit.map((k) => k.id))), label, done: false }); return d; });
                setNewItem('');
              }}>
                <input value={newItem} maxLength={LIMITS.label} placeholder="Add something (baby formula, hearing aid batteries…)" onChange={(e) => setNewItem(e.target.value)} aria-label="New kit item" />
                <button className="ghost">Add</button>
              </form>
            )}
          </div>
        )}

        {tab === 'drill' && (
          <div className="safety-section no-print">
            <p>
              {plan.lastDrill ? <>Last drill: <strong>{fmtDay(plan.lastDrill)}</strong>.</> : 'No drills logged yet.'}{' '}
              {monthsSince(plan.lastDrill) > 6 ? 'Practice at least twice a year, so everyone knows where to go without thinking.' : 'Nice work. Practice again in a few months.'}
            </p>
            <div className="safety-drills">
              {HAZARDS.map((h) => (
                <button key={h.id} className="ghost" onClick={() => onPractice(h.id)}>{h.emoji} Practice: {h.name}</button>
              ))}
            </div>
            <p className="hint">A drill: open the practice pop-up, read it aloud together, walk to the spot, sit and cover your heads, then come back and tap "We practiced!"</p>
            {canTick && <button disabled={busy} onClick={() => run(safetyActions.drill, 'Drill logged. Great job, team!')}>✅ Log a drill for today</button>}
          </div>
        )}

        <PrintablePlan plan={plan} />

        <div className="safety-foot no-print">
          {canEdit && draft && (
            <>
              <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save plan'}</button>
              <button className="ghost" disabled={busy} onClick={() => { setDraft(null); setMsg(''); }}>Cancel</button>
            </>
          )}
          <button className="ghost" onClick={() => window.print()}>🖨️ Print for the fridge</button>
          {canEdit && !draft && (
            <button className="ghost" disabled={busy} onClick={() => window.confirm('Clear the whole plan and start over with the starter kit list?') && run(safetyActions.reset, 'Plan cleared.')}>Start over</button>
          )}
          {msg && <span className="hint" role="status">{msg}</span>}
          {updatedAt && <span className="hint">Updated {new Date(`${updatedAt.replace(' ', 'T')}Z`).toLocaleDateString()}{updatedBy ? ` by ${updatedBy}` : ''}</span>}
        </div>
      </div>
    </Modal>
  );
}

// One page with everything, shown only when printing.
function PrintablePlan({ plan }) {
  return (
    <div className="print-only safety-print">
      <h1>Our family severe weather plan</h1>
      <table>
        <tbody>
          {HAZARDS.map((h) => (
            <tr key={h.id}>
              <th>{h.emoji} {h.name}</th>
              <td><strong>{plan.shelters[h.id].spot || '________________'}</strong>{plan.shelters[h.id].note ? ` (${plan.shelters[h.id].note})` : ''}</td>
            </tr>
          ))}
          <tr><th>Meet outside</th><td>{plan.meeting.home || '________________'}</td></tr>
          <tr><th>Meet away from home</th><td>{plan.meeting.away || '________________'}</td></tr>
          <tr><th>Evacuation</th><td>Zone {plan.evacuation.zone || '____'}, going to {plan.evacuation.destination || '________________'}</td></tr>
        </tbody>
      </table>
      <h2>Contacts</h2>
      <ul>{plan.contacts.map((c, i) => <li key={i}>{c.name} {c.phone} {c.note}</li>)}<li>Emergency: 911</li></ul>
      {plan.notes && <><h2>Notes</h2><p>{plan.notes}</p></>}
      <h2>Emergency kit</h2>
      <ul className="print-kit">{plan.kit.map((k) => <li key={k.id}>{k.done ? '☑' : '☐'} {k.label}</li>)}</ul>
    </div>
  );
}
