import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { changedValues } from '../ai/settings.js';
import { Source, Secret, Result } from './SettingsFields.jsx';
import DefaultLayersField from './map/DefaultLayersField.jsx';

// Family & settings: everything else that used to need the Unraid template
// (home place, road camera keys, Windy, weather stations, Home Assistant, push,
// sign-out link, Android app). The server sends the fields; this lays them out.
const GROUPS = [
  { id: 'home', title: '🏠 Home place & units', intro: 'Where the app opens for people who have not picked a place, and the units it starts in.' },
  { id: 'cameras', title: '📷 Road cameras', intro: 'VA, SC, MD, KY and DE work with no key. NC, NY, GA and OH switch on with a free developer key from each state.' },
  { id: 'maps', title: '🗺️ Maps, Windy & webcams', intro: 'Windy has two different keys. The Map Forecast key is for the 🌬️ Windy wind map; the Webcams key adds 🌄 Windy webcams to the Radar & Cams map. Make each one at api.windy.com/keys. Also: which layers the Radar & Cams map starts with.' },
  { id: 'pollen', title: '🌼 Pollen counts', intro: 'Pollen for Europe is free with no key. For the US and most other countries, add a Google Pollen API key.' },
  { id: 'air', title: '📡 Live air sensors', intro: 'Optional. Without keys the app uses the air-quality model. With an AirNow and/or PurpleAir key, the Air card and the 📡 Air sensors map layer show real readings from monitors near you.' },
  { id: 'lightning', title: '⚡ Live lightning', intro: 'Lightning on the Radar & Cams map and the "lightning within X miles" alerts. Each person picks their own alert distance under 🔔 Alerts.' },
  { id: 'stations', title: '🌡️ Weather stations', intro: 'Ecowitt and Ambient stations can upload straight to Weather Scout. Cloud accounts (Ambient, Tempest) are checked on a timer.' },
  { id: 'homeassistant', title: '🏡 Home Assistant', intro: 'Send the weather to Home Assistant over MQTT (sensors appear on their own) and/or straight to its REST API.' },
  { id: 'apps', title: '🔔 Alerts, sign-out & Android app', intro: '' },
];
const TEST_LABEL = { ambient: 'Test Ambient', tempest: 'Test Tempest', mqtt: 'Test MQTT', homeassistant: 'Test Home Assistant', webcams: 'Test Webcams key' };
const testLabel = (t) => TEST_LABEL[t] || (t.startsWith('camera:') ? `Test ${t.slice(7).toUpperCase()} key` : 'Test');

function Field({ ctx, r }) {
  const k = r.key;
  if (r.secret) {
    const help = <>{r.help}{r.signup && <> <a href={r.signup} target="_blank" rel="noopener noreferrer">Get a key</a>.</>}</>;
    return <Secret ctx={ctx} k={k} label={r.label} help={r.help || r.signup ? help : null} />;
  }
  if (r.type === 'layers') {
    return <DefaultLayersField label={r.label} help={r.help} source={<Source ctx={ctx} k={k} />} value={ctx.form[k]} onChange={(v) => ctx.set(k)({ target: { value: v } })} />;
  }
  if (r.options) {
    const fallback = r.options[0];
    return (
      <label>
        <span>{r.label} <Source ctx={ctx} k={k} /></span>
        <select value={ctx.form[k] || fallback} onChange={ctx.set(k)}>
          {r.options.map((o, i) => <option key={o} value={o}>{r.choices?.[i] || o}</option>)}
        </select>
        {r.help && <small className="hint">{r.help}</small>}
      </label>
    );
  }
  return (
    <label>
      <span>{r.label} <Source ctx={ctx} k={k} /></span>
      <input
        type={r.type === 'number' ? 'number' : 'text'} step="any" inputMode={r.type === 'number' ? 'decimal' : undefined}
        spellCheck={false} placeholder={r.placeholder || ''} value={ctx.form[k]} onChange={ctx.set(k)}
      />
      {r.help && <small className="hint">{r.help}</small>}
    </label>
  );
}

