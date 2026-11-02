import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { icon } from '../../format.js';

export default function FieldTrips({ location, units, kid, today }) {
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    setTrip(null);
    setError('');
    api(`/api/kid/field-trip?lat=${location.lat}&lon=${location.lon}&units=${units}`)
      .then((t) => live && setTrip(t))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [location.lat, location.lon, units]);

  const stamps = kid.data.stamps || {};
  const stamp = (id) => {
    const next = { ...stamps, [id]: today };
    kid.update(() => ({ stamps: next }));
    kid.earn('explorer');
    if (Object.keys(next).length >= 5) kid.earn('road-tripper');
  };

  return (
    <section className="card field-trips">
      <h2>Camera field trips</h2>
      <p className="hint">Visit real road cameras near you and go on a weather hunt.</p>
      {error && <p>Could not load the cameras right now. {error}</p>}
      {!trip && !error && <p>Packing the bus… 🚌</p>}
      {trip && !trip.missions.length && (
        <p>No road cameras are set up near here yet. A grown-up can turn on camera feeds for your state (see the README).</p>
      )}
      {trip?.missions.length > 0 && (
        <>
          <div className="passport" aria-label="Field trip passport">
            {trip.missions.map((m) => (
              <span key={m.id} className={stamps[m.id] ? 'stamped' : ''} title={m.title}>{stamps[m.id] ? m.emoji : '○'}</span>
            ))}
          </div>
          <ul className="missions">
            {trip.missions.map((m) => (
              <li key={m.id} className={m.found ? '' : 'none'}>
                <button className="mission-btn" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
                  <span className="emoji" aria-hidden>{m.emoji}</span> {m.title} {stamps[m.id] && <span aria-label="done">✅</span>}
                </button>
                {open === m.id && (
                  <div className="mission">
                    {!m.found ? <p>{m.none}</p> : (
                      <>
                        <p className="clue">🔍 {m.clue}</p>
                        <div className="trip-cams">
                          {m.cameras.map((c) => (
                            <figure key={c.id}>
                              <img src={c.imageUrl} alt={`Road camera: ${c.name}`} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                              <figcaption>
                                <strong>{c.name}</strong>
                                <span>{icon(c.icon, c.isDay)} {c.temp}° · {c.kidLabel}</span>
                                <span>{c.miles <= 1 ? 'Right near you' : `${c.miles} miles ${c.direction}`}</span>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                        {!stamps[m.id] && <button onClick={() => stamp(m.id)}>I found it! Stamp my passport 🛂</button>}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="hint small">Checked {trip.cameraCount} cameras nearby. Camera pictures refresh every few minutes.</p>
        </>
      )}
    </section>
  );
}
