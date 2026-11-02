import { useEffect } from 'react';
import { bingoStatus } from '../../kid/logic.js';

export default function Bingo({ card, kid }) {
  const saved = kid.data.bingo?.date === card.date ? kid.data.bingo.marked : [];
  const status = bingoStatus(card.squares, saved);
  const toggle = (id) => kid.update(() => ({
    bingo: { date: card.date, marked: saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id] },
  }));

  useEffect(() => {
    if (status.bingo) kid.earn('bingo');
    if (status.blackout) kid.earn('sharp-eyes');
  }, [status.bingo, status.blackout]); // eslint-disable-line react-hooks/exhaustive-deps

  const inLine = new Set(status.lines.flat());
  return (
    <section className="card bingo">
      <h2>Weather bingo</h2>
      <p className="hint">Go outside or look out the window. Tap a square when you spot it! A new card comes every day.</p>
      <div className="bingo-grid" role="grid">
        {card.squares.map((s, i) => (
          <button
            key={s.id}
            role="gridcell"
            className={`${status.onCells[i] ? 'on' : ''} ${inLine.has(i) ? 'line' : ''} ${s.free ? 'free' : ''}`}
            onClick={() => !s.free && toggle(s.id)}
            aria-pressed={status.onCells[i]}
            disabled={s.free}
          >
            <span className="emoji" aria-hidden>{s.emoji}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      {status.blackout ? <p className="yay">🌟 You found everything! Super sharp eyes!</p> : status.bingo && <p className="yay">🎉 BINGO! Can you find them all?</p>}
    </section>
  );
}
