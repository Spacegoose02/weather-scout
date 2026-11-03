import { useEffect, useMemo, useRef, useState } from 'react';
import Quiz from '../../learn/Quiz.jsx';
import SpeakButton from '../SpeakButton.jsx';
import { EF_QUIZ, EF_SCALE, INGREDIENTS, MISSIONS, START, brewStorm, efWindLabel } from '../../../kid/chaser/lab.js';
import { HAIL_SIZES } from '../../../kid/chaser/spotter.js';
import { openSafety } from '../../../safety/useSafetyPlan.js';
import '../../../learn/learn.css';
import '../../../kid/chaser/train.css';

// Tornado Lab: mix the storm ingredients and watch what grows, then learn how
// the EF scale rates tornadoes from the damage they leave.
export default function TornadoLab({ weather, kid }) {
  const lab = kid.data.tornadoLab || {};
  const [mix, setMix] = useState(START);
  const result = useMemo(() => brewStorm(mix), [mix]);
  const done = lab.missions || {};
  const settle = useRef();

  // Check missions once the sliders stop moving for a moment.
  useEffect(() => {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const fresh = MISSIONS.filter((m) => !done[m.id] && m.done(result)).map((m) => m.id);
      if (!fresh.length) return;
      const missions = { ...done, ...Object.fromEntries(fresh.map((id) => [id, 1])) };
      kid.update((prev) => ({ tornadoLab: { ...(prev.tornadoLab || {}), missions: { ...(prev.tornadoLab?.missions || {}), ...missions } } }));
      const ids = [];
      if (missions.storm) ids.push('lab-first');
      if (missions.tornado) ids.push('lab-tornado');
      if (MISSIONS.every((m) => missions[m.id])) ids.push('lab-master');
      if (ids.length) kid.earn(...ids);
    }, 600);
    return () => clearTimeout(settle.current);
  }, [result.kind, result.hail, result.ef]); // eslint-disable-line react-hooks/exhaustive-deps

  const hail = HAIL_SIZES.find((h) => h.id === result.hail);
  const units = weather?.location?.units || 'imperial';
  const efRow = result.ef != null ? EF_SCALE[result.ef] : null;
  const missionCount = MISSIONS.filter((m) => done[m.id]).length;

  return (
    <>
      <section className="card train-wide tornado-lab">
        <div className="card-title">
          <h2>🧪 Tornado Lab</h2>
          <span className="hint">{missionCount} of {MISSIONS.length} missions</span>
        </div>
        <p className="hint">Every storm needs the same ingredients. Slide them around and watch what grows in Rocky's pretend sky. This is a simple make-believe model, but it uses the same recipe real forecasters check every morning.</p>
        <div className="lab-body">
          <div className="lab-controls">
            {INGREDIENTS.map((g) => (
              <label key={g.id} className="lab-slider">
                <span className="lab-label"><span aria-hidden>{g.emoji}</span> {g.label} <output>{mix[g.id]}</output></span>
                <input type="range" min="0" max="100" step="1" value={mix[g.id]} onChange={(e) => setMix((m) => ({ ...m, [g.id]: Number(e.target.value) }))} aria-describedby={`lab-help-${g.id}`} />
                <span className="lab-ends"><small>{g.low}</small><small>{g.high}</small></span>
                <small id={`lab-help-${g.id}`} className="lab-help">{g.help}</small>
              </label>
            ))}
            <div className="row">
              <button className="ghost" onClick={() => setMix(START)}>Reset</button>
              <button className="ghost" onClick={() => setMix({ warm: 85, cold: 80, spin: 90, push: 70 })}>Try a big chase day</button>
            </div>
          </div>
          <div className="lab-result">
            <LabScene r={result} />
            <div className={`lab-verdict k-${result.kind}`} role="status" aria-live="polite">
              <h3><span aria-hidden>{result.emoji}</span> {result.title}{efRow ? ` (EF${efRow.ef})` : ''}</h3>
              <p>{result.say}</p>
              <ul className="lab-stats">
                <li>⛽ Fuel <b>{result.fuel}</b></li>
                <li>🚀 Updraft <b>{result.updraft}</b></li>
                <li>🧊 Hail <b>{hail ? hail.label.toLowerCase() : 'none'}</b></li>
                {efRow && <li>💨 Winds <b>{efWindLabel(efRow, units)}</b></li>}
              </ul>
              {result.notes.map((n) => <p key={n} className="lab-note">🦝 {n}</p>)}
              <SpeakButton text={`${result.title}. ${result.say} ${result.notes.join(' ')}`} label="Hear Rocky" />
            </div>
          </div>
        </div>
        <h3 className="lab-missions-title">Lab missions</h3>
        <ul className="lab-missions">
          {MISSIONS.map((m) => (
            <li key={m.id} className={done[m.id] ? 'done' : ''}><span aria-hidden>{done[m.id] ? '✅' : m.emoji}</span> {m.title}</li>
          ))}
        </ul>
      </section>
      <EFScale units={units} kid={kid} />
    </>
  );
}

