import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { useChase } from '../../../kid/chaser/useChase.js';
import { RARITIES, RARITY_LABEL, addCard, binderStats, dayLabel, milesBetween, timeLabel } from '../../../kid/chaser/live.js';

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const rad = (d) => (d * Math.PI) / 180;
function dirFrom(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return DIRS[Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) / 45) % 8];
}

// Collectible cards made from real storm reports across the country.
export default function StormCards({ location, kid }) {
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('today');
  const [chase, save] = useChase(kid);

  useEffect(() => {
    let live = true;
    api('/api/chaser/cards').then((d) => live && setDeck(d)).catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const have = chase.cards || {};
  const stats = binderStats(chase);
  const collect = (c) => save((x) => addCard(x, c));

  return (
    <>
      <section className="card storm-cards">
        <h2>🃏 Storm cards <span className="points">{stats.total} collected</span></h2>
        <div className="chaser-pills" role="tablist">
          <button role="tab" className={view === 'today' ? 'active' : ''} aria-selected={view === 'today'} onClick={() => setView('today')}>Today's storms</button>
          <button role="tab" className={view === 'binder' ? 'active' : ''} aria-selected={view === 'binder'} onClick={() => setView('binder')}>My binder</button>
        </div>
        {view === 'today' && (
          <>
            {error && <p>Could not get today's storm reports. {error}</p>}
            {!deck && !error && <p>Shuffling the storm deck… 🃏</p>}
            {deck && (
              <p className="hint">
                {deck.cards.length
                  ? `Real storms from ${dayLabel(deck.day)}${deck.day !== deck.today ? ' (today\'s storms have not started yet)' : ''}: ${deck.counts.tornado} tornado, ${deck.counts.hail} hail and ${deck.counts.wind} wind reports across the country. Collect your favorites!`
                  : 'No storm reports yet today. When storms happen, new cards show up here. Check back this evening!'}
              </p>
            )}
            {deck?.cards.length > 0 && (
              <ul className="card-deck">
                {deck.cards.map((c) => (
                  <li key={c.id}>
                    <StormCard card={c} home={location} />
                    {have[c.id]
                      ? <p className="collected">✅ In your binder</p>
                      : <button onClick={() => collect(c)}>➕ Collect</button>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {view === 'binder' && <Binder chase={chase} stats={stats} home={location} />}
      </section>
    </>
  );
}

function Binder({ chase, stats, home }) {
  const cards = Object.values(chase.cards || {}).sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.day.localeCompare(a.day));
  if (!cards.length) return <p className="hint">Your binder is empty. Collect a storm card from today's storms to start!</p>;
  return (
    <>
      <p className="binder-count">
        {RARITIES.slice().reverse().map((r) => <span key={r} className={`rar rar-${r}`}>{RARITY_LABEL[r]}: {stats.by[r] || 0}</span>)}
      </p>
      <ul className="card-deck">
        {cards.map((c) => <li key={c.id}><StormCard card={c} home={home} /></li>)}
      </ul>
    </>
  );
}

export function StormCard({ card: c, home }) {
  const [flip, setFlip] = useState(false);
  const away = home ? milesBetween(home, c) : null;
  return (
    <button className={`storm-card type-${c.type} rar-${c.rarity}${flip ? ' flipped' : ''}`} onClick={() => setFlip(!flip)} aria-label={`${c.name} card, ${RARITY_LABEL[c.rarity]}. Tap to flip.`}>
      {!flip ? (
        <>
          <span className="sc-top"><span className="sc-rarity">{RARITY_LABEL[c.rarity]}</span>{c.stormOfTheDay && <span className="sc-sotd">⭐ Storm of the day</span>}</span>
          <span className="sc-art" aria-hidden><span>{c.emoji}</span></span>
          <strong className="sc-name">{c.name}</strong>
          <span className="sc-stat">{c.stat}</span>
          <span className="sc-power" aria-label={`Power ${c.power} of 100`}><i style={{ width: `${c.power}%` }} /></span>
          <span className="sc-foot">{c.state} · {dayLabel(c.day).split(',')[0]}</span>
        </>
      ) : (
        <span className="sc-back">
          <strong>{c.name}</strong>
          <span>📍 {c.place}</span>
          <span>🕒 {timeLabel(c.time)}, {dayLabel(c.day)}</span>
          {away != null && <span>🧭 {away.toLocaleString()} miles {dirFrom(home, c)} of you</span>}
          <span>⚡ Power {c.power} / 100</span>
          <span className="sc-fact">💡 {c.fact}</span>
        </span>
      )}
    </button>
  );
}
