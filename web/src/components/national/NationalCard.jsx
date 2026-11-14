import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ChaseMap from '../kid/chaser/ChaseMap.jsx';
import { OutlookKey } from '../kid/chaser/ChaseDay.jsx';
import { REPORT_COLOR, REPORT_NAME } from '../../kid/chaser/live.js';
import '../../kid/chaser/chaser.css';

const SEVERE_COLOR = ['#9bd39b', '#4daa4d', '#f5d327', '#f39020', '#e0312b', '#c42fc4'];
const FLOOD_COLOR = ['#9bd39b', '#4daa4d', '#f5d327', '#e0312b', '#c42fc4'];
const until = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function RiskBox({ title, sum, colors, max, here }) {
  if (!sum) return <div className="nat-risk"><span className="winter-label">{title}</span><p className="hint">Not available right now.</p></div>;
  const lvl = sum.topLevel || 0;
  return (
    <div className="nat-risk" style={{ '--lvl': colors[lvl] }}>
      <span className="winter-label">{title}</span>
      <b className="nat-level">{lvl ? `Level ${lvl} of ${max}` : 'No risk'}</b>
      {sum.levels.slice(0, 2).map((l) => <p key={l.level} className="hint small"><i className="dot" style={{ background: colors[l.level] }} />{l.name}: {l.states.join(', ') || 'small area'}</p>)}
      {here && sum.hereLevel != null && <p className="hint small">At your place: {sum.hereLevel ? `level ${sum.hereLevel}` : 'none'}</p>}
    </div>
  );
}

// Across the US: severe storm and flash flood risk today and tomorrow, every
// active warning ranked by danger, and the day's biggest storm reports.
export default function NationalCard({ location, kidMode, size }) {
  const [n, setN] = useState(null);
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    const q = location ? `?lat=${location.lat}&lon=${location.lon}` : '';
    const load = () => api(`/api/national${q}`).then((r) => live && (setN(r), setErr(''))).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 3 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location?.lat, location?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = kidMode ? '🇺🇸 Weather across the country' : '🇺🇸 Across the US';
  if (!n) return <section className="card dash-national"><h2>{title}</h2><p className="hint">{err || 'Checking the whole country…'}</p></section>;
  const w = n.warnings;
  const list = w ? (all ? w.top : w.top.slice(0, size === 'l' ? 8 : 5)) : [];
  const wide = size === 'l';
  return (
    <section className={`card dash-national ${size}`}>
      <div className="card-title">
        <h2>{title}</h2>
        {w && <span className="nat-count">{w.total} warning{w.total === 1 ? '' : 's'} now</span>}
      </div>

      <div className="nat-risks">
        <RiskBox title="Severe storms today" sum={n.severe.today} colors={SEVERE_COLOR} max={5} here={!!location} />
        <RiskBox title="Severe storms tomorrow" sum={n.severe.tomorrow} colors={SEVERE_COLOR} max={5} here={!!location} />
        <RiskBox title="Flash floods today" sum={n.flood.today} colors={FLOOD_COLOR} max={4} here={!!location} />
        <RiskBox title="Flash floods tomorrow" sum={n.flood.tomorrow} colors={FLOOD_COLOR} max={4} here={!!location} />
      </div>

      <div className={wide ? 'nat-cols' : ''}>
        <div>
          <h3 className="nat-h">⚠️ {kidMode ? 'Warnings right now' : 'Warning center'}</h3>
          {!w && <p className="hint">The National Weather Service could not be reached.</p>}
          {w && !w.total && <p className="hint">✅ No warnings anywhere in the country right now.</p>}
          {w?.kinds?.length > 0 && <p className="nat-kinds">{w.kinds.slice(0, 6).map((k) => <span key={k.event}><i className="dot" style={{ background: k.color }} />{k.count} {k.event}{k.count === 1 ? '' : 's'}</span>)}</p>}
          {list.length > 0 && (
            <ol className="nat-warnings">
              {list.map((x) => (
                <li key={x.id} className={x.emergency ? 'emergency' : ''} style={{ '--c': x.color }}>
                  <b>{x.emergency ? '🚨 ' : ''}{x.event}</b> <span className="hint">{x.states.join(', ')}{x.ends ? ` · until ${until(x.ends)}` : ''}</span>
                  {!kidMode && <span className="hint small nat-area">{x.area}</span>}
                </li>
              ))}
            </ol>
          )}
          {w && w.top.length > list.length && <button type="button" className="link" onClick={() => setAll(true)}>Show all {w.top.length}</button>}
        </div>
        <div>
          <h3 className="nat-h">🏆 {kidMode ? "Today's biggest storms" : 'Top storm reports today'}</h3>
          {!n.reports && <p className="hint">Storm reports are not available right now.</p>}
          {n.reports && !n.reports.top.length && <p className="hint">No tornado, hail or wind reports yet today.</p>}
          {n.reports?.top.length > 0 && (
            <>
              <p className="nat-kinds">{Object.entries(n.reports.counts).map(([k, c]) => <span key={k}><i className="dot" style={{ background: REPORT_COLOR[k] }} />{c} {REPORT_NAME[k].toLowerCase()}</span>)}</p>
              <ol className="nat-reports">
                {n.reports.top.slice(0, wide ? 10 : 5).map((r) => <li key={r.id}><span aria-hidden>{r.emoji}</span> <b>{r.stat}</b> <span className="hint">{r.place} · {clock(r.time)}</span></li>)}
              </ol>
            </>
          )}
        </div>
      </div>

      {size !== 's' && n.outlook && (
        <>
          <ChaseMap outlook={n.outlook} reports={n.reportPoints} height={wide ? 360 : 260} label="Today's severe storm outlook and storm reports across the US" fit={false} />
          <OutlookKey />
        </>
      )}
      <p className="source">NOAA Storm Prediction Center (outlooks, reports), Weather Prediction Center (flash flood risk) and the National Weather Service (warnings). Updated {clock(n.checkedAt)}.</p>
    </section>
  );
}