// The pretend sky. Everything scales from the brewStorm() result.
export function LabScene({ r }) {
  const base = 112 + (1 - r.cloudBase / 100) * 48;
  const top = base - r.tower * 140;
  const puffs = r.tower > 0 ? Math.max(2, Math.round((base - top) / 18)) : 0;
  const dark = r.storm ? 1 : r.rain ? 0.5 : 0;
  const ef = r.ef ?? 0;
  const funnelW = 6 + ef * 7;
  return (
    <svg className={`lab-scene ${r.storm ? 'storm' : ''}`} viewBox="0 0 400 260" role="img" aria-label={`${r.title} in the pretend sky`}>
      <defs>
        <linearGradient id="lab-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={dark ? (dark === 1 ? '#3b4a6b' : '#6f86a8') : '#6cb6ff'} />
          <stop offset="1" stopColor={dark ? (dark === 1 ? '#8a9ab3' : '#b3c4d9') : '#cfe9ff'} />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#lab-sky)" />
      {r.kind === 'clear' && <circle cx="330" cy="50" r="24" fill="#ffd34d" />}
      {r.kind === 'capped' && (
        <g className="lab-cap">
          <path d="M20 96 H380" />
          <text x="26" y="90">the cap: a warm lid up high</text>
        </g>
      )}

      {/* anvil, blowing downwind (to the right) */}
      {r.anvil > 0 && (
        <path className="lab-anvil" d={`M${170} ${top + 12} Q200 ${top - 14} ${240 + r.anvil * 140} ${top - 4} L${250 + r.anvil * 140} ${top + 8} Q215 ${top + 20} ${215} ${top + 26} Z`} />
      )}
      {/* the updraft tower: puffs that get wider toward the top, like cauliflower */}
      {Array.from({ length: puffs }, (_, i) => {
        const t = i / Math.max(1, puffs - 1);
        const y = base - 12 - t * (base - top - 14);
        const w = (r.kind === 'fair' ? 22 : 28) + t * (r.storm ? 16 : 6);
        const jig = i % 2 ? 7 : -6;
        return (
          <g key={i} className="lab-puff">
            <circle cx={196 - w * 0.6 + jig} cy={y + 4} r={w * 0.62} />
            <circle cx={204 + w * 0.55 + jig} cy={y + 3} r={w * 0.66} />
            <circle cx={200 + jig / 2} cy={y - 6} r={w * 0.78} />
          </g>
        );
      })}
      {r.tower > 0 && <rect className="lab-base" x="130" y={base - 6} width="160" height="14" rx="7" />}
      {r.kind === 'fair' && (
        <g className="lab-puff small">
          <circle cx="80" cy="120" r="14" /><circle cx="96" cy="116" r="17" /><circle cx="112" cy="122" r="12" />
          <circle cx="320" cy="108" r="12" /><circle cx="334" cy="104" r="15" />
        </g>
      )}

      {/* rain and hail falling ahead of the updraft */}
      {r.rain > 0 && (
        <g className="lab-rain">
          {Array.from({ length: r.rain === 1 ? 7 : 14 }, (_, i) => <path key={i} d={`M${222 + i * 5} ${base + 8} l-8 ${222 - base}`} style={{ '--d': `${(i % 5) * 0.12}s` }} />)}
        </g>
      )}
      {r.hail !== 'none' && (
        <g className="lab-hail">
          {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={228 + i * 8} cy={base + 30 + (i % 3) * 30} r={r.hail === 'pea' ? 2 : r.hail === 'quarter' ? 3 : r.hail === 'golf-ball' ? 4 : 5.5} style={{ '--d': `${i * 0.17}s` }} />)}
        </g>
      )}
      {r.lightning && <path className="lab-bolt" d={`M262 ${base + 6} l-14 34 h12 l-16 40 l30 -50 h-12 l12 -24 z`} />}

      {/* the spinning wall cloud and the tornado */}
      {r.rotation > 0 && (
        <g className="lab-wall">
          <rect x="166" y={base + 4} width="52" height={r.rotation === 1 ? 20 : 14} rx="8" />
          <path d={`M170 ${base + 10} h44 M168 ${base + 16} h48`} className="lab-spin-lines" />
        </g>
      )}
      {r.kind === 'tornado' && (
        <g className="lab-funnel">
          <path d={`M${192 - 22} ${base + 20} C${192 - 10} ${base + 60} ${192 - funnelW} 200 ${192 - funnelW / 2} 226 L${192 + funnelW / 2} 226 C${192 + funnelW} 200 ${192 + 10} ${base + 60} ${192 + 22} ${base + 20} Z`} />
          <path d={`M180 ${base + 40} q12 6 24 0 M184 ${base + 80} q8 5 16 0 M${188 - funnelW / 4} 180 q${4 + funnelW / 4} 4 ${8 + funnelW / 2} 0`} className="lab-spin-lines" />
          <ellipse className="lab-debris" cx="192" cy="226" rx={funnelW + 10} ry="7" />
        </g>
      )}

      {/* ground, a little town and the ingredient arrows */}
      <rect y="226" width="400" height="34" fill="#5fae5a" />
      <g className="lab-town">
        <path d="M300 226 v-14 l8 -7 l8 7 v14 z M326 226 v-10 l6 -6 l6 6 v10 z M352 226 v-16 h12 v16 z" />
      </g>
      {r.fuel > 0 && <path className="lab-arrow warm" d="M390 214 C340 210 300 200 262 186" style={{ opacity: Math.min(1, 0.25 + r.fuel / 100) }} />}
      <text className="lab-arrow-label warm" x="306" y="248">warm, wet air</text>
      <path className="lab-arrow cold" d="M20 40 C70 44 110 50 150 60" />
      <text className="lab-arrow-label cold" x="18" y="30">cold air up high</text>
      {r.anvil > 0 && <text className="lab-arrow-label" x="300" y={Math.max(14, top - 10)}>anvil</text>}
    </svg>
  );
}

