import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { round } from '../../format.js';
import SpeakButton from '../kid/SpeakButton.jsx';
import './longrange.css';

const AI_KEY = 'weather-scout:outlook-ai';
const readAi = () => {
  try {
    return localStorage.getItem(AI_KEY) === '1';
  } catch {
    return false;
  }
};

export function outlookUrl({ location, units, ai }) {
  const q = new URLSearchParams({ lat: location.lat, lon: location.lon });
  if (units) q.set('units', units);
  if (location.name) q.set('place', location.name.split(',')[0].slice(0, 80));
  if (ai) q.set('ai', 'true');
  return `/api/longrange?${q}`;
}

const short = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
const md = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString([], { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
const longDay = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const SURE = { good: 'Pretty sure', fair: 'Good idea', hint: 'Just a hint' };
const TEMP_EMOJI = (word) => (!word ? '🌡️' : word.includes('warmer') ? '🔥' : word.includes('colder') ? '🥶' : '👌');

/**
 * Rocky's two-week outlook (Models tab): the ensembles' story for this place in
 * plain words, a 15-day strip with how sure each day is, and storms to watch
 * that open on the two-week map.
 */
export default function LongRangeOutlook({ location, units, onShowMap }) {
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [aiReady, setAiReady] = useState(false);
  const [useAi, setUseAi] = useState(readAi);
  const ai = aiReady && useAi;

  useEffect(() => {
    api('/api/ai/status').then((s) => setAiReady(!!s.enabled)).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    setError('');
    api(outlookUrl({ location, units, ai }))
      .then((r) => live && setO(r))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [location.lat, location.lon, units, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAi = (v) => {
    setUseAi(v);
    try {
      localStorage.setItem(AI_KEY, v ? '1' : '0');
    } catch { /* private mode */ }
  };

  const deg = '°';
  return (
    <section className="card longrange" aria-live="polite">
      <div className="card-title">
        <h2>🔭 Rocky&apos;s 2-week outlook</h2>
        <span className="hint">{o ? `From ${o.members.ecmwf} European (ECMWF) and ${o.members.gefs || 'no'} American (GEFS) model runs` : 'Long-range ensembles via Open-Meteo'}</span>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!o && !error && <p className="skeleton">Rocky is reading the long-range maps…</p>}
      {o && (
        <>
          <div className="lr-rocky">
            <img src="/rocky/rocky.webp" alt="Rocky the raccoon" width="88" height="88" />
            <div className="lr-bubble">
              <strong className="lr-headline">{o.rocky.headline}</strong>
              <p>{o.rocky.text}</p>
              <div className="row-actions">
                <SpeakButton text={o.rocky.text} label="Read it to me" />
                {aiReady && (
                  <label className="check">
                    <input type="checkbox" checked={useAi} onChange={(e) => toggleAi(e.target.checked)} />
                    <span>Rocky&apos;s own words</span>
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="lr-weeks">
            {o.weeks.map((w) => (
              <div key={w.id} className="lr-week">
                <div className="lr-week-head">
                  <b>{w.label}</b>
                  <span className="hint">{md(w.from)}–{md(w.to)}</span>
                  <span className={`lr-sure ${w.confidence.id}`} title={w.confidence.kid}>{w.confidence.label}</span>
                </div>
                <div className="lr-week-temp">
                  <span className="lr-emoji" aria-hidden>{TEMP_EMOJI(w.temp)}</span>
                  <span>
                    <b>{w.temp ? w.temp[0].toUpperCase() + w.temp.slice(1) : 'Highs'}</b>
                    <span className="hint"> · highs {w.highLow}{deg}–{w.highHigh}{deg}{w.anomaly != null && ` (${w.anomaly > 0 ? '+' : ''}${round(w.anomaly)}${deg} vs normal)`}</span>
                  </span>
                </div>
                {w.agree != null && (
                  <p className={`lr-agree ${w.agree ? 'yes' : 'no'}`}>
                    {w.agree ? '🤝 European and American models agree' : '🤔 European and American models disagree'}
                  </p>
                )}
                {w.snowiest && <p className="lr-snow">❄️ Some runs bring snow ({w.snowiest.snow}%) on {short(w.snowiest.date)}</p>}
              </div>
            ))}
          </div>

          <DayStrip days={o.days} />

          {o.storms.length > 0 && (
            <div className="lr-storms">
              <h3>⛈️ Storms to watch</h3>
              <ul>
                {o.storms.map((s) => (
                  <li key={s.date}>
                    <div>
                      <b>{longDay(s.date)}</b> <span className={`lr-sure ${s.confidence.id}`}>{s.confidence.label}</span>
                      <div className="hint">
                        {s.wet}% of European runs bring {s.snow >= 30 ? 'snow' : s.snow >= 10 ? 'rain or snow' : 'rain'}
                        {s.gefsWet != null && `, ${s.gefsWet}% of American runs`}
                        {s.low && `. Main European run: a ${s.low.hPa} mb low ${s.low.miles} miles ${s.low.dir} of you`}.
                      </div>
                    </div>
                    {onShowMap && (
                      <button type="button" className="chip" onClick={() => onShowMap(s.low?.time || Date.parse(`${s.date}T18:00:00Z`))}>🗺️ See the map</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="hint lr-foot">
            Each “run” starts from a slightly different guess of today’s weather. When most runs agree, Rocky is surer.
            {o.hasNormals ? ' “Normal” is the 1991–2020 average high for that date.' : ''} Data: ECMWF open data (CC-BY 4.0) and NOAA GEFS, via Open-Meteo.
          </p>
        </>
      )}
    </section>
  );
}

// 15 days in a row: the middle high, the spread of the runs as a bar, the normal as a tick, rain and snow odds.
function DayStrip({ days }) {
  const vals = days.flatMap((d) => [d.high.p10, d.high.p90, d.normal]).filter((v) => v != null);
  const lo = Math.min(...vals) - 2;
  const hi = Math.max(...vals) + 2;
  const y = (v) => `${(1 - (v - lo) / Math.max(1, hi - lo)) * 100}%`;
    return (
    <>
      <div className="lr-strip" role="list" aria-label="Day by day for two weeks">
        {days.map((d, i) => (
          <div key={d.date} className={`lr-day ${d.confidence}`} role="listitem"
            aria-label={`${longDay(d.date)}: high near ${round(d.high.p50)} degrees, ${d.wet}% chance of rain. ${SURE[d.confidence]}.`}>
            <span className="lr-dname">{i === 0 ? 'Today' : short(d.date)}</span>
            <span className="lr-ddate">{md(d.date)}</span>
            <div className="lr-bar">
              <span className="lr-range" style={{ top: y(d.high.p90), bottom: `calc(100% - ${y(d.high.p10)})` }} />
              {d.normal != null && <span className="lr-normal" style={{ top: y(d.normal) }} title={`Normal ${round(d.normal)}°`} />}
              <span className="lr-mid" style={{ top: y(d.high.p50) }} />
            </div>
            <b className="lr-high">{round(d.high.p50)}°</b>
            <span className={`lr-wet ${d.wet >= 60 ? 'likely' : d.wet >= 30 ? 'maybe' : ''}`}>💧{d.wet}%</span>
            <span className="lr-flake">{d.snow >= 10 ? `❄️${d.snow}%` : ' '}</span>
            <i className="lr-conf" aria-hidden />
          </div>
        ))}
      </div>
      <div className="lr-strip-key" aria-hidden>
        <span><i className="k-range" /> 8 in 10 runs</span>
        <span><i className="k-normal" /> normal high</span>
        <span><i className="k-good" /> pretty sure</span>
        <span><i className="k-fair" /> good idea</span>
        <span><i className="k-hint" /> just a hint</span>
      </div>
    </>
  );
}
