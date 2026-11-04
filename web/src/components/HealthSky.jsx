import { useState } from 'react';
import { round, clockLabel, hourLabel, dayLabel } from '../format.js';
import { useWidth } from './NowCards.jsx';
import './health.css';

const LEVEL_DOT = { warning: 'red', watch: 'yellow', calm: 'green', unknown: '' };
const LEVEL_WORD = { warning: 'Big swing', watch: 'Noticeable', calm: 'Steady', unknown: '–' };
const shortDate = (iso) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const signed = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);

// The window [from, to] of the biggest swing, as indexes into the series.
const spanIndex = (series, from, to) => [series.findIndex((h) => h.time === from), series.findIndex((h) => h.time === to)];

export function PressureChart({ pressure, nowTime }) {
  const [hover, setHover] = useState(null);
  const [box, W] = useWidth();
  const s = pressure.series || [];
  if (s.length < 4) return null;
  const H = 150;
  const ps = s.map((h) => h.pressure);
  const lo = Math.floor(Math.min(...ps) - 1);
  const hi = Math.ceil(Math.max(...ps) + 1);
  const L = 40;
  const x = (i) => L + (i / (s.length - 1)) * (W - L - 8);
  const y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 34);
  const path = s.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.pressure).toFixed(1)}`).join('');
  const nowIdx = Math.max(0, s.findIndex((h) => h.time.slice(0, 13) >= (nowTime || '').slice(0, 13)));
  const [a, b] = pressure.level !== 'calm' ? spanIndex(s, pressure.from, pressure.to) : [-1, -1];
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const hv = hover != null ? s[hover] : null;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(s.length - 1, Math.round(((px - L) / (W - L - 8)) * (s.length - 1)))));
  };
  const every = W < 420 ? 12 : 6;
  return (
    <div className="pressure-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Air pressure from yesterday through the next two days" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onMove}>
        {a >= 0 && b > a && <rect x={x(a)} y="6" width={x(b) - x(a)} height={H - 28} className={`swing ${pressure.level}`} />}
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="axis">{t}</text></g>)}
        <rect x={L} y="6" width={Math.max(0, x(nowIdx) - L)} height={H - 28} className="past" />
        {s.map((h, i) => (i % every === 0
          ? <text key={h.time} x={x(i)} y={H - 6} textAnchor="middle" className="axis">{h.time.endsWith('T00:00') ? dayLabel(h.time.slice(0, 10), 1) : hourLabel(h.time)}</text>
          : null))}
        <path d={path} className="series pressure" />
        <line x1={x(nowIdx)} x2={x(nowIdx)} y1="6" y2={H - 22} className="now" />
        <text x={x(nowIdx) + 4} y="18" className="axis now-label">now</text>
        {hv && <><line x1={x(hover)} x2={x(hover)} y1="6" y2={H - 22} className="cross" /><circle cx={x(hover)} cy={y(hv.pressure)} r="4" className="pt" /></>}
      </svg>
      <div className="tile-note" aria-live="polite">
        {hv
          ? <>{dayLabel(hv.time.slice(0, 10), hv.time.slice(0, 10) === (nowTime || '').slice(0, 10) ? 0 : 1)} {hourLabel(hv.time)}: <strong>{hv.pressure.toFixed(1)} hPa</strong></>
          : <>hPa, from yesterday to two days out. {a >= 0 && b > a ? 'The shaded band is the biggest swing.' : ''} Hover or tap the line.</>}
      </div>
    </div>
  );
}

function Meter({ scale, label }) {
  return (
    <div className="dew-meter" aria-hidden title={label}>
      <i style={{ left: `${Math.round(scale * 100)}%` }} />
    </div>
  );
}

export default function HealthSky({ weather }) {
  const { health, moon, forecast } = weather;
  if (!health && !moon) return null;
  const units = forecast.units;
  const p = health?.pressure;
  const heat = health?.heat;
  const dew = health?.dew;
  const today = forecast.daily[0];
  const nowTime = forecast.current.time;
  return (
    <section className="card health" aria-label="Health and sky">
      <div className="card-title"><h2>💓 Health & comfort</h2><span className="hint">For people who feel the weather</span></div>

      {p && (
        <div className="health-block">
          <div className="health-head">
            <div>
              <div className="tile-label">Pressure swings</div>
              <div className="tile-value">
                {LEVEL_DOT[p.level] && <i className={`dot ${LEVEL_DOT[p.level]}`} aria-hidden />} {LEVEL_WORD[p.level]}
              </div>
            </div>
            <div className="pressure-now">
              <b>{p.now != null ? round(p.now) : '–'}</b> hPa
              <div className="tile-note">{signed(p.trend3h)} last 3h · {signed(p.dayChange)} next 24h</div>
            </div>
          </div>
          <p className="tile-note">{p.message}</p>
          <PressureChart pressure={p} nowTime={nowTime} />
          {p.outlook?.length > 0 && (
            <div className="chips" aria-label="Pressure outlook by day">
              {p.outlook.map((d) => (
                <span key={d.date} className={`chip ${LEVEL_DOT[d.level]}`}>
                  {dayLabel(d.date, d.date === nowTime?.slice(0, 10) ? 0 : 1)}: {LEVEL_WORD[d.level]} <small>({signed(d.change)})</small>
                </span>
              ))}
            </div>
          )}
          {p.effects?.length > 0 && (
            <ul className="effects">
              {p.effects.map((e) => (
                <li key={e.id}><i className={`dot ${LEVEL_DOT[e.level]}`} aria-hidden /> <strong>{e.name}:</strong> {e.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="details">
        {dew?.comfort && (
          <div className="tile">
            <div className="tile-label">Dew point</div>
            <div className="tile-value"><i className={`dot ${dew.comfort.color}`} aria-hidden /> {round(dew.now)}{units.temp}</div>
            <Meter scale={dew.comfort.scale} label={dew.comfort.label} />
            <div className="tile-note"><strong>{dew.comfort.label}.</strong> {dew.comfort.advice}</div>
            <div className="tile-note">{dew.trendNote}</div>
          </div>
        )}
        {heat?.now && (
          <div className="tile">
            <div className="tile-label">Heat stress (WBGT)</div>
            <div className="wbgt-pair">
              <div><small>Shade</small><span><i className={`dot ${heat.now.category.color}`} aria-hidden /> {round(heat.now.wbgt)}°</span></div>
              <div><small>Sun</small><span>{heat.sun ? <><i className={`dot ${heat.sun.category.color}`} aria-hidden /> {round(heat.sun.wbgt)}°</> : '–'}</span></div>
            </div>
            <div className="tile-note">{(heat.sun || heat.now).category.label}. {(heat.sun || heat.now).category.advice}</div>
          </div>
        )}
        {heat?.peak && (
          <div className="tile">
            <div className="tile-label">Hottest next 24h</div>
            <div className="tile-value"><i className={`dot ${heat.peak.category.color}`} aria-hidden /> {round(heat.peak.wbgt)}{units.temp}</div>
            <div className="tile-note">{heat.peak.category.label} around {clockLabel(heat.peak.time)}{heat.riskyHours ? `. ${heat.riskyHours} hour${heat.riskyHours === 1 ? '' : 's'} at High or worse.` : ''}</div>
            {heat.best && <div className="tile-note">Coolest daylight hour: <strong>{clockLabel(heat.best.time)}</strong> ({round(heat.best.wbgt)}°)</div>}
          </div>
        )}
        {moon && (
          <div className="tile">
            <div className="tile-label">Moon</div>
            <div className="tile-value"><span aria-hidden>{moon.emoji}</span> {moon.illumination}%</div>
            <div className="tile-note">{moon.name}. Full {shortDate(moon.nextFull)}, new {shortDate(moon.nextNew)}</div>
          </div>
        )}
        {today?.sunrise && (
          <div className="tile">
            <div className="tile-label">Sun</div>
            <div className="tile-value">🌅 {clockLabel(today.sunrise)}</div>
            <div className="tile-note">Sets {clockLabel(today.sunset)}</div>
          </div>
        )}
      </div>
      <p className="hint">Dew point tells you how sticky it feels better than humidity does. {heat?.note} Not medical advice.</p>
    </section>
  );
}
