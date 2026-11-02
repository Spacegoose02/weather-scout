import { useEffect, useState } from 'react';
import Raccoon from './Raccoon.jsx';
import { icon, round, duration, clockLabel } from '../format.js';

const todayKey = () => `weather-scout:checklist:${new Date().toISOString().slice(0, 10)}`;

function useChecklist() {
  const [done, setDone] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(todayKey()) || '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(todayKey(), JSON.stringify(done));
    } catch {
      /* ignore */
    }
  }, [done]);
  const toggle = (id) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  return [done, toggle];
}

function rockySays({ raccoon, playground }, c) {
  if (playground.rating === 'red') return `Uh-oh, inside day! ${playground.reasons[0]}`;
  if (raccoon.items.includes('raincoat')) return 'Splash time! Grab your raincoat and boots.';
  if (raccoon.items.includes('mittens')) return 'It is chilly! Hat and mittens on, please.';
  if (raccoon.items.includes('sunglasses')) return 'So sunny! Sunglasses and sunscreen for me.';
  return `It's ${round(c.temp)} degrees and ${c.kidLabel.toLowerCase()}. Let's go explore!`;
}

export default function KidMode({ weather, name }) {
  const { kid, forecast } = weather;
  const c = forecast.current;
  const [done, toggle] = useChecklist();
  const [open, setOpen] = useState(null);
  const allPacked = kid.checklist.length > 0 && kid.checklist.every((i) => done.includes(i.id));

  return (
    <div className="kid-grid">
      <section className="card kid-hero">
        <Raccoon items={kid.raccoon.items} mood={kid.raccoon.mood} />
        <div>
          <p className="hello">Hi{name ? ` ${name}` : ''}! I'm Rocky.</p>
          <p className="bubble">{rockySays(kid, c)}</p>
          <div className="kid-temp">
            <span className="big-icon" aria-hidden>{icon(c.icon, c.isDay)}</span>
            <span className="temp">{round(c.temp)}°</span>
          </div>
          <p className="kid-feels">Feels like {round(c.feelsLike)}°</p>
        </div>
      </section>

      <section className={`card playground ${kid.playground.rating}`}>
        <h2>Recess check</h2>
        <div className="traffic" aria-hidden>
          <i className={kid.playground.rating === 'red' ? 'on red' : 'red'} />
          <i className={kid.playground.rating === 'yellow' ? 'on yellow' : 'yellow'} />
          <i className={kid.playground.rating === 'green' ? 'on green' : 'green'} />
        </div>
        <p className="pg-label">{kid.playground.emoji} {kid.playground.label}</p>
        <ul>{kid.playground.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>

      <section className="card checklist">
        <h2>Before you go</h2>
        {kid.checklist.length === 0 ? (
          <p>Nothing special today. Just your shoes and a smile! 😊</p>
        ) : (
          <ul>
            {kid.checklist.map((i) => (
              <li key={i.id}>
                <button className={done.includes(i.id) ? 'checked' : ''} onClick={() => toggle(i.id)} aria-pressed={done.includes(i.id)}>
                  <span className="emoji" aria-hidden>{done.includes(i.id) ? '✅' : i.emoji}</span>
                  <span><strong>{i.label}</strong><small>{i.why}</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {allPacked && <p className="yay">🎉 All packed! Great job!</p>}
      </section>

      {kid.sky && (
        <section className="card sky">
          <h2>Sky watch</h2>
          {kid.sky.minutesToSunset > 0 ? (
            <p>🌇 Sunset in <strong>{duration(kid.sky.minutesToSunset)}</strong> at {clockLabel(kid.sky.sunset)}.
              {kid.sky.minutesToSunset <= 60 && ' It is golden hour now. Look how warm the light is!'}</p>
          ) : (
            <p>🌙 The sun set at {clockLabel(kid.sky.sunset)}.</p>
          )}
          {kid.sky.stargazing && <p>{kid.sky.stargazing.good ? '✨' : '☁️'} {kid.sky.stargazing.text}</p>}
        </section>
      )}

      <section className="card lessons">
        <h2>Why is this happening?</h2>
        <ul>
          {kid.lessons.map((l) => (
            <li key={l.id}>
              <button onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
                <span className="emoji" aria-hidden>{l.emoji}</span> {l.title}
              </button>
              {open === l.id && <p>{l.body}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card kid-week">
        <h2>This week</h2>
        <div className="kid-days">
          {forecast.daily.slice(0, 7).map((d, i) => (
            <div key={d.time} className="kid-day">
              <div>{i === 0 ? 'Today' : new Date(`${d.time}T12:00`).toLocaleDateString([], { weekday: 'short' })}</div>
              <div className="big" aria-label={d.kidLabel}>{icon(d.icon)}</div>
              <div><strong>{round(d.high)}°</strong> / {round(d.low)}°</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
