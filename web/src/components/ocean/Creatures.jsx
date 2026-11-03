import { useEffect, useRef, useState } from 'react';
import { CREATURES, creatureOfWeek, zoneById } from '../../ocean/ocean.js';
import { trackProgress, localDay, localProgress } from '../../kid/badges.js';
import SpeakButton from '../kid/SpeakButton.jsx';

const meet = (id) => trackProgress({ creatures: { [id]: localDay() } });

function CreatureCard({ c, kid, hero }) {
  const zone = zoneById(c.zone);
  const text = kid ? c.kid : c.adult;
  return (
    <article className={`creature-card ${hero ? 'hero' : ''}`} style={{ '--zone': zone.color }}>
      <div className="creature-art" aria-hidden><span>{c.emoji}</span></div>
      <div className="creature-info">
        {hero && <p className="creature-week">⭐ Creature of the week</p>}
        <h3>{c.name}</h3>
        <p className="creature-power">Superpower: <strong>{c.power}</strong></p>
        <p>{text}</p>
        <dl className="creature-stats">
          <div><dt>Lives in</dt><dd>{zone.emoji} {zone.name}</dd></div>
          <div><dt>Depth</dt><dd>{c.depth}</dd></div>
          <div><dt>Size</dt><dd>{c.size}</dd></div>
        </dl>
        <SpeakButton text={`${c.name}. Superpower: ${c.power}. ${text}`} onSpeak={() => meet(c.id)} />
      </div>
    </article>
  );
}

// This week's creature up top, then every creature to meet.
export default function Creatures({ kid, initial = null }) {
  const week = creatureOfWeek();
  const [open, setOpen] = useState(initial);
  const detail = useRef(null);
  useEffect(() => {
    if (open) detail.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [open]);
  const [met, setMet] = useState(() => localProgress().creatures || {});
  useEffect(() => {
    meet(week.id).then(() => initial && meet(initial)).then(() => setMet(localProgress().creatures || {}));
  }, [week.id, initial]);
  const pick = (c) => {
    setOpen(open === c.id ? null : c.id);
    meet(c.id).then(() => setMet(localProgress().creatures || {}));
  };
  const opened = CREATURES.find((c) => c.id === open);
  const metCount = CREATURES.filter((c) => met[c.id]).length;

  return (
    <section className="card ocean-creatures">
      <CreatureCard c={week} kid={kid} hero />
      <p className="hint creature-next">Next week: {creatureOfWeek(new Date(), 1).emoji} a new creature. Come back Monday!</p>

      <h2>🐠 Meet them all <span className="points">{metCount} of {CREATURES.length}</span></h2>
      <p className="hint">{kid ? 'Tap a creature to meet it. Meet 5 to earn the Creature Friend badge!' : 'Every creature in the weekly rotation. Tap one for details.'}</p>
      <ul className="creature-grid">
        {CREATURES.map((c) => (
          <li key={c.id}>
            <button className={`creature-tile ${open === c.id ? 'active' : ''} ${met[c.id] ? 'met' : ''}`} style={{ '--zone': zoneById(c.zone).color }} aria-expanded={open === c.id} onClick={() => pick(c)}>
              <span className="creature-tile-emoji" aria-hidden>{c.emoji}</span>
              <span>{c.name}</span>
              {met[c.id] && <span className="creature-met" aria-label="met">✓</span>}
            </button>
          </li>
        ))}
      </ul>
      <div ref={detail}>{opened && <CreatureCard c={opened} kid={kid} />}</div>
    </section>
  );
}
