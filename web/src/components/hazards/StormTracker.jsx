import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { CELL_LEVELS, cellSummary, etaText } from '../../../../shared/stormcells.js';

// Storm tracker: storm cells the NEXRAD radars are following within 100 miles,
// which way each is moving and, for the ones on course for you, when they
// could arrive. Refreshes every 2 minutes, about as often as a radar scans.
export function headline(cells, kid = false) {
  const coming = cells.filter((c) => c.threat);
  if (!cells.length) return kid ? 'No storms on the radar near you. 🌤️' : 'No storm cells on the radar within 100 miles.';
  if (!coming.length) {
    return kid
      ? `Rocky sees ${cells.length} storm${cells.length === 1 ? '' : 's'} on the radar, but none are coming this way.`
      : `${cells.length} storm cell${cells.length === 1 ? '' : 's'} within 100 miles, none on course for you.`;
  }
  const c = coming[0];
  const lvl = CELL_LEVELS[c.level];
  if (c.threat.overhead) return kid ? 'A storm is right over you. Stay inside until it passes!' : `${lvl.label} over you now.`;
  return kid
    ? `A storm is coming ${etaText(c.threat.eta)}. Time to get your things inside!`
    : `${lvl.label} heading your way, arriving ${etaText(c.threat.eta)}.`;
}

export default function StormTracker({ location, kidMode, size }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api(`/api/cells/near?lat=${location.lat}&lon=${location.lon}&miles=100`)
      .then((r) => { if (live) { setD(r); setErr(''); } })
      .catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 2 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, [location.lat, location.lon]);

  const cells = d?.cells || [];
  const coming = cells.some((c) => c.threat && c.level !== 'storm');
  const shown = size === 's' ? cells.slice(0, 2) : size === 'l' ? cells.slice(0, 8) : cells.slice(0, 4);
  return (
    <section className={`card dash-cells ${size} ${coming ? 'alarm' : ''}`}>
      <div className="card-title"><h2>⛈️ {kidMode ? 'Storm spotter' : 'Storm tracker'}</h2></div>
      {err && <p className="hint">Storm tracks unavailable: {err}</p>}
      {d && <p className="cells-headline">{headline(cells, kidMode)}</p>}
      {shown.length > 0 && (
        <ul className="cell-list">
          {shown.map((c) => {
            const lvl = CELL_LEVELS[c.level];
            return (
              <li key={c.id} className={c.threat ? 'coming' : ''}>
                <span className="cell-dot" style={{ background: lvl.color }} aria-hidden />
                <span className="cell-name">
                  <strong>{kidMode ? lvl.kid : lvl.label}</strong>
                  {!kidMode && cellSummary(c) && <span className="hint"> · {cellSummary(c)}</span>}
                </span>
                <span className="cell-meta hint">
                  {c.miles} mi {c.dir}
                  {c.moving && ` · moving ${c.moving} at ${c.mph} mph`}
                  {c.threat && !c.threat.overhead && <b> · here {etaText(c.threat.eta)}</b>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!kidMode && <p className="source">NEXRAD storm tracking via Iowa Environmental Mesonet, US radars only. Arrival times assume the storm keeps its speed and direction. Turn on ⛈️ Storm heading your way under 🔔 alerts for a push heads-up.</p>}
    </section>
  );
}
