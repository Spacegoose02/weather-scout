import { useState } from 'react';
import { api } from '../api.js';

const CHOICES = [['closed', '🏠 Closed'], ['delay', '⏰ Delayed opening'], ['early', '🚌 Early dismissal'], ['virtual', '💻 Virtual day'], ['open', '🏫 Open on time']];

// The next weekday (or today before 7 AM), as YYYY-MM-DD in the browser's time.
function nextSchoolDay() {
  const d = new Date();
  if (d.getHours() >= 7 || d.getDay() === 0 || d.getDay() === 6) {
    do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Family & settings › School: set the status by hand (wins until that day is
// over) and check what the district page says right now.
export default function SchoolStatusPanel() {
  const [status, setStatus] = useState('closed');
  const [date, setDate] = useState(nextSchoolDay);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setMsg('');
    setError('');
    setBusy(true);
    try {
      setMsg(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => {
    await api('/api/admin/school/status', { method: 'PUT', body: { status, date, note } });
    return 'Saved. The School tomorrow card shows it now, and devices with 🏫 school alerts on get a notification.';
  });
  const clear = () => run(async () => {
    await api('/api/admin/school/status', { method: 'PUT', body: { status: null } });
    return 'Cleared. The card goes back to the district page and the snow day meter.';
  });

  return (
    <fieldset className="school-manual">
      <legend>Set today’s or tomorrow’s status yourself</legend>
      <p className="hint">Heard it from a text, a call or the news? Set it here. It wins over the district page until that day is over.</p>
      <div className="ai-row">
        <label><span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label><span>School day</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span>Note (optional)</span><input type="text" maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} placeholder="2-hour delay, buses on snow routes" /></label>
      </div>
      <div className="ai-actions">
        <button type="button" disabled={busy || !date} onClick={save}>Set status</button>
        <button type="button" className="ghost" disabled={busy} onClick={clear}>Clear</button>
      </div>
      {msg && <p className="ok-text" role="status">{msg}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </fieldset>
  );
}
