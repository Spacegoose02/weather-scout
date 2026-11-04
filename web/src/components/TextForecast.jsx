import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { periodEmoji, tempPhrase, visibleCount } from '../forecast/textForecast.js';

function useTextForecast(location, units) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    if (!location) return undefined;
    let live = true;
    setState({ data: null, error: '' });
    api(`/api/forecast/text?lat=${location.lat}&lon=${location.lon}&units=${units || 'imperial'}`)
      .then((data) => live && setState({ data, error: '' }))
      .catch(() => live && setState({ data: null, error: 'The Weather Service did not answer. Try again in a few minutes.' }));
    return () => {
      live = false;
    };
  }, [location?.lat, location?.lon, units]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// The forecaster-written day and night periods from the National Weather
// Service, like the Detailed Forecast on weather.gov.
export default function TextForecast({ location, units, kidMode, size = 'l' }) {
  const { data, error } = useTextForecast(location, units);
  const [all, setAll] = useState(false);
  const title = <h2>📝 Detailed forecast</h2>;

  if (error) return <section className="card textfc">{title}<p className="hint">{error}</p></section>;
  if (!data) return <section className="card textfc">{title}<p className="hint">Asking the forecasters…</p></section>;
  if (!data.available) {
    return <section className="card textfc">{title}<p className="hint">The written forecast comes from the US National Weather Service, so it is only available for places in the US.</p></section>;
  }

  const n = visibleCount(size, data.periods.length, all);
  const shown = data.periods.slice(0, n);
  const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <section className={`card textfc ${size}${kidMode ? ' kid' : ''}`}>
      <div className="card-title">
        {title}
        <span className="hint">{data.office ? `NWS ${data.office}` : 'NWS'}{updated ? ` · ${updated}` : ''}</span>
      </div>
      <dl className="textfc-list">
        {shown.map((p) => (
          <div key={p.start || p.name} className={`textfc-row${p.isDaytime ? '' : ' night'}`}>
            <dt>
              <span className="textfc-emoji" aria-hidden>{periodEmoji(p)}</span>
              <span className="textfc-name">{p.name}</span>
              {p.precipChance > 0 && <span className="textfc-pop" title="Chance of rain or snow">💧 {p.precipChance}%</span>}
            </dt>
            <dd>{kidMode ? <><strong>{p.short}.</strong> {tempPhrase(p)}.</> : p.detailed}</dd>
          </div>
        ))}
      </dl>
      {n < data.periods.length && <button className="link" onClick={() => setAll(true)}>Show all {data.periods.length} periods</button>}
      {all && size !== 'l' && <button className="link" onClick={() => setAll(false)}>Show fewer</button>}
    </section>
  );
}
