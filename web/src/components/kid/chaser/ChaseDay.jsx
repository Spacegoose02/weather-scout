import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import RockyFace from '../../RockyFace.jsx';
import SpeakButton from '../SpeakButton.jsx';
import ChaseMap from './ChaseMap.jsx';
import { useChase } from '../../../kid/chaser/useChase.js';
import { dayLabel, timeLabel } from '../../../kid/chaser/live.js';

const RATING = {
  big: { emoji: '🌪️', label: 'Big chase day' },
  chase: { emoji: '⛈️', label: 'Chase day' },
  maybe: { emoji: '🌦️', label: 'Maybe' },
  down: { emoji: '😴', label: 'Down day' },
};

// Rocky reads the Storm Prediction Center's Day 1 outlook in kid words.
export default function ChaseDay({ location, kid, today, go }) {
  const [day, setDay] = useState(null);
  const [outlook, setOutlook] = useState(null);
  const [error, setError] = useState('');
  const [chase, save] = useChase(kid);

  useEffect(() => {
    let live = true;
    setError('');
    const q = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
    api(`/api/chaser/day${q}`).then((d) => live && setDay(d)).catch((e) => live && setError(e.message));
    api('/api/outlook?day=1').then((o) => live && setOutlook(o)).catch(() => {});
    return () => {
      live = false;
    };
  }, [location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading today's chase forecast counts toward the Chase Forecaster badge.
  const read = !!day && (chase.briefDays || []).includes(today);
  useEffect(() => {
    if (day && !read) save((c) => ({ ...c, briefDays: [...(c.briefDays || []), today] }));
  }, [day, read]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <section className="card"><h2>Chase Day</h2><p>Rocky could not reach the Storm Prediction Center right now. {error}</p></section>;
  if (!day) return <section className="card"><h2>Chase Day</h2><p>Rocky is reading the storm forecast… 🗺️</p></section>;

  const r = RATING[day.rating];
  const p = day.probabilities;
  return (
    <>
      <section className={`card chase-day rating-${day.rating}`}>
        <div className="chase-day-head">
          <RockyFace />
          <div>
            <p className="chase-date">{dayLabel(day.day)}</p>
            <h2>{day.headline}</h2>
            <span className={`chase-rating rating-${day.rating}`}><span aria-hidden>{r.emoji}</span> {r.label}{day.level > 0 ? ` · level ${day.level} of 5` : ''}</span>
          </div>
        </div>
        {day.where.length > 0 && <p className="chase-where">📍 Target area: <strong>{day.where.join(', ')}</strong></p>}
        <ul className="chase-why">{day.why.map((w) => <li key={w}>{w}</li>)}</ul>
        <div className="row">
          <SpeakButton text={day.say} label="Hear Rocky's chase forecast" />
          {go && day.picksOpen && <button onClick={() => go('target')}>🎯 Pick your target</button>}
        </div>
        {(p.tornado.max > 0 || p.hail.max > 0 || p.wind.max > 0) && (
          <div className="chase-odds" aria-label="Chances of severe weather within 25 miles of a spot">
            <span><b>🌪️ {p.tornado.max}%</b> tornado{p.tornado.sig ? ' ⚠️' : ''}</span>
            <span><b>🧊 {p.hail.max}%</b> hail{p.hail.sig ? ' ⚠️' : ''}</span>
            <span><b>💨 {p.wind.max}%</b> wind{p.wind.sig ? ' ⚠️' : ''}</span>
          </div>
        )}
      </section>

      <section className="card chase-map-card">
        <h2>Today's storm map</h2>
        <p className="hint">Colors show where the Storm Prediction Center thinks storms could get strong. Darker colors mean a bigger chance.</p>
        <ChaseMap outlook={outlook} home={location} height={300} label="Today's severe storm outlook map" />
        <OutlookKey />
      </section>

      {day.ingredients.length > 0 && (
        <section className="card chase-recipe">
          <h2>Rocky's storm recipe</h2>
          <p className="hint">The forecasters wrote about these storm ingredients today:</p>
          <ul>
            {day.ingredients.map((i) => (
              <li key={i.id}><span className="emoji" aria-hidden>{i.emoji}</span><span><strong>{i.name}</strong><small>{i.kid}</small></span></li>
            ))}
          </ul>
        </section>
      )}

      {day.home && (
        <section className={`card chase-home level-${Math.min(day.home.level, 2)}`}>
          <h2>🏠 At your house</h2>
          <p>{day.home.text}</p>
          {day.tomorrow && <p className="hint">{day.tomorrow.text}</p>}
        </section>
      )}

      {day.summary && (
        <section className="card chase-grownup">
          <details>
            <summary>What the forecasters wrote (grown-up words)</summary>
            <p>{day.summary}</p>
            <p className="hint small">From the {day.source} Day 1 outlook. Picks for the target game close at {timeLabel(day.picksCloseAt)}.</p>
          </details>
        </section>
      )}
    </>
  );
}

const KEY = [
  ['TSTM', '#c1e9c1', 'Thunder'], ['MRGL', '#66a366', '1'], ['SLGT', '#ffe066', '2'],
  ['ENH', '#ffa366', '3'], ['MDT', '#e06666', '4'], ['HIGH', '#ee99ee', '5'],
];
export function OutlookKey() {
  return (
    <div className="outlook-key" aria-hidden>
      {KEY.map(([id, color, label]) => <span key={id}><i style={{ background: color }} />{label}</span>)}
    </div>
  );
}