// ---- EF scale ------------------------------------------------------------------------
function EFScale({ units, kid }) {
  const [ef, setEf] = useState(0);
  const row = EF_SCALE[ef];
  return (
    <section className="card train-wide ef-scale">
      <div className="card-title">
        <h2>📐 The EF scale</h2>
        <span className="hint">How scientists rate tornadoes</span>
      </div>
      <p>After a tornado, weather service teams walk its path and look closely at what was damaged: houses, schools, barns, trees and 28 kinds of things in all. From the damage they work out how fast the wind must have been, and give the tornado a number from EF0 to EF5. EF stands for Enhanced Fujita, named after the scientist Ted Fujita, who was nicknamed "Mr. Tornado".</p>
      <div className="ef-tabs" role="tablist" aria-label="EF ratings">
        {EF_SCALE.map((r) => (
          <button key={r.ef} role="tab" aria-selected={r.ef === ef} className={r.ef === ef ? 'active' : ''} style={{ '--ef': r.color }} onClick={() => setEf(r.ef)}>EF{r.ef}</button>
        ))}
      </div>
      <div className="ef-body">
        <DamageScene ef={ef} />
        <div className="ef-text">
          <h3 style={{ '--ef': row.color }}><span className="ef-chip">EF{row.ef}</span> {row.label}</h3>
          <p className="ef-wind">💨 {efWindLabel(row, units)}</p>
          <p>{row.damage}</p>
          {row.share && <p className="hint">{row.share}</p>}
          <SpeakButton text={`EF${row.ef}, ${row.label}. Winds ${efWindLabel(row, units)}. ${row.damage} ${row.share}`} label="Read it to me" />
        </div>
      </div>
      <p className="ef-safe">🛡️ Any tornado can be dangerous, even an EF0. That is why your family goes to its safe spot for every tornado warning. <button className="link" onClick={() => openSafety('plan')}>See our family plan</button></p>
      <Quiz questions={EF_QUIZ} quizId="storm-ef-scale" onDone={() => kid.earn('lab-ef')} />
    </section>
  );
}