// Look a place up by name and fill in the home name, latitude and longitude.
function PlaceFinder({ onPick }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const find = async () => {
    if (!q.trim()) return;
    try {
      const r = await api(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      setHits(Array.isArray(r) ? r : r.results || []);
    } catch {
      setHits([]);
    }
  };
  return (
    <div className="place-finder">
      <div className="ai-actions">
        <input type="text" placeholder="Find a town or ZIP" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } }} aria-label="Find a place" />
        <button type="button" className="ghost" onClick={find}>Find</button>
      </div>
      {hits && (hits.length ? (
        <ul className="feeds">
          {hits.slice(0, 5).map((h) => (
            <li key={`${h.lat},${h.lon}`}>
              <button type="button" className="link" onClick={() => { onPick(h); setHits(null); }}>{h.name}</button>
            </li>
          ))}
        </ul>
      ) : <p className="hint">No places found.</p>)}
    </div>
  );
}

export default function AppSettingsPanel() {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState({});

  const show = (v) => {
    setView(v);
    setForm(Object.fromEntries(v.settings.map((s) => [s.key, s.secret ? '' : s.value])));
  };
  useEffect(() => { api('/api/admin/settings').then(show).catch((e) => setError(e.message)); }, []);
  if (!view) return error ? <p className="error-text">{error}</p> : null;

  const rows = Object.fromEntries(view.settings.map((s) => [s.key, s]));
  const set = (key) => (e) => { setSaved(''); setForm((f) => ({ ...f, [key]: e.target.value })); };
  const changes = changedValues(view.settings, form);
  const dirty = Object.keys(changes).length > 0;

  const save = async (values, note = 'Saved. The new settings are in use now.') => {
    setError('');
    setBusy(true);
    try {
      show(await api('/api/admin/settings', { method: 'PUT', body: { values } }));
      setTests({});
      setSaved(note);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const test = async (target) => {
    setTests((t) => ({ ...t, [target]: { pending: true } }));
    try {
      const r = await api('/api/admin/settings/test', { method: 'POST', body: { target, values: changes } });
      setTests((t) => ({ ...t, [target]: r }));
    } catch (e) {
      setTests((t) => ({ ...t, [target]: { ok: false, message: e.message } }));
    }
  };

  const ctx = { rows, form, set, save, tests };
  const savedHere = (g) => view.settings.filter((s) => s.group === g && s.source === 'saved').length;

  return (
    <form className="ai-settings app-settings" onSubmit={(e) => { e.preventDefault(); if (dirty) save(changes); }}>
      <h3>App settings</h3>
      <p className="hint">
        These used to live in the Unraid template. Anything saved here is kept on the server (in the data folder), is used
        right away, and wins over the template. Keys are never shown again after you save them.
      </p>
      {GROUPS.map((g) => {
        const fields = view.settings.filter((s) => s.group === g.id);
        if (!fields.length) return null;
        const targets = [...new Set(fields.map((f) => f.test).filter(Boolean))];
        const n = savedHere(g.id);
        return (
          <details key={g.id} className="settings-group">
            <summary>{g.title}{n > 0 && <span className="ai-src saved">{n} saved here</span>}</summary>
            {g.intro && <p className="hint">{g.intro}</p>}
            {g.id === 'home' && (
              <PlaceFinder onPick={(h) => { setSaved(''); setForm((f) => ({ ...f, DEFAULT_LOCATION_NAME: h.name, DEFAULT_LAT: String(h.lat), DEFAULT_LON: String(h.lon) })); }} />
            )}
            <div className="ai-row">
              {fields.map((r) => <Field key={r.key} ctx={ctx} r={r} />)}
            </div>
            {targets.length > 0 && (
              <>
                <div className="ai-actions">
                  {targets.map((t) => <button key={t} type="button" className="ghost" disabled={tests[t]?.pending} onClick={() => test(t)}>{testLabel(t)}</button>)}
                </div>
                {targets.map((t) => <Result key={t} ctx={ctx} target={t} />)}
              </>
            )}
          </details>
        );
      })}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="ai-actions ai-save">
        <button type="submit" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save app settings'}</button>
        {dirty && <button type="button" className="link" onClick={() => show(view)}>Undo changes</button>}
        {saved && !dirty && <span className="hint" role="status">✅ {saved}</span>}
      </div>
    </form>
  );
}
