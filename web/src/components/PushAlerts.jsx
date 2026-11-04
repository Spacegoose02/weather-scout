import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { pushSupported, secureContext, currentSubscription, enablePush, disablePush } from '../push.js';
import { ALERT_MILES, DEFAULT_ALERT_MILES, milesToKm } from '../../../shared/lightning.js';
import { RULE_CHOICES, RULE_INFO, anyRule } from '../../../shared/thresholds.js';

const KINDS = [
  ['warning', 'Warnings', 'Tornado, severe thunderstorm, flash flood, high wind, winter storm…'],
  ['watch', 'Watches', 'Conditions are right for dangerous weather later.'],
  ['advisory', 'Advisories', 'Wind, fog, frost, heat and other heads-ups.'],
];

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

const milesLabel = (mi, units) => (units === 'metric' ? `${Math.round(milesToKm(mi))} km` : `${mi} miles`);

export default function PushAlerts({ location, saved, onClose, lightningMiles = DEFAULT_ALERT_MILES, onLightningMiles, lightningOn = true, units }) {
  const places = dedupe([location, ...(saved || [])].filter(Boolean));
  const [status, setStatus] = useState(null);
  const [placeIdx, setPlaceIdx] = useState(0);
  const [levels, setLevels] = useState(['warning']);
  const [briefing, setBriefing] = useState(false);
  const [briefingTime, setBriefingTime] = useState('07:00');
  const [boltPush, setBoltPush] = useState(false);
  const ruleUnits = units === 'metric' ? 'metric' : 'imperial';
  const [rules, setRules] = useState(() => ({ units: ruleUnits, rain: false, freeze: null, gust: null, heat: null, snow: false, aurora: false, cell: false, quiet: true }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!pushSupported() || !secureContext()) return setStatus({ subscribed: false });
      const sub = await currentSubscription();
      if (!sub) return setStatus({ subscribed: false });
      const s = await api('/api/push/status', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => ({ subscribed: false }));
      setStatus(s);
      if (s.subscribed) {
        setLevels(s.levels);
        setBriefing(!!s.briefingTime);
        if (s.briefingTime) setBriefingTime(s.briefingTime);
        setBoltPush(!!s.lightningMiles);
        if (s.rules) setRules(s.rules);
        if (s.lightningMiles && onLightningMiles && s.lightningMiles !== lightningMiles) onLightningMiles(s.lightningMiles);
        const i = places.findIndex((p) => Math.abs(p.lat - s.place.lat) < 0.01 && Math.abs(p.lon - s.place.lon) < 0.01);
        if (i >= 0) setPlaceIdx(i);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await fn();
      if (done) setMsg(done);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(
    async () => setStatus(await enablePush({ place: places[placeIdx], levels, briefingTime: briefing ? briefingTime : null, lightningMiles: boltPush && lightningMiles ? lightningMiles : null, rules: anyRule(rules) ? rules : null, units: rules.units })),
    levels.length || boltPush || anyRule(rules) ? 'Alerts are on for this device.' : "Rocky's morning briefing is on for this device.",
  );
  const off = () => run(async () => { await disablePush(); setStatus({ subscribed: false }); }, 'Alerts are off for this device.');
  const test = () => run(async () => {
    const sub = await currentSubscription();
    await api('/api/push/test', { method: 'POST', body: { endpoint: sub.endpoint } });
  }, 'Test sent. It should pop up in a few seconds.');
  const testBriefing = () => run(async () => {
    const sub = await currentSubscription();
    await api('/api/push/briefing-test', { method: 'POST', body: { endpoint: sub.endpoint } });
  }, "Rocky's briefing is on its way. It should pop up in a few seconds.");

  const toggle = (k) => setLevels((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));

  let blocker = null;
  if (!secureContext()) blocker = 'Your browser only allows alerts on a secure (https://) address. Open Weather Scout through your https domain (for example behind your reverse proxy) to turn them on.';
  else if (isIos() && !standalone()) blocker = 'On iPhone and iPad, first add Weather Scout to your Home Screen (Share, then "Add to Home Screen"), open it from there, and come back here.';
  else if (!pushSupported()) blocker = 'This browser does not support push notifications.';

  return (
    <Modal title="Weather alerts on this device" onClose={onClose}>
      <p className="hint">Get a notification on this phone or computer when the National Weather Service issues an alert, or a morning briefing from Rocky, even when Weather Scout is closed. Each device picks its own place.</p>
      {lightningOn && onLightningMiles && (
        <label className="bolt-distance">
          ⚡ Warn me on screen when lightning strikes within{' '}
          <select value={lightningMiles || 0} onChange={(e) => onLightningMiles(Number(e.target.value))}>
            <option value={0}>Off</option>
            {ALERT_MILES.map((m) => <option key={m} value={m}>{milesLabel(m, units)}</option>)}
          </select>
        </label>
      )}
      {blocker ? (
        <p className="error-text" role="alert">{blocker}</p>
      ) : !status ? (
        <p>Checking…</p>
      ) : (
        <div className="form push-form">
          <label>
            Place
            <select value={placeIdx} onChange={(e) => setPlaceIdx(Number(e.target.value))}>
              {places.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Send me</legend>
            {KINDS.map(([k, label, note]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={levels.includes(k)} onChange={() => toggle(k)} />
                <span><strong>{label}</strong> <span className="tile-note">{note}</span></span>
              </label>
            ))}
          </fieldset>
          {lightningOn && (
            <fieldset>
              <legend>Lightning</legend>
              <label className="check">
                <input type="checkbox" checked={boltPush && !!lightningMiles} disabled={!lightningMiles} onChange={(e) => setBoltPush(e.target.checked)} />
                <span><strong>⚡ Lightning nearby</strong> <span className="tile-note">{lightningMiles ? `When lightning strikes within ${milesLabel(lightningMiles, units)} (the distance above), then an all-clear after 30 quiet minutes.` : 'Pick a distance above first.'}</span></span>
              </label>
            </fieldset>
          )}
          <PersonalAlerts rules={rules} onChange={setRules} />
          <fieldset>
            <legend>Every morning</legend>
            <label className="check">
              <input type="checkbox" checked={briefing} onChange={(e) => setBriefing(e.target.checked)} />
              <span><strong>🦝 Rocky's morning briefing</strong> <span className="tile-note">Today's weather, what to wear and any alerts, at the time you pick. Tap it to hear Rocky read it aloud.</span></span>
            </label>
            {briefing && (
              <label>
                Time
                <input type="time" value={briefingTime} onChange={(e) => setBriefingTime(e.target.value)} required />
              </label>
            )}
          </fieldset>
          <div className="row-actions">
            <button onClick={save} disabled={busy || (!levels.length && !briefing && !(boltPush && lightningMiles) && !anyRule(rules)) || (briefing && !briefingTime)}>{status.subscribed ? 'Save' : '🔔 Turn on'}</button>
            {status.subscribed && <button className="ghost" onClick={test} disabled={busy}>Send a test</button>}
            {status.subscribed && status.briefingTime && <button className="ghost" onClick={testBriefing} disabled={busy}>Try the briefing</button>}
            {status.subscribed && <button className="link danger" onClick={off} disabled={busy}>Turn off</button>}
          </div>
          {status.subscribed && <p className="hint">On for <strong>{status.place.name || 'your place'}</strong>{status.briefingTime ? `, briefing at ${status.briefingTime} local time` : ''}{status.lastSentAt ? `, last notification sent ${new Date(`${status.lastSentAt}Z`).toLocaleString()}` : ''}.</p>}
        </div>
      )}
      {msg && <p className="ok-text" role="status">{msg}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </Modal>
  );
}

// Personal alerts: rain soon, frost, gusts, heat, snow, the northern lights and storms on the radar,
// each with its own number. Saved with the rest of this device's alerts.
function PersonalAlerts({ rules, onChange }) {
  const choices = RULE_CHOICES[rules.units] || RULE_CHOICES.imperial;
  const set = (patch) => onChange({ ...rules, ...patch });
  const flag = (id) => (
    <label key={id} className="check">
      <input type="checkbox" checked={!!rules[id]} onChange={(e) => set({ [id]: e.target.checked })} />
      <span><strong>{RULE_INFO[id].emoji} {RULE_INFO[id].name}</strong> <span className="tile-note">{RULE_INFO[id].note}</span></span>
    </label>
  );
  const number = (id, word) => {
    const c = choices[id];
    const on = rules[id] != null;
    return (
      <div key={id} className="check rule-number">
        <input type="checkbox" id={`rule-${id}`} checked={on} onChange={(e) => set({ [id]: e.target.checked ? c.default : null })} />
        <span>
          <label htmlFor={`rule-${id}`}><strong>{RULE_INFO[id].emoji} {RULE_INFO[id].name}</strong></label>{' '}
          {on && (
            <select aria-label={`${RULE_INFO[id].name}: ${word}`} value={rules[id]} onChange={(e) => set({ [id]: Number(e.target.value) })}>
              {[...new Set([...c.options, rules[id]])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{word} {v}{c.unit === '°F' || c.unit === '°C' ? c.unit : ` ${c.unit}`}</option>)}
            </select>
          )}
          <span className="tile-note"> {RULE_INFO[id].note}</span>
        </span>
      </div>
    );
  };
  return (
    <fieldset className="personal-alerts">
      <legend>Personal alerts</legend>
      <p className="hint">Heads-ups from the forecast for this place, each sent once. Pick your own numbers.</p>
      {flag('rain')}
      {number('freeze', 'at or below')}
      {number('gust', 'at')}
      {number('heat', 'feels like')}
      {flag('snow')}
      {flag('aurora')}
      {flag('cell')}
      <label className="check">
        <input type="checkbox" checked={rules.quiet !== false} onChange={(e) => set({ quiet: e.target.checked })} />
        <span><strong>🌙 Quiet hours</strong> <span className="tile-note">Hold these from 9 PM to 7 AM. NWS warnings still come through.</span></span>
      </label>
    </fieldset>
  );
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((l) => {
    const k = `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
