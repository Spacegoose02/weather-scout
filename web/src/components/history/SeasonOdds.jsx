import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const oneIn = (pct) => {
  if (pct == null) return '';
  if (pct >= 95) return 'almost every year';
  if (pct <= 2) return 'hardly ever';
  const n = Math.round(100 / pct);
  return n <= 1 ? 'most years' : `about 1 year in ${n}`;
};
const dayLabel = (date) => new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

function Row({ emoji, title, odds, kidMode, forecastNote, verb }) {
  if (!odds) return null;
  let status = '';
  if (verb === 'passed') status = ''; // more freezes can still come after one in spring
  else if (odds.thisSeason) status = `✅ Already happened this season, on ${odds.thisSeason}.`;
  else if (forecastNote) status = `🔜 The forecast has one ${forecastNote}.`;
  else if (odds.known && odds.byToday != null) status = `Not yet this season. By today it has ${verb} in ${odds.byToday}% of years.`;
  else if (odds.byToday != null) status = `By today it has usually ${verb} in ${odds.byToday}% of years.`;
  return (
    <li className="season-row">
      <span className="season-emoji" aria-hidden>{emoji}</span>
      <div>
        <b>{title}</b>
        {odds.typical
          ? <p>{kidMode ? 'Usually around' : 'Typical date'}: <strong>{odds.typical}</strong>{!kidMode && odds.earliest ? ` (as early as ${odds.earliest}, as late as ${odds.latest})` : ''}.</p>
          : <p>Only {odds.happens}% of seasons get one here ({oneIn(odds.happens)}).</p>}
        {status && <p className="hint">{status}</p>}
      </div>
    </li>
  );
}

// Season odds: the chance of a white Christmas, and when the first freeze, the
// first inch of snow and the last spring freeze usually come, from 30 seasons
// of the record book.
export default function SeasonOdds({ location, units, kidMode, size }) {
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setO(null);
    setErr('');
    api(`/api/history/season?lat=${location.lat}&lon=${location.lon}&units=${units}`).then((r) => live && setO(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [location.lat, location.lon, units]);

  const title = kidMode ? '🎄 Snow & frost odds' : '🎄 Season odds';
  if (!o) return <section className="card dash-season"><h2>{title}</h2><p className="hint">{err || 'Reading the record book…'}</p></section>;
  const w = o.white;
  const nextFreeze = o.forecast?.nextFreeze ? `on ${dayLabel(o.forecast.nextFreeze)}` : '';
  const nextSnow = o.forecast?.nextSnow ? `on ${dayLabel(o.forecast.nextSnow)}` : '';
  return (
    <section className={`card dash-season ${size}`}>
      <div className="card-title"><h2>{title}</h2></div>
      {w && (
        <div className="white-xmas">
          <span className="white-xmas-big">{w.chance}%</span>
          <div>
            <b>{kidMode ? 'Chance of a white Christmas' : 'White Christmas chance'}</b>
            <p className="hint">
              {w.measure === 'depth' ? 'An inch or more of snow on the ground on December 25' : 'Snow falling on Christmas Eve or Day'}: {oneIn(w.chance)}
              {w.lastWhite ? `. Last time: ${w.lastWhite}.` : '.'}
            </p>
            {kidMode && <span className="snowday-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.chance} aria-label="White Christmas chance"><i style={{ width: `${w.chance}%` }} /></span>}
          </div>
        </div>
      )}
      <ul className="season-list">
        <Row emoji="🥶" title={kidMode ? 'First frost of fall' : 'First fall freeze (32°F)'} odds={o.firstFreeze} kidMode={kidMode} forecastNote={!o.firstFreeze?.thisSeason ? nextFreeze : ''} verb="happened" />
        {size !== 's' && <Row emoji="❄️" title={kidMode ? 'First big snow (1 inch)' : 'First 1-inch snowfall'} odds={o.firstSnow} kidMode={kidMode} forecastNote={!o.firstSnow?.thisSeason ? nextSnow : ''} verb="happened" />}
        {size !== 's' && o.lastFreeze && <Row emoji="🌷" title={kidMode ? 'Last frost of spring' : 'Last spring freeze'} odds={o.lastFreeze} kidMode={kidMode} verb="passed" />}
      </ul>
      <p className="source">{o.source}, seasons {o.seasons}.</p>
    </section>
  );
}
