import { useState } from 'react';
import { hourLabel, icon, round } from '../format.js';
import { t } from '../i18n.js';

const COL = 46;
const H = 150;

export default function HourlyTimeline({ hourly, units }) {
  const [sel, setSel] = useState(0);
  if (!hourly?.length) return null;
  const temps = hourly.map((h) => h.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = Math.max(1, max - min);
  const y = (t) => 30 + (1 - (t - min) / span) * 60;
  const width = hourly.length * COL;
  const line = hourly.map((h, i) => `${i ? 'L' : 'M'}${i * COL + COL / 2},${y(h.temp)}`).join(' ');
  const h = hourly[sel];

  return (
    <section className="card hourly">
      <div className="card-title">
        <h2>{t('Next 48 hours')}</h2>
        <div className="hour-detail" aria-live="polite">
          <strong>{hourLabel(h.time)}</strong> {icon(h.icon, h.isDay)} {round(h.temp)}{units.temp} · ☔ {round(h.precipChance)}% · 💨 {round(h.windSpeed)} {units.wind}
        </div>
      </div>
      <div className="hourly-scroll">
        <svg width={width} height={H} role="img" aria-label="Hourly temperature and rain chance">
          {hourly.map((hr, i) => {
            const barH = ((hr.precipChance ?? 0) / 100) * 40;
            return (
              <g key={hr.time} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} className={i === sel ? 'sel' : ''}>
                <rect x={i * COL} y={0} width={COL} height={H} className="hit" />
                {hr.time.endsWith('T00:00') && <line x1={i * COL} x2={i * COL} y1={0} y2={H} className="midnight" />}
                <rect x={i * COL + 10} y={128 - barH} width={COL - 20} height={barH} rx={3} className="bar" />
                <text x={i * COL + COL / 2} y={y(hr.temp) - 8} className="t">{round(hr.temp)}°</text>
                <text x={i * COL + COL / 2} y={146} className="lbl">{hourLabel(hr.time)}</text>
                <text x={i * COL + COL / 2} y={112} className="ico">{icon(hr.icon, hr.isDay)}</text>
              </g>
            );
          })}
          <path d={line} className="line" />
          <circle cx={sel * COL + COL / 2} cy={y(h.temp)} r={5} className="dotsel" />
        </svg>
      </div>
      <input
        type="range" min={0} max={hourly.length - 1} value={sel} onChange={(e) => setSel(Number(e.target.value))}
        aria-label="Scrub through hours" className="scrub"
      />
    </section>
  );
}
