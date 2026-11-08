import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { aqiLevel } from '../../../../shared/aqi.js';

// What the air sensors around you read right now, compared with the model.
export function sensorHeadline(d, modelAqi) {
  const c = d?.consensus;
  if (!c) return modelAqi != null ? `Model estimate: AQI ${modelAqi}` : 'No air reading';
  const diff = modelAqi != null ? c.aqi - modelAqi : 0;
  const vs = modelAqi == null || Math.abs(diff) < 10 ? '' : diff > 0 ? `, ${diff} worse than the model says` : `, ${-diff} better than the model says`;
  return `AQI ${c.aqi} from ${c.count} sensor${c.count === 1 ? '' : 's'} within ${Math.max(1, Math.round(c.miles))} mi${vs}`;
}

export default function AirSensorsCard({ weather, location, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/air/sensors?lat=${location.lat}&lon=${location.lon}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon]);

  const head = <h2>😷 {kidMode ? 'Air near you' : 'Air sensors'}</h2>;
  if (err) return <section className="card dash-aqs">{head}<p className="hint">{err}</p></section>;
  if (!d) return <section className="card dash-aqs">{head}<p className="hint">Checking air sensors…</p></section>;
  const modelAqi = weather?.air?.aqi ?? null;
  const noKeys = !d.keys?.airnow && !d.keys?.purpleair;
  const c = d.consensus;
  const aqi = c?.aqi ?? modelAqi;
  const lvl = aqiLevel(aqi);
  const list = d.sensors.slice(0, size === 's' ? 2 : size === 'l' ? 8 : 4);
  return (
    <section className={`card dash-aqs ${size} ${aqi > 150 ? 'alarm' : ''}`}>
      <div className="card-title">{head}</div>
      <div className="aqs-top">
        <b className="aqs-big" style={{ background: lvl?.color || '#888' }}>{aqi ?? '–'}</b>
        <div>
          <strong>{lvl ? lvl.label : 'No reading'}</strong>
          <span className="hint">{kidMode && lvl ? lvl.kid : sensorHeadline(d, modelAqi)}</span>
        </div>
      </div>
      {noKeys && <p className="hint">This is the air-quality model. For real readings from monitors and PurpleAir sensors near you, an admin can add a free AirNow key (and optionally a PurpleAir key) under Family &amp; settings, 😷 Live air sensors.</p>}
      {!noKeys && !list.length && <p className="hint">No sensors reported within 25 miles in the last hour.</p>}
      {list.length > 0 && (
        <ul className="aqs-list">
          {list.map((s) => (
            <li key={s.id}>
              <i style={{ background: aqiLevel(s.aqi)?.color }} aria-hidden="true" />
              <span className="aqs-name">{s.official ? '🏛️ ' : ''}{s.name}</span>
              <span className="hint">{s.miles} mi</span>
              <b>{s.aqi}</b>
            </li>
          ))}
        </ul>
      )}
      {d.errors?.length > 0 && <p className="hint">{d.errors.join(' and ')} didn't answer just now.</p>}
      {!kidMode && d.source && <p className="source">{d.source}. Official monitors count double in the reading.</p>}
    </section>
  );
}
