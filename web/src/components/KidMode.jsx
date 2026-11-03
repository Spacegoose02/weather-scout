import { useEffect, useState } from 'react';
import Raccoon from './Raccoon.jsx';
import RockyFace from './RockyFace.jsx';
import { icon, round, duration, clockLabel } from '../format.js';
import { useKidData } from '../kid/useKidData.js';
import { SHELF_EVENT, takeShelfRequest } from '../kid/badges.js';
import DailyFact from './kid/DailyFact.jsx';
import StormSafe from './kid/StormSafe.jsx';
import Bingo from './kid/Bingo.jsx';
import WhatToWear from './kid/WhatToWear.jsx';
import Forecaster from './kid/Forecaster.jsx';
import FieldTrips from './kid/FieldTrips.jsx';
import Experiments from './kid/Experiments.jsx';
import Seasons from './kid/Seasons.jsx';
import TimeMachine from './kid/TimeMachine.jsx';
import Badges from './kid/Badges.jsx';
import ThunderCounter from './kid/ThunderCounter.jsx';
import SpeakButton from './kid/SpeakButton.jsx';
import Briefing from './kid/Briefing.jsx';
import VoicePicker from './VoicePicker.jsx';
import '../kid/kid.css';
import { openSafety } from '../safety/useSafetyPlan.js';

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

export function rockySays({ raccoon, playground, stormSafe }, c) {
  if (stormSafe?.active) return 'Grown-ups are keeping watch. Let\'s follow our storm steps together.';
  if (playground.rating === 'red') return `Uh-oh, inside day! ${playground.reasons[0]}`;
  if (raccoon.items.includes('raincoat')) return 'Splash time! Grab your raincoat and boots.';
  if (raccoon.items.includes('mittens')) return 'It is chilly! Hat and mittens on, please.';
  if (raccoon.items.includes('sunglasses')) return 'So sunny! Sunglasses and sunscreen for me.';
  return `It's ${round(c.temp)} degrees and ${c.kidLabel.toLowerCase()}. Let's go explore!`;
}

const KID_TABS = [
  ['today', 'Today', <RockyFace key="rocky" />],
  ['play', 'Play', '🎲'],
  ['explore', 'Explore', '🔭'],
  ['badges', 'Badges', '🏅'],
];

export default function KidMode({ weather, user, location, voice, onAlerts }) {
  const today = weather.kid.date;
  const kidData = useKidData(user, today);
  const [tab, setTab] = useState(() => (takeShelfRequest() ? 'badges' : 'today'));
  useEffect(() => {
    const open = () => {
      takeShelfRequest();
      setTab('badges');
    };
    window.addEventListener(SHELF_EVENT, open);
    return () => window.removeEventListener(SHELF_EVENT, open);
  }, []);
  const [drill, setDrill] = useState(false);
  const storm = weather.kid.stormSafe;
  const badgeCount = Object.keys(kidData.data.badges || {}).length;

  return (
    <div className="kid-zone">
      {storm?.active && <StormSafe plans={storm.plans} reassure={storm.reassure} kid={kidData} />}
      {drill && !storm?.active && (
        <StormSafe
          plans={[storm.drill]}
          kid={kidData}
          drill
          onDone={() => {
            setDrill(false);
            kidData.earn('storm-ready');
          }}
        />
      )}

      <nav className="kid-tabs" aria-label="Kid Zone">
        {KID_TABS.map(([id, label, emoji]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
            <span aria-hidden>{emoji}</span> {label}{id === 'badges' && badgeCount > 0 ? ` (${badgeCount})` : ''}
          </button>
        ))}
      </nav>

      {tab === 'today' && <KidToday weather={weather} name={user?.displayName} kid={kidData} today={today} voice={voice} location={location} onAlerts={onAlerts} />}
      {tab === 'play' && (
        <div className="kid-grid">
          <WhatToWear raccoon={weather.kid.raccoon} kid={kidData} />
          <Bingo card={weather.kid.bingo} kid={kidData} />
          <Forecaster weather={weather} kid={kidData} today={today} />
        </div>
      )}
      {tab === 'explore' && (
        <div className="kid-grid">
          <FieldTrips location={location} units={weather.location.units} kid={kidData} today={today} />
          <Experiments weather={weather} kid={kidData} today={today} />
          <Seasons user={user} weather={weather} kid={kidData} today={today} />
          <TimeMachine location={location} units={weather.location.units} kid={kidData} today={today} />
          <ThunderCounter />
          {!storm?.active && !drill && (
            <section className="card drill-card">
              <h2>Storm drill</h2>
              <p>Practice what to do in a big storm, with a grown-up. Then you will know just what to do!</p>
              <button onClick={() => { setDrill(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Start a practice drill 🛡️</button>{' '}
              <button className="ghost" onClick={() => openSafety('plan')}>Our family plan 🏠</button>
            </section>
          )}
        </div>
      )}
      {tab === 'badges' && <div className="kid-grid"><Badges kid={kidData} /></div>}

    </div>
  );
}

function KidToday({ weather, name, kid: kidData, today, voice, location, onAlerts }) {
  const { kid, forecast } = weather;
  const c = forecast.current;
  const [done, toggle] = useChecklist();
  const [open, setOpen] = useState(null);
  const allPacked = kid.checklist.length > 0 && kid.checklist.every((i) => done.includes(i.id));
  const said = rockySays(kid, c);

  return (
    <div className="kid-grid">
      <section className="card kid-hero">
        <Raccoon items={kid.raccoon.items} mood={kid.raccoon.mood} />
        <div>
          <p className="hello">Hi{name ? ` ${name}` : ''}! I'm Rocky.</p>
          <p className="bubble">{said}</p>
          <SpeakButton text={`${said} It's ${round(c.temp)} degrees, and it feels like ${round(c.feelsLike)}.`} label="Hear Rocky" />
          {voice && <div><VoicePicker {...voice} /></div>}
          <div className="kid-temp">
            <span className="big-icon" aria-hidden>{icon(c.icon, c.isDay)}</span>
            <span className="temp">{round(c.temp)}°</span>
          </div>
          <p className="kid-feels">Feels like {round(c.feelsLike)}°</p>
        </div>
      </section>

      {location && <Briefing location={location} units={weather.location.units} name={name} onAlerts={onAlerts} />}

      <DailyFact fact={kid.fact} today={today} kid={kidData} />

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
          {kid.sky.moon && <MoonWatch moon={kid.sky.moon} />}
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

function MoonWatch({ moon }) {
  const [why, setWhy] = useState(false);
  const full = moon.phase === 'full' ? 'Tonight is the full Moon!'
    : moon.daysToFull <= 1 ? 'Full Moon tomorrow!'
    : `Full Moon in ${moon.daysToFull} days.`;
  return (
    <div className="moon-watch">
      <span className="moon-emoji" aria-hidden>{moon.emoji}</span>
      <div>
        <p><strong>{moon.name}</strong>, {moon.illumination}% lit. {full}</p>
        <p className="moon-kid">{moon.kid}</p>
        <button className="link" onClick={() => setWhy(!why)} aria-expanded={why}>Why does the Moon change shape?</button>
        {why && (
          <p className="moon-why">
            The Sun always lights half of the Moon. As the Moon travels around Earth (about 29 and a half days),
            we see different amounts of that sunny half. Rocky likes to say: the Moon isn't changing, we're just
            peeking at it from a new spot!
          </p>
        )}
      </div>
    </div>
  );
}
