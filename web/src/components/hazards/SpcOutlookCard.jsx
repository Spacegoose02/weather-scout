import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ChaseMap from '../kid/chaser/ChaseMap.jsx';
import { OutlookKey } from '../kid/chaser/ChaseDay.jsx';
import { REPORT_COLOR, REPORT_NAME, inConus } from '../../kid/chaser/live.js';
import { CAT_NAME, catLevel, outlookSummary } from '../../../../shared/outlook.js';
import '../../kid/chaser/chaser.css';

const DAYS = [[1, 'Today'], [2, 'Tomorrow'], [3, 'Day 3']];
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

  const outlook = outlooks[day];
  useEffect(() => {
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
  const sum = outlook ? outlookSummary(outlook, covered ? location : null) : null;
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

      {err && !outlook && <p className="hint">The Storm Prediction Center could not be reached right now. {err}</p>}
      {!err && !outlook && <p className="hint">Loading the Storm Prediction Center outlook…</p>}
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

      <ChaseMap outlook={outlook} reports={showReports ? reports : null} home={location} height={HEIGHT[size] || HEIGHT.m} label={`Severe storm outlook map, ${DAYS[day - 1][1].toLowerCase()}`} />
      <OutlookKey />
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
