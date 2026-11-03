import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Modal from '../Modal.jsx';
import { distanceText } from './layers.js';
import { updatedText } from './webcams.js';

// "Webcams near me": the closest Windy webcams to the place you're looking at,
// as a grid of live pictures. Tap one for a big picture and today's timelapse.
// Picture links from Windy expire after a few minutes, so the list reloads itself.
const REFRESH_MS = 4 * 60_000;
// Distances to pick from, in km, chosen to be round numbers in each unit.
const RADII = { imperial: [24, 48, 97, 241], metric: [25, 50, 100, 250] }; // 15, 30, 60, 150 miles

export default function NearbyWebcams({ center, units = 'imperial', attribution, onClose }) {
  const radii = RADII[units] || RADII.imperial;
  const [radius, setRadius] = useState(radii[1]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // webcam id
  const [timelapse, setTimelapse] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = () => {
      api(`/api/webcams/near?lat=${center.lat}&lon=${center.lon}&radius=${radius}`)
        .then((r) => { if (!cancelled) { setData(r); setError(''); } })
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => { if (!cancelled) timer = setTimeout(load, REFRESH_MS); });
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [center.lat, center.lon, radius]);

  const cams = data?.webcams || [];
  const cam = cams.find((c) => c.id === open);
  const credit = attribution || { text: 'Webcams provided by Windy.com', url: 'https://www.windy.com/webcams' };
  const radiusLabel = (km) => (units === 'metric' ? `${km} km` : `${Math.round(km / 1.609344)} miles`);

  return (
    <Modal title={`🌄 Webcams near ${center.name || 'you'}`} onClose={onClose} wide>
      <p className="hint">
        Real pictures from cameras people have pointed at the sky, beaches, mountains and towns.
        Look out for clouds, rain, fog or snow, then check the forecast to see if it matches!
      </p>
      <div className="webcam-tools">
        <label className="radar-select">Within{' '}
          <select value={radius} onChange={(e) => { setRadius(Number(e.target.value)); setOpen(null); }}>
            {radii.map((km) => <option key={km} value={km}>{radiusLabel(km)}</option>)}
          </select>
        </label>
        <a className="webcam-attrib" href={credit.url} target="_blank" rel="noopener noreferrer">{credit.text}</a>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!data && !error && <p className="hint" role="status">Finding webcams…</p>}
      {data && !cams.length && <p className="hint">No Windy webcams within {radiusLabel(radius)}. Try a bigger distance.</p>}

      {cam && (
        <div className="webcam-big">
          <div className="webcam-big-head">
            <strong>{cam.title}</strong>
            <button className="ghost" onClick={() => { setOpen(null); setTimelapse(false); }} aria-label="Back to all webcams">✕</button>
          </div>
          <div className="cam-stage">
            {timelapse && cam.player
              ? <iframe src={cam.player} title={`Timelapse: ${cam.title}`} allow="autoplay; fullscreen" allowFullScreen referrerPolicy="origin" />
              : cam.preview
                ? <a href={cam.link} target="_blank" rel="noopener noreferrer"><img src={cam.preview} alt={`Webcam view: ${cam.title}`} referrerPolicy="no-referrer" /></a>
                : <p>No picture from this webcam right now.</p>}
          </div>
          <div className="cam-actions">
            {cam.player && <button onClick={() => setTimelapse(!timelapse)}>{timelapse ? '📷 Picture' : '▶ Today’s timelapse'}</button>}
            <a href={cam.link} target="_blank" rel="noopener noreferrer">See it on Windy</a>
            <span className="cam-auto">{[cam.place, distanceText(cam.km, units) && `${distanceText(cam.km, units)} away`, updatedText(cam.updated)].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
      )}

      <ul className="webcam-grid">
        {cams.map((c) => (
          <li key={c.id}>
            <button className={c.id === open ? 'on' : ''} onClick={() => { setOpen(c.id); setTimelapse(false); }} aria-label={`${c.title}, ${distanceText(c.km, units)} away`}>
              {c.thumb ? <img src={c.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="webcam-none">🌄</span>}
              <b>{c.title}</b>
              <small>{distanceText(c.km, units)} away</small>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
