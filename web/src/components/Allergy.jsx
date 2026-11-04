import { round, clockLabel, dayLabel } from '../format.js';
import './health.css';

const POLLEN_COLOR = { None: 'green', Low: 'green', Moderate: 'yellow', High: 'orange', 'Very high': 'red' };
const POLLEN_FILL = { None: 0.03, Low: 0.2, Moderate: 0.45, High: 0.75, 'Very high': 1 };
const GROUP_EMOJI = { tree: '🌳', grass: '🌾', weed: '🌼' };
const GROUP_NAME = { tree: 'Tree', grass: 'Grass', weed: 'Weed' };

const pollenNumber = (v, unit, max) => (v == null ? null : unit === 'index' ? `${round(v)}/${max || 5}` : round(v));

function PollenRow({ g, unit, max }) {
  return (
    <div className="pollen-row">
      <span className="sub-name">{g.emoji || GROUP_EMOJI[g.id]} {g.name || GROUP_NAME[g.id]}</span>
      <span className="sub-track"><i className={`fill ${POLLEN_COLOR[g.level] || ''}`} style={{ width: `${(POLLEN_FILL[g.level] || 0.05) * 100}%` }} /></span>
      <span className="pollen-val"><strong>{g.level || '–'}</strong>{g.value != null && unit ? <small> {pollenNumber(g.value, unit, max)}</small> : null}{g.inSeason === false ? <small> · out of season</small> : null}</span>
    </div>
  );
}

export default function Allergy({ weather }) {
  const r = weather.allergy;
  if (!r) return null;
  const { pollen, particles, breathing } = r;
  const today = weather.forecast.current.time?.slice(0, 10);
  return (
    <section className="card allergy" aria-label="Allergies and breathing">
      <div className="card-title"><h2>🤧 Allergies & breathing</h2>{pollen.source && <span className="hint">{pollen.source}</span>}</div>

      {breathing && (
        <div className="breathing">
          <div className={`aqi-badge ${breathing.color}`}><b>{breathing.level}</b><span>Asthma &amp; allergy</span></div>
          <div>
            <div className="tile-note"><strong>{breathing.advice}</strong></div>
            {breathing.reasons.length > 0 && (
              <ul className="effects">
                {breathing.reasons.slice(0, 4).map((x) => <li key={x.text}>{x.text}</li>)}
              </ul>
            )}
            {breathing.best && <div className="tile-note">Cleanest daylight hour to be outside: <strong>{clockLabel(breathing.best.time)}</strong> (AQI {round(breathing.best.aqi)})</div>}
          </div>
        </div>
      )}

      <h3 className="health-sub">Pollen</h3>
      {pollen.available ? (
        <>
          <div className="sub-bars" aria-label="Pollen by plant group">
            {pollen.groups.map((g) => <PollenRow key={g.id} g={g} unit={pollen.unit} max={pollen.scaleMax} />)}
            {pollen.unit && <div className="tile-note">{pollen.unit === 'index' ? `Numbers are the Universal Pollen Index for today, 0 to ${pollen.scaleMax || 5}.` : `Numbers are ${pollen.unit} of air, right now.`}{pollen.peak ? ` ${GROUP_NAME[pollen.top?.id] || 'Pollen'} peaks around ${clockLabel(pollen.peak.time)}.` : ''}</div>}
          </div>
          {pollen.species?.length > 0 && (
            <div className="chips" aria-label="Pollen by plant">
              {pollen.species.map((s) => (
                <span key={s.id} className={`chip ${POLLEN_COLOR[s.level] || ''}`}>{GROUP_EMOJI[s.group]} {s.name}: {s.level} <small>({round(s.value)})</small></span>
              ))}
            </div>
          )}
          {pollen.daily?.length > 1 && (
            <table className="pollen-days">
              <thead><tr><th />{pollen.daily.map((d) => <th key={d.date}>{dayLabel(d.date, d.date === today ? 0 : 1)}</th>)}</tr></thead>
              <tbody>
                {['tree', 'grass', 'weed'].map((id) => (
                  <tr key={id}>
                    <th>{GROUP_EMOJI[id]} {GROUP_NAME[id]}</th>
                    {pollen.daily.map((d) => {
                      const g = d.groups.find((x) => x.id === id);
                      return <td key={d.date}><i className={`dot ${POLLEN_COLOR[g?.level] || ''}`} aria-hidden /> {g?.level || '–'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="hint">{pollen.note}</p>
      )}

      {particles.length > 0 && (
        <>
          <h3 className="health-sub">Particles & ozone</h3>
          <div className="particles">
            {particles.map((x) => (
              <div className="tile" key={x.id}>
                <div className="tile-label">{x.name} <span className="muted-normal">{x.long}</span></div>
                <div className="tile-value"><i className={`dot ${x.color}`} aria-hidden /> {x.value != null ? round(x.value) : '–'} <small>{x.unit}</small></div>
                <div className="tile-note">AQI {round(x.aqi)}, {x.level?.toLowerCase() || 'unknown'}{x.peak && x.peak.aqi > (x.aqi ?? 0) + 5 ? `. Peaks at ${round(x.peak.aqi)} around ${clockLabel(x.peak.time)}` : ''}.</div>
                <div className="tile-note">{x.what} {x.aqi > 50 ? x.sensitive : ''}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="hint">General guidance, not medical advice. Follow your own asthma or allergy plan.</p>
    </section>
  );
}
