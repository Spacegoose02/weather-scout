import { useState } from 'react';
import { chartScale, tempText } from '../../history/history.js';

// Every past year's high (warm dots) and low (cool dots) for today's date, with
// the normal high and low as dashed lines and today's forecast at the right.
export default function YearsChart({ history: h }) {
  const [hover, setHover] = useState(null);
  const s = chartScale(h.years, h.normal, { width: 640, height: 200, pad: 26 });
  if (!s) return null;
  const t = (v) => tempText(v, h.units);
  const shown = hover && h.years.find((y) => y.year === hover);
  const todayX = s.width - s.pad + 10;

  return (
    <figure className="otd-chart">
      <svg viewBox={`0 0 ${s.width + 20} ${s.height}`} role="img" aria-label={`Highs and lows on ${h.label} for every year since ${s.first}`}
        onPointerLeave={() => setHover(null)}>
        {s.ticks.map((v) => (
          <g key={v}>
            <line x1={s.pad} x2={s.width - s.pad} y1={s.y(v)} y2={s.y(v)} className="grid" />
            <text x={s.pad - 4} y={s.y(v) + 4} textAnchor="end" className="tick">{v}°</text>
          </g>
        ))}
        {[s.first, Math.round((s.first + s.last) / 2), s.last].map((yr) => (
          <text key={yr} x={s.x(yr)} y={s.height - 4} textAnchor="middle" className="tick">{yr}</text>
        ))}
        {h.normal.high != null && <line x1={s.pad} x2={s.width - s.pad} y1={s.y(h.normal.high)} y2={s.y(h.normal.high)} className="normal warm" />}
        {h.normal.low != null && <line x1={s.pad} x2={s.width - s.pad} y1={s.y(h.normal.low)} y2={s.y(h.normal.low)} className="normal cool" />}
        {h.years.map((y) => (
          <g key={y.year} onPointerEnter={() => setHover(y.year)} className={hover === y.year ? 'on' : ''}>
            <rect x={s.x(y.year) - 3} y={s.pad} width={6} height={s.height - s.pad * 2} className="hit" />
            {y.high != null && y.low != null && <line x1={s.x(y.year)} x2={s.x(y.year)} y1={s.y(y.high)} y2={s.y(y.low)} className="span" />}
            {y.high != null && <circle cx={s.x(y.year)} cy={s.y(y.high)} r={2.6} className="dot warm" />}
            {y.low != null && <circle cx={s.x(y.year)} cy={s.y(y.low)} r={2.6} className="dot cool" />}
          </g>
        ))}
        {h.compare?.high != null && <circle cx={todayX} cy={s.y(Math.min(s.hi, h.compare.high))} r={5} className="dot today" />}
        {h.compare?.low != null && <circle cx={todayX} cy={s.y(Math.max(s.lo, h.compare.low))} r={5} className="dot today cool" />}
        {h.compare && <text x={todayX} y={s.pad - 10} textAnchor="middle" className="tick">Today</text>}
      </svg>
      <figcaption className="hint">
        {shown
          ? <><strong>{shown.year}</strong>: high {t(shown.high)}, low {t(shown.low)}{shown.label ? `, ${shown.label.toLowerCase()}` : ''}</>
          : <>Each dot is one year: <span className="warm-ink">●</span> high, <span className="cool-ink">●</span> low. Dashed lines are normal. Point at a year to see it.</>}
      </figcaption>
    </figure>
  );
}
