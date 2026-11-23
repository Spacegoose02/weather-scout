// One wildfire, everything in one place: size, containment, crews, where it
// is, the fire team's notes on closures, evacuations and smoke, where the smoke
// is blowing, air quality near the fire, safety notes and Rocky's kid version.
// Opened from the Wildfires & smoke card and from fire pins and burned areas on
// the map (anything can call openFire()).
import { useEffect, useState } from 'react';
import Modal from '../Modal.jsx';
import RockyFace from '../RockyFace.jsx';
import { api } from '../../api.js';

export const FIRE_EVENT = 'ws:fire-detail';
export const openFire = (id, name = '') => window.dispatchEvent(new CustomEvent(FIRE_EVENT, { detail: { id, name } }));

const STATUS = {
  active: { label: 'Active', kid: 'Still burning', cls: 'active' },
  contained: { label: 'Contained', kid: 'Fenced in', cls: 'contained' },
  controlled: { label: 'Controlled', kid: 'Under control', cls: 'controlled' },
  out: { label: 'Out', kid: 'All out', cls: 'out' },
};
const day = (t) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');
const stamp = (t) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)} million` : `$${Math.round(n / 1000).toLocaleString()}k`);

export default function FireDetailHost({ location, kidMode }) {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    const on = (e) => setOpen(e.detail);
    window.addEventListener(FIRE_EVENT, on);
    return () => window.removeEventListener(FIRE_EVENT, on);
  }, []);
  if (!open?.id) return null;
  return <FireDetail id={open.id} name={open.name} location={location} kidMode={kidMode} onClose={() => setOpen(null)} />;
}

function Notes({ title, emoji, items }) {
  if (!items?.length) return null;
  return (
    <div className="fire-notes">
      <h4>{emoji} {title}</h4>
      <ul>{items.map((s) => <li key={s}>{s}</li>)}</ul>
    </div>
  );
}

export function FireDetail({ id, name, location, kidMode, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setD(null);
    setErr('');
    const here = location ? `&lat=${location.lat}&lon=${location.lon}` : '';
    api(`/api/fires/detail?id=${encodeURIComponent(id)}${here}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [id, location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = d?.fire;
  const st = STATUS[f?.status] || STATUS.active;
  const where = f ? [f.near, [f.county && `${f.county} County`, f.state].filter(Boolean).join(', ')].filter(Boolean) : [];
  const inc = d?.inciweb;
  return (
    <Modal title={`🔥 ${f?.name || name || 'Wildfire'}`} onClose={onClose} wide>
      {!d && !err && <p className="hint">Loading the latest on this fire…</p>}
      {err && <p className="hint">Couldn’t load this fire: {err}</p>}
      {f && (
        <div className={`fire-detail ${kidMode ? 'kid' : ''}`}>
          <p className="fire-sub">
            <span className={`fire-status ${st.cls}`}>{kidMode ? st.kid : st.label}</span>
            {where.length > 0 && <span>{where.join(' · ')}</span>}
            {d.you && <span className="hint">{d.you.miles} mi {d.you.dir} of you</span>}
          </p>

          <div className="fire-stats">
            <div><span>{kidMode ? 'How big' : 'Size'}</span><b>{f.acres != null ? `${f.acres.toLocaleString()} acres` : 'Unknown'}</b></div>
            <div>
              <span>Contained</span>
              <b>{f.contained != null ? `${f.contained}%` : '—'}</b>
              {f.contained != null && <div className="fire-bar" role="img" aria-label={`${f.contained}% contained`}><i style={{ width: `${Math.min(100, f.contained)}%` }} /></div>}
            </div>
            <div><span>{kidMode ? 'Firefighters' : 'Personnel'}</span><b>{f.personnel != null ? f.personnel.toLocaleString() : '—'}</b></div>
            <div><span>Started</span><b>{day(f.started) || '—'}</b></div>
            {!kidMode && f.cause && <div><span>Cause</span><b>{f.cause}</b></div>}
            {!kidMode && f.costToDate != null && <div><span>Cost so far</span><b>{money(f.costToDate)}</b></div>}
          </div>

          {kidMode && d.kid?.length > 0 && (
            <div className="fire-rocky">
              <h3><RockyFace /> Rocky explains</h3>
              {d.kid.map((l) => <p key={l}>{l}</p>)}
            </div>
          )}

          {d.you?.downwind && (
            <p className="fire-upwind">💨 {kidMode ? 'The wind is blowing this fire’s smoke toward you. If you smell smoke, play inside.' : `You are downwind: today’s wind carries this fire’s smoke toward you (${d.you.miles} mi away).`}</p>
          )}

          <section className="fire-section">
            <h3>🌫️ Smoke and air</h3>
            {d.drift && <p>{d.drift.text}</p>}
            {d.air?.aqi != null && <p>Air quality near the fire: <b>AQI {d.air.aqi}</b>{d.air.category ? ` (${d.air.category})` : ''}{!kidMode && d.air.pm25 != null ? `, fine particles ${Math.round(d.air.pm25)} µg/m³` : ''}.</p>}
            {!kidMode && <Notes title="From the fire team" emoji="📣" items={inc?.smoke} />}
            {!kidMode && <p className="hint">Live smoke and sensor readings: <a href={d.links.airnow} target="_blank" rel="noopener noreferrer">AirNow Fire and Smoke Map</a>. Turn on the Smoke and Air sensors layers on the Map tab to see it here.</p>}
          </section>

          {!kidMode && (
            <section className="fire-section">
              <h3>📋 Latest from the fire team</h3>
              {inc ? (
                <>
                  <Notes title="Closures" emoji="⛔" items={inc.closures} />
                  <Notes title="Evacuations and homes" emoji="🏠" items={inc.evacuations} />
                  <Notes title="Safety" emoji="⚠️" items={inc.safety} />
                  {(() => {
                    const text = inc.latest || inc.overview;
                    if (!text) return null;
                    const bullets = inc.closures.length + inc.evacuations.length + inc.safety.length;
                    return bullets
                      ? <details className="fire-latest-more"><summary>{inc.latest ? 'Read the latest update' : 'Read the full overview'}</summary><p className="fire-latest">{text}</p></details>
                      : <p className="fire-latest">{text}</p>;
                  })()}
                  <p className="hint">InciWeb{inc.updated ? `, updated ${inc.updated}` : ''}. <a href={inc.url} target="_blank" rel="noopener noreferrer">Full incident page</a></p>
                </>
              ) : (
                <p className="hint">
                  {d.inciwebAvailable === false ? 'InciWeb could not be reached just now. ' : 'This fire has no written update on InciWeb. '}
                  Road and trail closures and evacuation orders are posted by the managing agency{f.agency ? ` (${f.agency})` : ''} and local emergency officials.
                </p>
              )}
            </section>
          )}

          {!kidMode && (
            <section className="fire-section">
              <h3>🧭 About this fire</h3>
              <div className="fire-facts">
                {f.land && <div className="buoy-row"><span>Burning on</span><b>{f.land}</b></div>}
                {f.agency && <div className="buoy-row"><span>Managed by</span><b>{f.agency}{f.team ? ` · ${f.team}` : ''}</b></div>}
                {f.behavior.length > 0 && <div className="buoy-row"><span>Fire behavior</span><b>{f.behavior.join(', ')}</b></div>}
                {f.fuels.length > 0 && <div className="buoy-row"><span>Burning in</span><b>{f.fuels.join(', ')}</b></div>}
                {f.startAcres != null && <div className="buoy-row"><span>Size when found</span><b>{f.startAcres.toLocaleString()} acres</b></div>}
                {f.complex && <div className="buoy-row"><span>Part of</span><b>{f.complex}</b></div>}
                {f.containedAt && <div className="buoy-row"><span>Contained</span><b>{day(f.containedAt)}</b></div>}
                {f.fireId && <div className="buoy-row"><span>Fire number</span><b>{f.fireId}</b></div>}
              </div>
            </section>
          )}

          <section className="fire-section">
            <h3>🛡️ {kidMode ? 'Stay safe' : 'Safety'}</h3>
            <ul className="fire-safety">{d.safety.map((s) => <li key={s.id}><span aria-hidden>{s.emoji}</span> {s.text}</li>)}</ul>
          </section>

          {!kidMode && d.kid?.length > 0 && (
            <details className="fire-rocky">
              <summary><RockyFace /> Rocky explains it for kids</summary>
              {d.kid.map((l) => <p key={l}>{l}</p>)}
            </details>
          )}

          <details className="fire-words">
            <summary>📖 {kidMode ? 'Firefighter words' : 'What the fire words mean'}</summary>
            <dl>{d.words.map((w) => <div key={w.word}><dt>{w.word}</dt><dd>{w.text}</dd></div>)}</dl>
          </details>

          <p className="source">{d.sources.join(' · ')}{f.updated ? `. Record updated ${stamp(f.updated)}.` : '.'}</p>
        </div>
      )}
    </Modal>
  );
}
