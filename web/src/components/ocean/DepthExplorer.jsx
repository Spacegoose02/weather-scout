import { useEffect, useRef, useState } from 'react';
import { LANDMARKS, MAX_DEPTH, ZONES, creaturesIn, depthLabel, lightAt, pressureAt, zoneAt } from '../../ocean/ocean.js';
import { trackProgress, localDay } from '../../kid/badges.js';
import SpeakButton from '../kid/SpeakButton.jsx';

// Each zone gets the same height on screen, otherwise the sunlit top 200 m
// would be a thin line above 10 km of dark water.
const SLICE = 1 / ZONES.length;
export function depthAt(p) {
  const i = Math.min(ZONES.length - 1, Math.floor(p / SLICE));
  const z = ZONES[i];
  return z.top + ((p - i * SLICE) / SLICE) * (z.bottom - z.top);
}
export function placeOf(m) {
  const i = ZONES.findIndex((z) => m < z.bottom);
  const k = i < 0 ? ZONES.length - 1 : i;
  const z = ZONES[k];
  return Math.min(1, (k + (m - z.top) / (z.bottom - z.top)) * SLICE);
}

const DIVE_MS = 20000;

export default function DepthExplorer({ kid, units, onCreature }) {
  const [p, setP] = useState(0);
  const [diving, setDiving] = useState(null); // null | 'down' | 'up'
  const raf = useRef(0);
  const m = depthAt(p);
  const zone = zoneAt(m);

  useEffect(() => {
    trackProgress({ oceanZones: { [zone.id]: localDay() } });
  }, [zone.id]);

  const pRef = useRef(0);
  pRef.current = p;
  useEffect(() => {
    if (!diving) return undefined;
    let last = performance.now();
    const step = (t) => {
      const dt = (t - last) / DIVE_MS;
      last = t;
      const x = pRef.current;
      const n = diving === 'down' ? Math.min(1, x + dt) : Math.max(0, x - dt * 2);
      pRef.current = n;
      setP(n);
      if (n === 1 || n === 0) setDiving(null);
      else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [diving]);

  const near = LANDMARKS.filter((l) => l.depth >= zone.top && l.depth <= zone.bottom);
  const passed = [...LANDMARKS].reverse().find((l) => l.depth <= m + 1);
  const light = lightAt(m);
  const atm = pressureAt(m);
  const lightText = light >= 1 ? `${Math.round(light)}% of the sunlight` : m < 1000 ? 'just a faint blue glow' : 'none, only animal light';
  const here = creaturesIn(zone.id);
  const say = `${zone.name}. ${kid ? zone.kid : zone.adult}`;

  return (
    <section className="card ocean-dive" style={{ '--zone': zone.color }}>
      <h2>🤿 Depth explorer</h2>
      <p className="hint">{kid ? 'Ride Rocky\'s submarine from the waves all the way to the deepest spot on Earth!' : 'From the surface to Challenger Deep. Each zone gets equal height so the shallow ones are readable.'}</p>

      <div className="dive-layout">
        <div
          className="dive-column"
          role="slider"
          tabIndex={0}
          aria-label="Depth"
          aria-valuemin={0}
          aria-valuemax={MAX_DEPTH}
          aria-valuenow={Math.round(m)}
          aria-valuetext={`${depthLabel(m, units)}, ${zone.name}`}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setDiving(null);
            setP(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
          }}
          onKeyDown={(e) => {
            const d = { ArrowDown: 0.02, ArrowUp: -0.02, PageDown: SLICE, PageUp: -SLICE, End: 1, Home: -1 }[e.key];
            if (d == null) return;
            e.preventDefault();
            setDiving(null);
            setP((x) => Math.min(1, Math.max(0, x + d)));
          }}
        >
          {ZONES.map((z) => (
            <div key={z.id} className={`dive-zone ${z.id === zone.id ? 'here' : ''}`} style={{ background: z.color }}>
              <span>{z.emoji} {z.name}</span>
            </div>
          ))}
          {LANDMARKS.map((l) => (
            <span key={l.depth} className="dive-mark" style={{ top: `${Math.min(97, Math.max(3, placeOf(l.depth) * 100))}%` }} title={kid ? l.kid : l.adult} aria-hidden>{l.emoji}</span>
          ))}
          <span className="dive-sub" style={{ top: `${Math.min(96, Math.max(4, p * 100))}%` }} aria-hidden>{m > 1000 ? '🔦' : '🚤'}</span>
        </div>

        <div className="dive-info">
          <p className="dive-depth">{depthLabel(m, units)}<small> down</small></p>
          <h3>{zone.emoji} {zone.name} <small className="hint">{zone.science}</small></h3>
          <p>{kid ? zone.kid : zone.adult}</p>
          <dl className="dive-stats">
            <div><dt>💡 Light</dt><dd>{lightText}</dd></div>
            <div><dt>🌡️ Water</dt><dd>{zone.temp}</dd></div>
            <div><dt>🎈 Pressure</dt><dd>{atm < 1.5 ? 'Normal air pressure' : `${Math.round(atm).toLocaleString()}× the air at the beach`}</dd></div>
          </dl>
          {passed && <p className="dive-passed">{passed.emoji} {kid ? passed.kid : passed.adult} ({depthLabel(passed.depth, units)})</p>}
          {here.length > 0 && (
            <div className="dive-creatures">
              <span className="hint">Who lives here:</span>
              {here.map((c) => <button key={c.id} className="chip" onClick={() => onCreature(c.id)} title={c.power}>{c.emoji} {c.name}</button>)}
            </div>
          )}
          {near.length > 0 && !kid && (
            <ul className="dive-landmarks">{near.map((l) => <li key={l.depth}>{l.emoji} {l.adult}</li>)}</ul>
          )}
          <div className="dive-actions">
            {p < 1 && <button onClick={() => setDiving(diving === 'down' ? null : 'down')}>{diving === 'down' ? '⏸ Stop' : '⬇️ Dive!'}</button>}
            {p > 0 && <button className="ghost" onClick={() => setDiving(diving === 'up' ? null : 'up')}>{diving === 'up' ? '⏸ Stop' : '⬆️ Surface'}</button>}
            <SpeakButton text={say} />
          </div>
          <label className="dive-range">
            <span className="hint">Depth</span>
            <input type="range" min={0} max={1000} value={Math.round(p * 1000)} onChange={(e) => { setDiving(null); setP(Number(e.target.value) / 1000); }} aria-valuetext={depthLabel(m, units)} />
          </label>
        </div>
      </div>
    </section>
  );
}
