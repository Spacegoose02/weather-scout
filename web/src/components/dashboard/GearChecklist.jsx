import { useEffect, useMemo, useState } from 'react';
import { round } from '../../format.js';
import SpeakButton from '../kid/SpeakButton.jsx';
import { ACTIVITIES, ACTIVITY, DURATIONS, gearFor, windowHours, startOptions, hourLabel, dayKey } from '../../dashboard/gear.js';

const PREFS_KEY = 'weather-scout:gear:prefs';
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or storage full: the list still works, it just forgets */ }
};

// Pick an activity and a time, and the forecast for those hours builds a
// packing list kids can tick off.
export default function GearChecklist({ weather, kidMode, size }) {
  const { hourly, units, timezone: tz } = weather.forecast;
  const [prefs, setPrefs] = useState(() => ({ activity: 'walk', hours: 2, ...read(PREFS_KEY, {}) }));
  const [startAt, setStartAt] = useState(null); // null = now
  const starts = useMemo(() => startOptions(hourly), [hourly]);
  const start = starts.find((o) => o.epoch === startAt) || starts[0];
  const activity = ACTIVITY[prefs.activity] ? prefs.activity : 'walk';
  const hours = DURATIONS.includes(prefs.hours) ? prefs.hours : 2;

  const plan = start ? gearFor(hourly, { start: start.epoch, hours, activity, units }) : null;
  const span = start ? windowHours(hourly, start.epoch, hours) : [];

  // Ticks are kept per day, activity and start, so tomorrow starts fresh.
  const tickKey = start ? `weather-scout:gear:${dayKey(start.epoch, tz)}:${activity}:${start.now ? 'now' : start.epoch}` : '';
  const [done, setDone] = useState([]);
  useEffect(() => setDone(tickKey ? read(tickKey, []) : []), [tickKey]);

  const setPref = (p) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    write(PREFS_KEY, next);
  };
  const toggle = (id) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    write(tickKey, next);
  };

  const a = ACTIVITY[activity];
  const when = start ? (start.now ? 'now' : hourLabel(start.epoch, tz)) : '';
  const items = plan?.items || [];
  const packed = items.filter((i) => done.includes(i.id)).length;
  const allPacked = items.length > 0 && packed === items.length;
  const compact = size === 's';

  const temps = span.map((h) => h.feelsLike ?? h.temp).filter((v) => v != null);
  const lo = temps.length ? round(Math.min(...temps)) : null;
  const hi = temps.length ? round(Math.max(...temps)) : null;
  const chance = span.length ? Math.max(...span.map((h) => h.precipChance ?? 0)) : 0;
  const summary = lo == null ? '' : `Feels like ${lo === hi ? lo : `${lo} to ${hi}`}${units.temp}, ${chance}% chance of rain${plan?.stats.maxUv >= 1 ? `, UV up to ${round(plan.stats.maxUv)}` : ''}.`;

  const readAloud = () => [
    `For a ${a.label.toLowerCase()} ${start?.now ? 'right now' : `at ${when}`}, bring:`,
    items.map((i) => i.label).join(', ') || 'just your shoes and a smile',
    ...(plan?.warnings || []),
  ].join('. ');

  return (
    <section className={`card checklist dash-gear ${size}`}>
      <div className="card-title">
        <h2>🎒 {kidMode ? 'What should I bring?' : 'Gear checklist'}</h2>
        {items.length > 0 && <span className="hint">{packed} of {items.length} packed</span>}
      </div>

      <div className="gear-acts" role="group" aria-label="Activity">
        {ACTIVITIES.map((x) => (
          <button key={x.id} className={x.id === activity ? 'on' : ''} aria-pressed={x.id === activity} onClick={() => setPref({ activity: x.id })} title={x.label}>
            <span aria-hidden>{x.emoji}</span>{!compact && <small>{x.label}</small>}
          </button>
        ))}
      </div>

      <div className="gear-when">
        <label>
          <span>Leaving</span>
          <select value={start?.epoch ?? ''} onChange={(e) => setStartAt(Number(e.target.value))}>
            {starts.map((o) => <option key={o.epoch} value={o.epoch}>{o.now ? 'Now' : hourLabel(o.epoch, tz)}</option>)}
          </select>
        </label>
        <label>
          <span>For</span>
          <select value={hours} onChange={(e) => setPref({ hours: Number(e.target.value) })}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d === 1 ? '1 hour' : `${d} hours`}</option>)}
          </select>
        </label>
      </div>

      {!plan ? (
        <p className="hint">The forecast does not reach that far yet.</p>
      ) : (
        <>
          {summary && <p className="hint gear-summary">{summary}</p>}
          {plan.warnings.map((w) => <p key={w} className="gear-warn" role="alert">⚠️ {w}</p>)}
          {items.length === 0 ? (
            <p>Nothing special needed. Just your shoes and a smile! 😊</p>
          ) : (
            <ul>
              {items.map((i) => (
                <li key={i.id}>
                  <button className={done.includes(i.id) ? 'checked' : ''} onClick={() => toggle(i.id)} aria-pressed={done.includes(i.id)}>
                    <span className="emoji" aria-hidden>{done.includes(i.id) ? '✅' : i.emoji}</span>
                    <span><strong>{i.label}</strong>{!compact && <small>{i.why}</small>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {allPacked && <p className="yay">🎉 All packed! Have a great {a.label.toLowerCase()}!</p>}
          <div className="row gear-foot">
            {kidMode && <SpeakButton text={readAloud} />}
            {done.length > 0 && <button className="link" onClick={() => { setDone([]); write(tickKey, []); }}>Clear ticks</button>}
          </div>
        </>
      )}
    </section>
  );
}
