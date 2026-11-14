import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ChaseMap from '../kid/chaser/ChaseMap.jsx';
import { OutlookKey } from '../kid/chaser/ChaseDay.jsx';
import { REPORT_COLOR, REPORT_NAME, inConus } from '../../kid/chaser/live.js';
import { CAT_NAME, catLevel, outlookSummary } from '../../../../shared/outlook.js';
import '../../kid/chaser/chaser.css';

const DAYS = [[1, 'Today'], [2, 'Tomorrow'], [3, 'Day 3'], ['week', 'Week']];
const EXT_KEY = [['15%', '#ffeb80'], ['30%', '#ff9a7a']];
const SEV_COLOR = ['transparent', '#4daa4d', '#f5d327', '#f39020', '#e0312b', '#c42fc4'];
const dayShort = (date, i) => (i === 0 ? 'Today' : i === 1 ? 'Tmrw' : new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }));
const dayLong = (date) => new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

// One day in the storm week strip: the highest risk anywhere, and at home.
function WeekDay({ d, i, active, onPick }) {
  const cat = d.kind === 'category';
  const lvl = cat ? d.topLevel || 0 : d.top >= 30 ? 4 : d.top >= 15 ? 2 : 0;
  const word = !d.available ? '–' : cat ? (d.topLevel ? `${d.topLevel}/5` : d.top === 'TSTM' ? 'T-storms' : 'Quiet') : d.top ? `${d.top}%` : 'Quiet';
  const here = d.here == null ? null : cat ? (d.hereLevel ? `${d.hereLevel}/5 here` : '') : d.here ? `${d.here}% here` : '';
  return (
    <li>
      <button type="button" className={`week-day ${active ? 'active' : ''}`} onClick={() => onPick(d)} aria-pressed={active} style={{ '--lvl': SEV_COLOR[lvl] }}>
        <span className="week-name">{dayShort(d.date, i)}</span>
        <b>{word}</b>
        {here && <span className="week-here">🏠 {here}</span>}
      </button>
    </li>
  );
}
const HEIGHT = { s: 220, m: 300, l: 400 };
const riskText = (label) => (label === 'NONE' ? CAT_NAME.NONE : catLevel(label) ? `${CAT_NAME[label]} (${catLevel(label)} of 5)` : CAT_NAME[label]);