// A cartoon street: a tree, a house, a fence and a car, with damage for each EF level.
export function DamageScene({ ef }) {
  const roof = ef === 0 ? 'whole' : ef === 1 ? 'peeled' : 'gone';
  const walls = ef <= 2 ? 'up' : ef === 3 ? 'some' : ef === 4 ? 'flat' : 'none';
  return (
    <svg className="damage-scene" viewBox="0 0 300 180" role="img" aria-label={`Cartoon of EF${ef} damage`}>
      <rect width="300" height="180" fill="#dff0ff" />
      <rect y="140" width="300" height="40" fill="#8fcf7a" />
      {/* tree */}
      {ef === 0 && <g><rect x="40" y="90" width="10" height="50" fill="#8a5a2b" /><circle cx="45" cy="80" r="26" fill="#3f9b4a" /><path d="M58 138 l18 -4" stroke="#8a5a2b" strokeWidth="4" /><circle cx="78" cy="133" r="6" fill="#3f9b4a" /></g>}
      {ef === 1 && <g><rect x="40" y="112" width="10" height="28" fill="#8a5a2b" /><g transform="rotate(70 50 112)"><rect x="40" y="70" width="10" height="42" fill="#8a5a2b" /><circle cx="45" cy="62" r="20" fill="#3f9b4a" /></g></g>}
      {ef === 2 && <g transform="rotate(84 50 140)"><rect x="40" y="92" width="10" height="48" fill="#8a5a2b" /><circle cx="45" cy="82" r="24" fill="#3f9b4a" /><path d="M36 140 l-8 8 M45 140 v10 M54 140 l8 8" stroke="#8a5a2b" strokeWidth="3" /></g>}
      {ef === 3 && <g><rect x="41" y="92" width="8" height="48" fill="#cdb38f" /><path d="M45 100 l-12 -10 M45 108 l12 -8" stroke="#cdb38f" strokeWidth="3" /></g>}
      {ef >= 4 && <rect x="40" y="128" width="10" height="12" fill="#8a5a2b" />}

      {/* house */}
      <rect x="110" y="136" width="90" height="6" fill="#9aa0a6" />
      {walls === 'up' && <rect x="115" y="96" width="80" height="40" fill="#f4d58d" stroke="#8d6e3f" />}
      {walls === 'up' && <g fill={ef >= 1 ? '#9fb8c9' : '#cfe8ff'} stroke="#5b6479"><rect x="125" y="106" width="16" height="14" /><rect x="170" y="106" width="16" height="14" /></g>}
      {walls === 'up' && ef >= 1 && <path d="M127 108 l12 10 M184 107 l-12 12" stroke="#5b6479" />}
      {walls === 'up' && <rect x="149" y="114" width="12" height="22" fill="#a0522d" />}
      {walls === 'some' && <g fill="#f4d58d" stroke="#8d6e3f"><rect x="115" y="104" width="12" height="32" /><path d="M150 136 v-20 l18 6 v14 z" /></g>}
      {walls === 'flat' && <g fill="#d7b46a" stroke="#8d6e3f"><path d="M112 136 l20 -10 l26 6 l18 -8 l22 12 z" /><path d="M130 128 l40 -4" /></g>}
      {roof === 'whole' && <g><path d="M108 98 L155 66 L202 98 Z" fill="#c0392b" /><path d="M150 76 l8 0 M170 86 l6 0" stroke="#dff0ff" strokeWidth="4" /></g>}
      {roof === 'peeled' && walls === 'up' && <g><path d="M108 98 L155 66 L160 70 L118 98 Z" fill="#c0392b" /><path d="M162 60 L204 80 L198 88 L158 70 Z" fill="#c0392b" transform="rotate(-18 180 74)" /></g>}
      {roof === 'gone' && ef <= 3 && <path d="M220 34 l40 -10 l6 12 l-40 12 z" fill="#c0392b" transform="rotate(25 240 30)" />}

      {/* fence */}
      {ef <= 1 && <g fill="#fff" stroke="#9aa0a6">{[0, 1, 2, 3].map((i) => <rect key={i} x={210 + i * 10} y={ef === 1 && i > 1 ? 128 : 120} width="6" height={ef === 1 && i > 1 ? 12 : 20} />)}</g>}

      {/* car */}
      {ef <= 1 && <g><rect x="250" y="122" width="40" height="14" rx="4" fill="#2f6fde" /><circle cx="258" cy="138" r="5" fill="#333" /><circle cx="282" cy="138" r="5" fill="#333" /></g>}
      {ef === 2 && <g transform="rotate(-14 270 130)"><rect x="250" y="116" width="40" height="14" rx="4" fill="#2f6fde" /><circle cx="258" cy="132" r="5" fill="#333" /><circle cx="282" cy="132" r="5" fill="#333" /></g>}
      {ef === 3 && <g transform="rotate(180 270 130)"><rect x="250" y="122" width="40" height="14" rx="4" fill="#2f6fde" /><circle cx="258" cy="120" r="5" fill="#333" /><circle cx="282" cy="120" r="5" fill="#333" /></g>}
      {ef === 4 && <g transform="rotate(40 262 40)"><rect x="250" y="34" width="26" height="9" rx="3" fill="#2f6fde" /></g>}

      {ef >= 1 && <g fill="#8d6e3f" opacity="0.8">{Array.from({ length: ef * 3 }, (_, i) => <rect key={i} x={20 + ((i * 53) % 260)} y={20 + ((i * 37) % 90)} width="5" height="3" transform={`rotate(${i * 40} ${22 + ((i * 53) % 260)} ${21 + ((i * 37) % 90)})`} />)}</g>}
      <text x="8" y="172" className="ef-scene-label">EF{ef}</text>
    </svg>
  );
}
