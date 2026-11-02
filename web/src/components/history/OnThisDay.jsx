import { useState } from 'react';
import { icon } from '../../format.js';
import { useHistory } from '../../history/useHistory.js';
import { tempText, amountText, diffText, rankText, recordText, highlightYears } from '../../history/history.js';
import YearsChart from './YearsChart.jsx';
import '../../history/history.css';

// The "On this day" dashboard card: how today compares with normal and the
// records, notable past years, and (when wide or opened) every year since 1940.
export default function OnThisDay({ location, units, kidMode, size = 'm', onKids }) {
  const { data: h, error } = useHistory(location, units);
  const [all, setAll] = useState(false);
  const title = <h2>📜 On this day{h ? `, ${h.label}` : ''}</h2>;

  if (error) return <section className="card otd">{title}<p className="hint">{error}</p></section>;
  if (!h) return <section className="card otd">{title}<p className="hint">Digging through 85 years of weather…</p></section>;

  const u = h.units;
  const t = (v) => tempText(v, u);
  const c = h.compare;
  const r = h.records;
  const n = h.normal;

  if (kidMode) {
    return (
      <section className="card otd kid">
        {title}
        <p className="otd-kid-headline">{h.kid.headline}</p>
        <ul className="otd-facts">
          {h.kid.facts.slice(0, size === 's' ? 2 : 4).map((f) => <li key={f.text}><span aria-hidden>{f.emoji}</span> {f.text}</li>)}
        </ul>
        {onKids && <button className="link" onClick={onKids}>Open the weather time machine →</button>}
      </section>
    );
  }

  return (
    <section className={`card otd ${size}`}>
      <div className="card-title">
        {title}
        <span className="hint">since {h.official?.station.since ?? h.since}</span>
      </div>

      {c && (
        <div className="otd-today">
          <div>
            <span className="otd-label">Today</span>
            <strong className="otd-big">{t(c.high)}</strong>
            <span className="otd-sub">/ {t(c.low)}</span>
          </div>
          <div>
            <span className="otd-label">Normal</span>
            <strong className="otd-big muted">{t(n.high)}</strong>
            <span className="otd-sub">/ {t(n.low)}</span>
          </div>
          <p className={`otd-diff ${c.diff > 0 ? 'warm' : c.diff < 0 ? 'cool' : ''}`}>
            {diffText(c.diff)}
            {size !== 's' && <><br /><span className="hint">{rankText(c, h.label)}</span></>}
          </p>
        </div>
      )}
      {c?.record && <p className="otd-record">{recordText(c.record)}</p>}

      <dl className="otd-records">
        <div><dt>Record high</dt><dd>{t(r.warmestHigh?.value)} <small>{r.warmestHigh?.year}</small></dd></div>
        <div><dt>Record low</dt><dd>{t(r.coldestLow?.value)} <small>{r.coldestLow?.year}</small></dd></div>
        {size !== 's' && (
          <>
            <div><dt>Coolest high</dt><dd>{t(r.coolestHigh?.value)} <small>{r.coolestHigh?.year}</small></dd></div>
            <div><dt>Warmest low</dt><dd>{t(r.warmestLow?.value)} <small>{r.warmestLow?.year}</small></dd></div>
            {r.wettest && <div><dt>Wettest</dt><dd>{amountText(r.wettest.value, u.precip)} <small>{r.wettest.year}</small></dd></div>}
            {r.snowiest && <div><dt>Snowiest</dt><dd>{amountText(r.snowiest.value, u.snow)} <small>{r.snowiest.year}</small></dd></div>}
            {n.rainChance != null && <div><dt>Chance of rain</dt><dd>{n.rainChance}%</dd></div>}
          </>
        )}
      </dl>

      {size !== 's' && (
        <ul className="otd-years">
          {highlightYears(h).map((y) => (
            <li key={y.year}>
              <span className="otd-year">{y.year}</span>
              <span className="otd-why">{y.why}</span>
              <span aria-hidden>{y.icon ? icon(y.icon) : ''}</span>
              <span>{t(y.high)} / {t(y.low)}</span>
            </li>
          ))}
        </ul>
      )}

      {(size === 'l' || all) && <YearsChart history={h} />}

      {h.trend && size !== 's' && (
        <p className="hint otd-trend">
          Average {h.label} high {h.trend.from[0]}–{h.trend.from[1]} vs {h.trend.to[0]}–{h.trend.to[1]}:{' '}
          <strong>{h.trend.change > 0 ? '+' : ''}{h.trend.change}°</strong>
        </p>
      )}

      {size !== 's' && (
        <button className="link" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Hide' : 'Show'} every year{size === 'l' ? ' as a table' : ''}
        </button>
      )}
      {all && <YearTable history={h} />}

      <p className="source">
        {h.official
          ? `Records, normals and past years: NOAA, ${h.official.station.name} (${h.official.station.km} km away). Sky and the trend: Open-Meteo ERA5.`
          : 'Open-Meteo ERA5 reanalysis, a model of past weather for this spot.'}
        {' '}Normals are {n.years?.join('–')}.
      </p>
    </section>
  );
}

function YearTable({ history: h }) {
  const t = (v) => tempText(v, h.units);
  return (
    <div className="otd-table-wrap">
      <table className="otd-table">
        <thead><tr><th>Year</th><th>Sky</th><th>High</th><th>Low</th><th>Rain</th><th>Snow</th></tr></thead>
        <tbody>
          {h.years.map((y) => (
            <tr key={y.year}>
              <td>{y.year}</td>
              <td title={y.label || ''}>{y.icon ? icon(y.icon) : ''}</td>
              <td>{t(y.high)}</td>
              <td>{t(y.low)}</td>
              <td>{y.precip ? amountText(y.precip, h.units.precip) : ''}</td>
              <td>{y.snow ? amountText(y.snow, h.units.snow) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