// Severe storm outlook: the Storm Prediction Center's Day 1–3 map for the
// lower 48, the same map Junior Storm Chaser uses, in grown-up words, with
// the risk at your place, the tornado/hail/wind odds and today's storm reports.
export default function SpcOutlookCard({ location, kidMode, size }) {
  const [day, setDay] = useState(1);
  const [outlooks, setOutlooks] = useState({});
  const [chase, setChase] = useState(null);
  const [reports, setReports] = useState(null);
  const [err, setErr] = useState('');

  const [week, setWeek] = useState(null);
  const [extDay, setExtDay] = useState(4);
  const isWeek = day === 'week';
  const outlook = isWeek ? outlooks[`x${extDay}`] : outlooks[day];
  useEffect(() => {
    if (!isWeek) return undefined;
    let live = true;
    const q = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
    api(`/api/outlook/week${q}`).then((w) => live && (setWeek(w), setErr(''))).catch((e) => live && setErr(e.message));
    api(`/api/outlook/extended?day=${extDay}`).then((o) => live && setOutlooks((m) => ({ ...m, [`x${extDay}`]: o }))).catch(() => {});
    return () => { live = false; };
  }, [isWeek, extDay, location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (day === 'week') return undefined;
    let live = true;
    const load = () => api(`/api/outlook?day=${day}`)
      .then((o) => live && (setOutlooks((m) => ({ ...m, [day]: o })), setErr('')))
      .catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 15 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [day]);

  // Day 1 extras: the odds, where the storms should be, the forecasters' words, and reports so far.
  useEffect(() => {
    let live = true;
    const q = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
    const load = () => api(`/api/chaser/day${q}`).then((d) => {
      if (!live) return;
      setChase(d);
      api(`/api/chaser/reports?day=${d.day}`).then((r) => live && setReports(r.reports)).catch(() => {});
    }).catch(() => {});
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const covered = location && inConus(location.lat, location.lon);
  const sum = outlook && !isWeek ? outlookSummary(outlook, covered ? location : null) : null;
  const watchDay = week?.days?.find((d) => d.day === week.watch);
  const where = day === 1 && chase?.where?.length ? ` around ${chase.where.join(', ')}` : '';
  const p = day === 1 ? chase?.probabilities : null;
  const alarm = sum && catLevel(sum.here) >= 2;
  const showReports = day === 1 && reports?.length > 0;

  return (
    <section className={`card dash-spc ${size} ${alarm ? 'alarm' : ''}`}>
      <div className="card-title">
        <h2>⛈️ {kidMode ? 'Storm map' : 'Severe storm outlook'}</h2>
        <div className="seg" role="group" aria-label="Outlook day">
          {DAYS.map(([d, label]) => (
            <button key={d} className={`small ${day === d ? 'active' : 'ghost'}`} aria-pressed={day === d} onClick={() => setDay(d)}>{label}</button>
          ))}
        </div>
      </div>

      {isWeek && (
        <div className="spc-week">
          {week ? (
            <>
              <p>{watchDay
                ? <>Day to watch: <strong>{watchDay.day === 1 ? 'today' : watchDay.day === 2 ? 'tomorrow' : dayLong(watchDay.date)}</strong>{watchDay.states?.length ? ` around ${watchDay.states.join(', ')}` : ''}.</>
                : 'No organized severe weather in the 8-day outlook right now.'}</p>
              <ol className="week-strip" aria-label="Severe storm risk for the next 8 days">
                {week.days.map((d, i) => <WeekDay key={d.day} d={d} i={i} active={d.day === extDay} onPick={(x) => (x.day <= 3 ? setDay(x.day) : setExtDay(x.day))} />)}
              </ol>
              <p className="hint small">Days 1 to 3 show the risk level (1 to 5). Days 4 to 8 show where the chance of severe storms reaches 15% or 30%; the map shows {dayLong(week.days[extDay - 1].date)}.</p>
            </>
          ) : <p className="hint">{err || 'Loading the 8-day outlook…'}</p>}
        </div>
      )}
      {err && !outlook && !isWeek && <p className="hint">The Storm Prediction Center could not be reached right now. {err}</p>}
      {!err && !outlook && !isWeek && <p className="hint">Loading the Storm Prediction Center outlook…</p>}
      {sum && (
        <div className="spc-risk">
          {covered && <p className={`spc-here lvl${catLevel(sum.here)}`}>At your place: <strong>{riskText(sum.here)}</strong>{day === 1 && chase?.home?.tornado > 0 ? ` · ${chase.home.tornado}% tornado chance` : ''}</p>}
          {!covered && location && <p className="hint">Outlooks cover the lower 48 states only.</p>}
          <p className="hint">Highest risk: {riskText(sum.top)}{catLevel(sum.top) >= 1 ? where : ''}.</p>
        </div>
      )}
      {p && size !== 's' && (p.tornado.max > 0 || p.hail.max > 0 || p.wind.max > 0) && (
        <div className="chase-odds" aria-label="Highest chance of severe weather within 25 miles of a point">
          <span><b>🌪️ {p.tornado.max}%</b> tornado{p.tornado.sig ? ' (significant)' : ''}</span>
          <span><b>🧊 {p.hail.max}%</b> hail{p.hail.sig ? ' (2"+ possible)' : ''}</span>
          <span><b>💨 {p.wind.max}%</b> wind{p.wind.sig ? ' (75 mph+ possible)' : ''}</span>
        </div>
      )}

      <ChaseMap outlook={outlook} reports={showReports ? reports : null} home={location} height={HEIGHT[size] || HEIGHT.m} label={isWeek ? `Severe storm outlook map, day ${extDay}` : `Severe storm outlook map, ${DAYS[day - 1][1].toLowerCase()}`} />
      {isWeek ? <div className="outlook-key" aria-hidden>{EXT_KEY.map(([l, c]) => <span key={l}><i style={{ background: c }} />{l} chance of severe storms</span>)}</div> : <OutlookKey />}
      {showReports && (
        <div className="report-key" aria-hidden>
          {Object.entries(REPORT_COLOR).map(([k, c]) => <span key={k}><i style={{ background: c }} />{REPORT_NAME[k]} ({reports.filter((r) => r.type === k).length})</span>)}
        </div>
      )}

      {day === 1 && chase?.summary && size !== 's' && (
        <details className="spc-summary">
          <summary>What the forecasters wrote</summary>
          <p>{chase.summary}</p>
        </details>
      )}
      <p className="hint small">
        From the <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noopener noreferrer">NOAA Storm Prediction Center</a>. Levels run 1 (marginal) to 5 (high).
      </p>
    </section>
  );
}
