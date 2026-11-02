import { useEffect, useMemo, useState } from 'react';
import { icon } from '../../format.js';
import { useHistory } from '../../history/useHistory.js';
import { yearAt } from '../../history/history.js';
import SpeakButton from './SpeakButton.jsx';
import '../../history/history.css';

// Kid Zone: the weather time machine. Slide back through every year since 1940
// to see what today's date was like, hear Rocky's record facts, and play
// "warmer or colder than today?".
export default function TimeMachine({ location, units, kid, today }) {
  const { data: h, error } = useHistory(location, units);
  const years = useMemo(() => (h ? [...h.years].sort((a, b) => a.year - b.year) : []), [h]);
  const [year, setYear] = useState(null);
  const [guess, setGuess] = useState(null); // { year, pick }
  const [quizYear, setQuizYear] = useState(null);

  useEffect(() => {
    if (!years.length) return;
    setYear(years.at(-1).year);
    setQuizYear(randomYear(years));
  }, [years]);

  if (error) return <section className="card time-machine"><h2>⏳ Weather time machine</h2><p className="hint">The time machine is resting. {error}</p></section>;
  if (!h || year == null) return <section className="card time-machine"><h2>⏳ Weather time machine</h2><p className="hint">Warming up the time machine…</p></section>;

  const y = yearAt(years, year);
  const thisYear = Number(h.date.slice(0, 4));
  const ago = thisYear - y.year;
  const deg = (v) => (v == null ? '?' : `${Math.round(v)}°`);
  const said = `On ${h.label}, ${y.year}, it was ${deg(y.high)} in the afternoon and ${deg(y.low)} at night${y.kidLabel ? `, ${y.kidLabel.toLowerCase()}` : ''}.`;

  // The quiz compares a past year's high with today's forecast high.
  const q = quizYear ? yearAt(years, quizYear) : null;
  const todayHigh = h.compare?.high ?? h.today?.high;
  const answer = q && todayHigh != null && q.high != null ? (q.high > todayHigh ? 'warmer' : q.high < todayHigh ? 'colder' : 'same') : null;
  const pick = (p) => {
    setGuess({ year: q.year, pick: p });
    if (p !== answer && answer !== 'same') return;
    const wins = kid.data.timeMachineWins || [];
    const key = `${today}:${q.year}`;
    if (wins.includes(key)) return;
    const next = [...wins, key].slice(-20);
    kid.update(() => ({ timeMachineWins: next }));
    if (next.length >= 3) kid.earn('time-traveler');
  };
  const guessed = guess && guess.year === q?.year;

  return (
    <section className="card time-machine">
      <h2>⏳ Weather time machine</h2>
      <p className="tm-headline">{h.kid.headline}</p>

      <div className="tm-dial">
        <label htmlFor="tm-year">Travel to {h.label}, <strong>{y.year}</strong></label>
        <input id="tm-year" type="range" min={years[0].year} max={years.at(-1).year} value={y.year} onChange={(e) => setYear(Number(e.target.value))} />
        <div className="tm-year" aria-live="polite">
          <span className="tm-icon" aria-hidden>{y.icon ? icon(y.icon) : '❔'}</span>
          <div>
            <div className="tm-when">{y.year}</div>
            <div className="hint">{ago === 1 ? 'Last year' : `${ago} years ago`}{ago >= 25 && ago < 45 ? ', when your grown-ups were little' : ago >= 45 ? ', when your grandparents were young' : ''}</div>
            <div className="tm-temps">
              <span className="warm-ink">☀️ {deg(y.high)}</span> · <span className="cool-ink">🌙 {deg(y.low)}</span>
              {y.kidLabel && <> · {y.kidLabel}</>}
              {y.snow > 0 && <> · ⛄ snow!</>}
            </div>
          </div>
        </div>
        <div className="tm-buttons">
          <button className="ghost" onClick={() => setYear(randomYear(years))}>🎲 Surprise me</button>
          {h.records.warmestHigh && <button className="ghost" onClick={() => setYear(h.records.warmestHigh.year)}>🔥 Hottest year</button>}
          {h.records.coldestLow && <button className="ghost" onClick={() => setYear(h.records.coldestLow.year)}>🥶 Coldest year</button>}
          <SpeakButton text={said} label="Hear it" />
        </div>
      </div>

      {q && answer && (
        <div className="tm-quiz">
          <h3>Warmer or colder?</h3>
          <p>Today should be <strong>{deg(todayHigh)}</strong>. Was {h.label}, {q.year} warmer or colder?</p>
          {guessed ? (
            <p>
              {guess.pick === answer || answer === 'same' ? '🎉 You got it! ' : '🤔 Not this time! '}
              In {q.year} it was {deg(q.high)}, {answer === 'same' ? 'exactly the same!' : `${answer} than today.`}{' '}
              <button className="link" onClick={() => { setQuizYear(randomYear(years, q.year)); setGuess(null); }}>Try another year</button>
            </p>
          ) : (
            <div className="tm-guess">
              <button onClick={() => pick('warmer')}>🔥 Warmer</button>
              <button onClick={() => pick('colder')}>❄️ Colder</button>
            </div>
          )}
        </div>
      )}

      <h3>Rocky's record book</h3>
      <ul className="tm-facts">
        {h.kid.facts.map((f) => <li key={f.text}><span aria-hidden>{f.emoji}</span> {f.text}</li>)}
      </ul>
      <SpeakButton text={[h.kid.headline, ...h.kid.facts.map((f) => f.text)].join(' ')} label="Read Rocky's record book" />
    </section>
  );
}

function randomYear(years, not) {
  const pool = years.filter((y) => y.year !== not && y.high != null);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].year : null;
}
