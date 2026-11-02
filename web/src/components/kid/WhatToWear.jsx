import { useState } from 'react';
import Raccoon from '../Raccoon.jsx';
import RockyFace from '../RockyFace.jsx';
import { WARDROBE, checkOutfit } from '../../kid/logic.js';
import { speak } from '../../kid/speak.js';

export default function WhatToWear({ raccoon, kid }) {
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);
  const toggle = (id) => {
    setResult(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const check = () => {
    const r = checkOutfit(picked, raccoon.items, { minFeelsLike: raccoon.minFeelsLike });
    setResult(r);
    speak([r.headline, ...r.tips.map((t) => t.text)].join(' '));
    if (r.perfect) kid.earn('dressed-for-it');
  };
  return (
    <section className="card wear">
      <h2>What should Rocky wear?</h2>
      <p className="hint">Look at the weather, then dress Rocky. Tap clothes to put them on or take them off.</p>
      <div className="wear-body">
        <Raccoon items={picked} size={170} />
        <div className="wardrobe">
          {WARDROBE.map((w) => (
            <button key={w.id} className={picked.includes(w.id) ? 'on' : ''} onClick={() => toggle(w.id)} aria-pressed={picked.includes(w.id)}>
              <span className="emoji" aria-hidden>{w.emoji}</span> {w.label}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <button onClick={check}>Ask Rocky! <RockyFace /></button>
        {picked.length > 0 && <button className="ghost" onClick={() => { setPicked([]); setResult(null); }}>Start over</button>}
      </div>
      {result && (
        <div className={`wear-result ${result.perfect ? 'good' : ''}`} role="status">
          <p className="stars" aria-label={`${result.stars} of 3 stars`}>{'⭐'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</p>
          <p><strong>{result.headline}</strong></p>
          <ul>{result.tips.map((t) => <li key={t.id + t.kind}>{t.kind === 'need' ? '➕' : '➖'} {t.text}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
