import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const LEVEL_COLOR = ['#3ea66b', '#d9c21a', '#f0a020', '#e8601c', '#d6202f', '#8e1b9a'];
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const dayWord = (date) => (date ? new Date(`${date}T12:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }) : '');

function ScaleTile({ id, s, info, kidMode, forecast }) {
  const level = s?.level ?? 0;
  const ahead = forecast?.map((d) => ({ date: d.date, level: d[id]?.level ?? 0, chance: id === 'R' ? d.R?.minor : id === 'S' ? d.S?.chance : null }));
  return (
    <div className="space-tile">
      <span className="space-scale" style={{ background: LEVEL_COLOR[level] }}>{id}{level}</span>
      <div>
        <b>{info.name}</b> <span className="hint">{info.words[level]}</span>
        <p className="hint small">{kidMode ? info.kid : info.adult}</p>
        {ahead?.length > 0 && (
          <p className="hint small">
            Next days: {ahead.map((d) => `${dayWord(d.date)} ${id === 'G' ? (d.level ? `G${d.level}` : 'quiet') : `${d.chance ?? 0}%`}`).join(' · ')}
            {id !== 'G' && ` (chance of ${id}1+)`}
          </p>
        )}
      </div>
    </div>
  );
}

// Space weather: NOAA's storm scales now and the next 3 days, the latest solar
// flare, the solar wind and Kp. Kid mode explains it as "Sun storms".
export default function SpaceWeather({ kidMode, size }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api('/api/sky/space').then((r) => live && (setS(r), setErr(''))).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const title = kidMode ? '🌞 Sun storms' : '🌞 Space weather';
  if (!s) return <section className="card dash-space"><h2>{title}</h2><p className="hint">{err || 'Checking the Sun…'}</p></section>;
  const now = s.scales?.now;
  const worst = Math.max(now?.R?.level ?? 0, now?.S?.level ?? 0, now?.G?.level ?? 0);
  const f = s.flares;
  const w = s.wind;
  return (
    <section className={`card dash-space ${size} ${worst >= 3 ? 'alarm' : ''}`}>
      <div className="card-title">
        <h2>{title}</h2>
        {now && <span className="space-pills">{['R', 'S', 'G'].map((k) => <span key={k} className="space-scale" style={{ background: LEVEL_COLOR[now[k]?.level ?? 0] }}>{k}{now[k]?.level ?? 0}</span>)}</span>}
      </div>
      <p>{kidMode ? s.kid : s.headline}</p>
      {size !== 's' && (
        <div className="space-facts">
          {s.kp?.now != null && <span><b>Kp {s.kp.now}</b> now{s.kp.peak3d != null && s.kp.peak3d > s.kp.now ? `, up to ${s.kp.peak3d} by ${when(s.kp.peakAt)}` : ''}</span>}
          {f?.latest && <span><b>{f.latest.cls}</b> latest flare, {when(f.latest.peak)}</span>}
          {f?.biggest24h && f.biggest24h !== f.latest && <span><b>{f.biggest24h.cls}</b> biggest in 24 h</span>}
          {f && <span><b>{f.notable7d}</b> M or X flares this week</span>}
          {w?.speed != null && <span><b>{w.speed} km/s</b> solar wind ({w.speedWord})</span>}
          {w?.bz != null && <span><b>Bz {w.bz} nT</b> {w.bzWord}</span>}
        </div>
      )}
      {size === 'l' && s.info && (
        <div className="space-tiles">
          {['R', 'S', 'G'].map((k) => <ScaleTile key={k} id={k} s={now?.[k]} info={s.info[k]} kidMode={kidMode} forecast={s.scales?.forecast} />)}
        </div>
      )}
      {kidMode && size !== 's' && (
        <p className="storm-kid">🦝 Rocky’s Sun fact: light from the Sun takes about 8 minutes to reach us, but a big puff of the Sun (a CME) takes 1 to 3 days. That’s why scientists can warn us ahead of time!</p>
      )}
      <p className="source">From the <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer">NOAA Space Weather Prediction Center</a>. Scales run 1 (minor) to 5 (extreme).</p>
    </section>
  );
}
