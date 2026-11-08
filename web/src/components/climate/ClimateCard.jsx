import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { t, locale } from '../../i18n.js';

// One line for the top of the card, e.g. "Moderate drought · La Niña".
export function climateHeadline(d) {
  const bits = [];
  if (d?.drought) bits.push(t(d.drought.label));
  const phase = d?.enso?.status || d?.enso?.phase?.short;
  if (phase) bits.push(phase);
  return bits.join(' · ');
}

// Bars for the last weeks of Niño 3.4: warm (red) above zero, cool (blue) below,
// with dashed lines at ±0.5 °C, where El Niño and La Niña start.
export function NinoBars({ weeks }) {
  if (!weeks?.length) return null;
  const W = 240;
  const H = 64;
  const max = Math.max(1.5, ...weeks.map((w) => Math.abs(w.nino34)));
  const y = (v) => H / 2 - (v / max) * (H / 2 - 4);
  const bw = W / weeks.length;
  return (
    <svg className="nino-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Niño 3.4 sea temperature, last ${weeks.length} weeks, now ${weeks.at(-1).nino34} °C from normal`}>
      {[0.5, -0.5].map((v) => <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} className="nino-line" />)}
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="nino-zero" />
      {weeks.map((w, i) => {
        const top = Math.min(y(w.nino34), H / 2);
        return <rect key={w.week} x={i * bw + 2} width={bw - 4} y={top} height={Math.max(1, Math.abs(y(w.nino34) - H / 2))} className={w.nino34 >= 0 ? 'warm' : 'cool'}><title>{`${w.week}: ${w.nino34 > 0 ? '+' : ''}${w.nino34} °C`}</title></rect>;
      })}
    </svg>
  );
}

// Drought & El Niño: this week's US Drought Monitor category here, and what the
// Pacific is doing (La Niña, El Niño or neutral) with what that usually means
// for the coming winter.
export default function ClimateCard({ location, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    api(`/api/climate?lat=${location.lat}&lon=${location.lon}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [location.lat, location.lon]);

  const head = <h2>🌎 {kidMode ? t('Dry spells & the Pacific') : t('Drought & El Niño')}</h2>;
  if (err) return <section className="card dash-climate">{head}<p className="hint">{err}</p></section>;
  if (!d) return <section className="card dash-climate">{head}<p className="hint">{t("Checking this week's maps…")}</p></section>;
  const e = d.enso;
  return (
    <section className={`card dash-climate ${size}`}>
      <div className="card-title">{head}</div>
      {d.drought ? (
        <div className="drought-row">
          <span className="drought-chip" style={{ background: d.drought.color, color: d.drought.level >= 3 ? '#fff' : '#222' }}>{d.drought.code === 'None' ? '✓' : d.drought.code}</span>
          <div>
            <b>{t(d.drought.label)}</b>
            <p className="hint">{kidMode ? d.drought.kid : d.drought.mapDate ? t('US Drought Monitor, week of {d}', { d: new Date(`${d.drought.mapDate}T12:00Z`).toLocaleDateString(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }) }) : 'US Drought Monitor'}</p>
          </div>
        </div>
      ) : (
        <p className="hint">{d.droughtAvailable ? t('The US Drought Monitor covers the United States only.') : t('The drought map is not answering right now.')}</p>
      )}
      {e ? (
        <div className="enso">
          <p><b>{t(e.status || e.phase?.label || '')}</b>{e.nino34 != null && <span className="hint"> · {t('Pacific {n} °C from normal', { n: `${e.nino34 > 0 ? '+' : ''}${e.nino34}` })}</span>}</p>
          {size !== 's' && <NinoBars weeks={e.weeks} />}
          {kidMode ? (
            <p className="hint">{e.phase?.id === 'lanina' ? 'La Niña means the ocean near the equator in the Pacific is cooler than usual. That can change the weather far away, even here!' : e.phase?.id === 'elnino' ? 'El Niño means the ocean near the equator in the Pacific is warmer than usual. That can change the weather far away, even here!' : 'The Pacific Ocean near the equator is about normal right now.'}</p>
          ) : (
            size !== 's' && e.synopsis && <p className="hint">{e.synopsis}</p>
          )}
          {e.winter && size !== 's' && <p>❄️ {t(e.winter)}</p>}
        </div>
      ) : (
        <p className="hint">{t('The El Niño report is not answering right now.')}</p>
      )}
      {size === 'l' && <p className="hint source">{d.source}</p>}
    </section>
  );
}
