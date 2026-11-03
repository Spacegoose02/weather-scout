import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import ChaseMap from './ChaseMap.jsx';
import { OutlookKey } from './ChaseDay.jsx';
import { STATES } from '../../../../../shared/chase-states.js';
import { useChase } from '../../../kid/chaser/useChase.js';
import {
  REPORT_COLOR, REPORT_NAME, dayLabel, milesBetween, pointsWord, rankFor, setResult, setTarget, targetFor, timeLabel, totals,
} from '../../../kid/chaser/live.js';

const near = (lat, lon) => {
  let best = STATES[0];
  for (const s of STATES) if (milesBetween({ lat, lon }, s) < milesBetween({ lat, lon }, best)) best = s;
  return best.name;
};

// Pick where storms will fire today, then see how close the real storm reports came.
export default function TargetGame({ location, kid, go }) {
  const [day, setDay] = useState(null);
  const [outlook, setOutlook] = useState(null);
  const [reports, setReports] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [chase, save] = useChase(kid);

  useEffect(() => {
    let live = true;
    const q = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
    api(`/api/chaser/day${q}`).then((d) => live && setDay(d)).catch((e) => live && setError(e.message));
    api('/api/outlook?day=1').then((o) => live && setOutlook(o)).catch(() => {});
    return () => {
      live = false;
    };
  }, [location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Today's storm reports, refreshed while the storms are going.
  useEffect(() => {
    if (!day) return undefined;
    let live = true;
    const load = () => api(`/api/chaser/reports?day=${day.day}`).then((r) => live && setReports(r.reports)).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [day?.day]); // eslint-disable-line react-hooks/exhaustive-deps

  // Score every target that isn't final yet (today's keeps updating as reports come in).
  const open = (chase.targets || []).filter((t) => !t.result?.final && (!day || t.day <= day.day));
  const openKey = open.map((t) => `${t.day}:${t.lat},${t.lon}`).join('|') + (reports ? `#${reports.length}` : '');
  useEffect(() => {
    let live = true;
    for (const t of open.slice(-6)) {
      api(`/api/chaser/score?day=${t.day}&lat=${t.lat}&lon=${t.lon}`)
        .then((r) => live && save((c) => setResult(c, t.day, r)))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [openKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <section className="card"><h2>Pick your target</h2><p>The storm map is not answering right now. {error}</p></section>;
  if (!day) return <section className="card"><h2>Pick your target</h2><p>Unfolding the storm map… 🗺️</p></section>;

  const mine = targetFor(chase, day.day);
  const shown = pending || mine;
  const lock = () => {
    if (!pending) return;
    save((c) => setTarget(c, { day: day.day, ...pending }));
    setPending(null);
  };
  const pickState = (abbr) => {
    const s = STATES.find((x) => x.abbr === abbr);
    if (s) setPending({ lat: s.lat, lon: s.lon });
  };
  const t = totals(chase);
  const rank = rankFor(t.points);
  const past = (chase.targets || []).filter((x) => x.day !== day.day).slice(-8).reverse();

  return (
    <>
      <section className="card target-game">
        <h2>🎯 Pick your target <span className="points">{t.points} pts</span></h2>
        <p className="chase-rank"><span aria-hidden>{rank.emoji}</span> <strong>{rank.name}</strong>
          {rank.next && <small> · {rank.next.at - t.points} points to {rank.next.emoji} {rank.next.name}</small>}</p>
        {day.picksOpen ? (
          <p className="hint">Real chasers pick a <em>target</em> each morning: the spot where they think storms will start. Look at the colors, then tap the map where you would go. Picks close at {timeLabel(day.picksCloseAt)}.</p>
        ) : (
          <p className="hint">Picks are closed for today (they close at {timeLabel(day.picksCloseAt)}, before storms usually start). {mine ? 'Watch the storm reports roll in!' : 'Come back tomorrow morning to make your pick.'}</p>
        )}
        <ChaseMap
          outlook={outlook}
          reports={reports}
          target={shown}
          home={location}
          onPick={day.picksOpen ? (ll) => setPending(ll) : null}
          height={380}
          label="Storm map. Tap to pick your target."
        />
        <OutlookKey />
        <div className="report-key" aria-hidden>
          {Object.entries(REPORT_COLOR).map(([k, c]) => <span key={k}><i style={{ background: c }} />{REPORT_NAME[k]}</span>)}
          <span>🎯 your target (dashed ring: 50 miles)</span>
        </div>
        {day.picksOpen && (
          <div className="row">
            <label className="state-pick">Or pick a state:{' '}
              <select value="" onChange={(e) => pickState(e.target.value)}>
                <option value="">Choose…</option>
                {STATES.map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
              </select>
            </label>
            {pending && <button onClick={lock}>🔒 Lock in {near(pending.lat, pending.lon)}</button>}
            {pending && <button className="ghost" onClick={() => setPending(null)}>Cancel</button>}
          </div>
        )}
        {mine && !pending && <TargetResult target={mine} home={location} live={!mine.result?.final} />}
        {!day.picksOpen && !mine && go && <p><button className="ghost" onClick={() => go('chase-day')}>See today's Chase Day forecast</button></p>}
      </section>

      {past.length > 0 && (
        <section className="card target-history">
          <h2>My chase log</h2>
          <ul>
            {past.map((x) => (
              <li key={x.day}>
                <strong>{dayLabel(x.day)}</strong>: near {near(x.lat, x.lon)}.{' '}
                {x.result ? (x.result.reports ? <>{x.result.miles} miles from a {REPORT_NAME[x.result.nearest.type].toLowerCase()} report, <b>{x.result.points} pts</b></> : 'No storms reported anywhere that day.') : 'Scoring…'}
              </li>
            ))}
          </ul>
          <p className="hint small">Best ever: {t.best != null ? `${t.best} miles from a storm` : 'not yet'} · {t.played} chase days played</p>
        </section>
      )}
    </>
  );
}

function TargetResult({ target, live }) {
  const r = target.result;
  return (
    <div className="target-result">
      <p><strong>Your target:</strong> near {near(target.lat, target.lon)}.</p>
      {!r && <p>Checking the storm reports…</p>}
      {r && !r.reports && <p>No storm reports yet today. Storms usually start in the afternoon and evening. Check back later!</p>}
      {r && r.reports > 0 && (
        <>
          <p className="target-score"><b>{r.points} points</b> {pointsWord(r)}</p>
          <p>The closest report was <strong>{REPORT_NAME[r.nearest.type].toLowerCase()}</strong> near {r.nearest.location}, {r.nearest.state} at {timeLabel(r.nearest.time)}: <strong>{r.miles} miles</strong> {r.nearest.direction} of your target.
            {r.within50 > 0 && ` ${r.within50} storm report${r.within50 === 1 ? '' : 's'} landed within 50 miles!`}</p>
          {live && <p className="hint small">Storm reports keep coming in until morning, so your score can still change.</p>}
        </>
      )}
    </div>
  );
}
