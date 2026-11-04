import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { round, dayLabel, hourLabel } from '../format.js';
import ModelMap from './ModelMap.jsx';
import Scorecard from './dashboard/Scorecard.jsx';

// Fixed slot per model (color follows the model, never its rank or what's toggled).
const SLOT = {
  ecmwf_ifs025: 1, gfs_seamless: 2, icon_seamless: 3, gem_seamless: 4,
  gfs_hrrr: 5, ncep_aigfs025: 6, ecmwf_aifs025_single: 7,
};
const color = (id) => `var(--series-${SLOT[id] || 8})`;

export default function ModelsView({ location, units }) {
  const [data, setData] = useState(null);
  const [ens, setEns] = useState(null);
  const [ensId, setEnsId] = useState('ecmwf_ifs025');
  const [hidden, setHidden] = useState(() => new Set());
  const [error, setError] = useState('');
  const q = `lat=${location.lat}&lon=${location.lon}&units=${units}`;

  useEffect(() => {
    setData(null);
    api(`/api/models?${q}`).then(setData).catch((e) => setError(e.message));
  }, [q]);
  useEffect(() => {
    setEns(null);
    api(`/api/ensemble?${q}&model=${ensId}`).then(setEns).catch(() => setEns({ failed: true }));
  }, [q, ensId]);

  if (error) return <div className="card error" role="alert">{error}</div>;
  if (!data) return <div className="card skeleton">Asking the weather models…</div>;

  const u = units === 'metric' ? '°C' : '°F';
  const shown = data.models.filter((m) => !hidden.has(m.id));
  const toggle = (id) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ensOk = ens && !ens.failed && ens.daily?.length;

  // Daily highs: one line per model, ensemble 10-90% band behind.
  const days = (ensOk ? ens.daily.map((d) => d.date) : data.models.find((m) => m.daily.length >= 7)?.daily.map((d) => d.date) || []).slice(0, 10);
  const dailySeries = shown.filter((m) => m.daily.length > 2).map((m) => ({
    id: m.id, name: m.name, points: days.map((d) => m.daily.find((x) => x.date === d)?.high ?? null),
  }));
  const dailyBand = ensOk ? days.map((d) => ens.daily.find((x) => x.date === d)?.high || null) : null;

  // Next 72 hours.
  const hours = (ensOk ? ens.hourly.map((h) => h.time) : data.models[0]?.hourly.map((h) => h.time) || []).slice(0, 72);
  const hourlySeries = shown.map((m) => {
    const byTime = new Map(m.hourly.map((h) => [h.time, h.temp]));
    return { id: m.id, name: m.name, points: hours.map((t) => byTime.get(t) ?? null) };
  });
  const hourlyBand = ensOk ? hours.map((t) => ens.hourly.find((h) => h.time === t) || null) : null;

  return (
    <div className="models">
      <section className="card">
        <div className="card-title">
          <h2>What the weather models think</h2>
          <span className="hint">Updated every 30 minutes from Open-Meteo</span>
        </div>
        <p className="hint">
          Forecasts come from computer models run by weather agencies around the world, plus two new AI models.
          When they agree, the forecast is more certain. The shaded band is the {ensOk ? ens.name : 'ensemble'}:
          {ensOk ? ` ${ens.members} slightly different runs of the same model.` : ' many slightly different runs of one model.'} 8 in 10 runs land inside it.
        </p>
        <div className="chips" role="group" aria-label="Show or hide models">
          {data.models.map((m) => (
            <button key={m.id} className={`chip ${hidden.has(m.id) ? 'off' : ''}`} onClick={() => toggle(m.id)} aria-pressed={!hidden.has(m.id)} title={`${m.from}. ${m.note}`}>
              <i style={{ background: color(m.id) }} aria-hidden /> {m.name}{m.ai ? ' 🤖' : ''}
            </button>
          ))}
          <label className="ens-pick">
            Band:{' '}
            <select value={ensId} onChange={(e) => setEnsId(e.target.value)}>
              <option value="ecmwf_ifs025">ECMWF ensemble (51 runs)</option>
              <option value="gfs_seamless">GFS ensemble (31 runs)</option>
            </select>
          </label>
        </div>
        {data.missing.length > 0 && <p className="hint">Not available here: {data.missing.map((m) => m.name).join(', ')}.</p>}
      </section>

      <ModelMap location={location} units={units} />

      <section className="card">
        <h2 className="card-title">Daily highs, next 10 days</h2>
        <LineBandChart
          labels={days.map((d, i) => dayLabel(d, i))}
          series={dailySeries}
          band={dailyBand}
          unit={u}
          height={260}
          ariaLabel="Daily high temperature by model"
        />
        {data.agreement.length > 0 && (
          <div className="agree-row" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d, i) => {
              const a = data.agreement.find((x) => x.date === d);
              const e = ensOk && ens.daily.find((x) => x.date === d);
              return (
                <div key={d} className="agree-cell" title={a?.range != null ? `Models' highs are ${round(a.range)}° apart` : ''}>
                  {(() => { const c = e?.confidence || (a?.label === 'Models agree' ? 'High' : a?.label === 'Models disagree' ? 'Low' : 'Medium'); return <span className={`agree ${confClass(c)}`} aria-label={`${c} confidence`}><span className="long">{c}</span><span className="short">{c[0]}</span></span>; })()}
                  {e?.rainChance != null && <span className="agree-rain"><span className="long">☔ </span>{e.rainChance}%</span>}
                </div>
              );
            })}
          </div>
        )}
        <p className="hint">Bottom row: how sure the forecast is for each day (High, Medium or Low), and the share of ensemble runs that bring rain.</p>
      </section>

      <section className="card">
        <h2 className="card-title">Next 72 hours</h2>
        <LineBandChart
          labels={hours.map((t) => (t.endsWith('T00:00') ? dayLabel(t.slice(0, 10), 1) : hourLabel(t)))}
          series={hourlySeries}
          band={hourlyBand}
          unit={u}
          height={240}
          every={6}
          ariaLabel="Hourly temperature by model"
        />
        <p className="hint">HRRR is the 3 km US model used for storms, so it only goes out 2 days.</p>
      </section>

      <section className="card">
        <h2 className="card-title">Side by side</h2>
        <div className="table-scroll">
          <table className="model-table">
            <thead>
              <tr><th>Day</th>{data.models.filter((m) => m.daily.length > 2).map((m) => <th key={m.id}><i className="key" style={{ background: color(m.id) }} aria-hidden /> {m.name}</th>)}{ensOk && <th>Ensemble range</th>}</tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const e = ensOk && ens.daily.find((x) => x.date === d);
                return (
                  <tr key={d}>
                    <th scope="row">{dayLabel(d, i)}</th>
                    {data.models.filter((m) => m.daily.length > 2).map((m) => {
                      const x = m.daily.find((y) => y.date === d);
                      return <td key={m.id}>{x ? <>{round(x.high)}° / {round(x.low)}°{x.precip >= (units === 'metric' ? 1 : 0.04) && <span className="wet"> ☔</span>}</> : '–'}</td>;
                    })}
                    {ensOk && <td>{e ? `${round(e.high.p10)}–${round(e.high.p90)}°` : '–'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="model-notes">
          {data.models.map((m) => <li key={m.id}><strong>{m.name}</strong>{m.ai ? ' 🤖' : ''}: {m.from}. {m.note}.</li>)}
        </ul>
      </section>

      <Scorecard location={location} units={units} size="l" full />
    </div>
  );
}

function confClass(c) {
  return c === 'High' ? 'hi' : c === 'Low' ? 'lo' : 'mid';
}

// Multi-line chart with an optional percentile band and a hover crosshair.
function LineBandChart({ labels, series, band, unit, height = 240, every = 1, ariaLabel }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const n = labels.length;
  const values = useMemo(() => [
    ...series.flatMap((s) => s.points),
    ...(band || []).flatMap((b) => (b ? [b.p10, b.p90] : [])),
  ].filter((v) => v != null), [series, band]);
  if (!n || !values.length) return <p className="hint">No model data for this place yet.</p>;

  const lo = Math.floor(Math.min(...values) - 2);
  const hi = Math.ceil(Math.max(...values) + 2);
  const x = (i) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (width - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (height - pad.t - pad.b);
  const path = (pts) => {
    let d = '';
    let pen = false;
    pts.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const bandPath = band && (() => {
    const idx = band.map((b, i) => (b && b.p10 != null ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return null;
    const top = idx.map((i) => `${x(i).toFixed(1)},${y(band[i].p90).toFixed(1)}`);
    const bot = idx.slice().reverse().map((i) => `${x(i).toFixed(1)},${y(band[i].p10).toFixed(1)}`);
    return `M${top.join('L')}L${bot.join('L')}Z`;
  })();
  const ticks = [];
  const step = Math.max(1, Math.round((hi - lo) / 5));
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const tip = hover != null && (
    <div className="chart-tip" style={{ left: `${(x(hover) / width) * 100}%` }}>
      <strong>{labels[hover]}</strong>
      {band?.[hover]?.p10 != null && <div className="tip-row"><i className="band-key" /> Band {round(band[hover].p10)}–{round(band[hover].p90)}{unit}</div>}
      {series.filter((s) => s.points[hover] != null).sort((a, b) => b.points[hover] - a.points[hover]).map((s) => (
        <div key={s.id} className="tip-row"><i style={{ background: color(s.id) }} /> {s.name} <b>{round(s.points[hover])}{unit}</b></div>
      ))}
    </div>
  );

  return (
    <div className="lb-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}°</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 ? <text key={i} x={x(i)} y={height - 8} className="axis" textAnchor="middle">{l}</text> : null))}
        {bandPath && <path d={bandPath} className="band" />}
        {band && <path d={path(band.map((b) => b?.p50 ?? null))} className="band-mid" />}
        {series.map((s) => <path key={s.id} d={path(s.points)} className="series" style={{ stroke: color(s.id) }} />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="cross" />}
        {hover != null && series.map((s) => (s.points[hover] != null ? <circle key={s.id} cx={x(hover)} cy={y(s.points[hover])} r={4} className="hover-dot" style={{ fill: color(s.id) }} /> : null))}
      </svg>
      {tip}
    </div>
  );
}
