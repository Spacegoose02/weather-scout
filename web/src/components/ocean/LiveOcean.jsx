import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { compass, clockLabel } from '../../format.js';
import { waterSense, waveSense } from '../../ocean/ocean.js';
import { trackProgress, localDay } from '../../kid/badges.js';
import SpeakButton from '../kid/SpeakButton.jsx';

const ftOf = (h, units) => (h == null ? null : units === 'metric' ? h * 3.28084 : h);
const fOf = (t, units) => (t == null ? null : units === 'metric' ? t * 1.8 + 32 : t);
const ago = (iso) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min)) return '';
  if (min < 60) return `${Math.max(1, min)} min ago`;
  return `${Math.round(min / 60)} h ago`;
};

function Buoy({ b, units, kid, hero }) {
  const hu = units === 'metric' ? 'm' : 'ft';
  const tu = units === 'metric' ? '°C' : '°F';
  const wu = units === 'metric' ? 'km/h' : 'mph';
  const dist = units === 'metric' ? `${Math.round(b.miles * 1.609).toLocaleString()} km` : `${b.miles.toLocaleString()} miles`;
  const wave = waveSense(ftOf(b.waveHeight, units));
  const water = waterSense(fOf(b.waterTemp, units));
  const say = [
    `The buoy is ${dist} away.`,
    b.waveHeight != null && `Waves are ${b.waveHeight} ${units === 'metric' ? 'meters' : 'feet'}, ${wave}.`,
    b.waterTemp != null && `The water is ${Math.round(b.waterTemp)} degrees, ${water}.`,
  ].filter(Boolean).join(' ');
  return (
    <article className={`buoy ${hero ? 'hero' : ''}`}>
      <div className="buoy-head">
        <span className="buoy-icon" aria-hidden>🛟</span>
        <div>
          <strong>Buoy {b.id}</strong>
          <div className="hint">{dist} away{b.time ? ` · ${ago(b.time)}` : ''}</div>
        </div>
        <a className="hint" href={b.link} target="_blank" rel="noopener noreferrer">NOAA page</a>
      </div>
      <div className="buoy-tiles">
        {b.waveHeight != null && (
          <div className="buoy-tile"><span aria-hidden>🌊</span><b>{b.waveHeight} {hu}</b><small>waves{b.wavePeriod ? `, every ${b.wavePeriod} s` : ''}</small>{kid && hero && <em>{wave}</em>}</div>
        )}
        {b.waterTemp != null && (
          <div className="buoy-tile"><span aria-hidden>🌡️</span><b>{Math.round(b.waterTemp)}{tu}</b><small>water</small>{kid && hero && <em>{water}</em>}</div>
        )}
        {b.wind != null && (
          <div className="buoy-tile"><span aria-hidden>💨</span><b>{b.wind} {wu}</b><small>wind {compass(b.windDir)}{b.gust ? `, gusts ${b.gust}` : ''}</small></div>
        )}
        {b.airTemp != null && hero && (
          <div className="buoy-tile"><span aria-hidden>🌤️</span><b>{Math.round(b.airTemp)}{tu}</b><small>air over the sea</small></div>
        )}
      </div>
      {hero && <SpeakButton text={say} />}
    </article>
  );
}

export default function LiveOcean({ kid, location, units }) {
  const [buoys, setBuoys] = useState(null);
  const [tides, setTides] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setBuoys(null);
    setTides(null);
    setError('');
    const q = `lat=${location.lat}&lon=${location.lon}&units=${units}`;
    api(`/api/ocean/buoys?${q}`).then((r) => {
      setBuoys(r.buoys);
      if (r.buoys[0]) trackProgress({ buoys: { [r.buoys[0].id]: localDay() } });
    }).catch((e) => setError(e.message));
    api(`/api/tides?${q}`).then(setTides).catch(() => setTides({ station: null }));
  }, [location.lat, location.lon, units]);

  const [first, ...rest] = buoys || [];
  return (
    <section className="card ocean-live">
      <h2>🛟 Live ocean</h2>
      <p className="hint">{kid
        ? 'Buoys are floating weather stations out at sea. They measure the waves and the water all day and night.'
        : 'The closest NOAA National Data Buoy Center stations reporting waves or sea temperature, plus tides from NOAA Tides & Currents.'}
      </p>
      {error && <p className="error-text">Could not reach the buoys: {error}</p>}
      {!buoys && !error && <p className="hint">Calling the buoys…</p>}
      {first && <Buoy b={first} units={units} kid={kid} hero />}
      {first && first.miles > 150 && kid && <p className="hint">You live far from the ocean, so this is the closest buoy. Pick a beach town at the top to see its waves!</p>}
      {rest.length > 0 && (
        <>
          <h3>Other buoys nearby</h3>
          <div className="buoy-more">{rest.map((b) => <Buoy key={b.id} b={b} units={units} kid={kid} />)}</div>
        </>
      )}

      <h3>🌙 Tides</h3>
      {tides == null && <p className="hint">Checking the tides…</p>}
      {tides && !tides.station && <p className="hint">{kid ? 'There is no tide station close to you. Tides happen because the Moon pulls on the ocean, so the sea goes up and down about twice a day!' : 'No NOAA tide-prediction station within 60 miles.'}</p>}
      {tides?.station && (
        <>
          <p>
            {tides.state && <>The tide is <strong>{tides.state}</strong> at {tides.station.name}. </>}
            <a className="hint" href={tides.link} target="_blank" rel="noopener noreferrer">{tides.station.miles} mi away</a>
          </p>
          <div className="tide-row">
            {tides.next.map((e) => (
              <div key={e.time} className={`tide ${e.type}`}>
                <div className="tide-icon" aria-hidden>{e.type === 'high' ? '⬆️' : '⬇️'}</div>
                <div className="tile-label">{e.type === 'high' ? 'High' : 'Low'}</div>
                <div className="tile-value">{clockLabel(e.time)}</div>
                <div className="tile-note">{e.height} {tides.unit}</div>
              </div>
            ))}
          </div>
          {kid && <p className="hint">The Moon's gravity pulls the ocean into a bulge. As Earth spins, beaches move into and out of the bulge, so the water rises and falls.</p>}
        </>
      )}
      <p className="topic-links">Data: NOAA National Data Buoy Center · NOAA Tides & Currents</p>
    </section>
  );
}
