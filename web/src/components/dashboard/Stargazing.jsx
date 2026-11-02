import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { skyVerdict, skyTime } from '../../dashboard/stars.js';

// Tonight's sky: is it clear, when does it get dark, which planets are up and
// where to look, and the Moon.
export default function Stargazing({ weather, location, kidMode, size }) {
  const [sky, setSky] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const tz = weather.forecast.timezone;

  useEffect(() => {
    let live = true;
    setErr('');
    const load = () => api(`/api/sky/tonight?lat=${location.lat}&lon=${location.lon}`).then((r) => live && setSky(r)).catch((e) => live && setErr(e.message));
    load();
    const id = setInterval(load, 15 * 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [location.lat, location.lon]);

  const moon = weather.moon;
  if (err) return <section className="card dash-stars"><h2>🔭 Stargazing tonight</h2><p className="hint">{err}</p></section>;
  if (!sky) return <section className="card dash-stars"><h2>🔭 Stargazing tonight</h2><p className="hint">Checking the sky…</p></section>;

  const verdict = skyVerdict(weather.forecast.hourly, sky.dark, kidMode);
  const up = sky.planets.filter((p) => p.visible);
  const down = sky.planets.filter((p) => !p.visible);
  const t = (x) => skyTime(x, tz);
  const shown = size === 's' ? up.slice(0, 3) : up;

  return (
    <section className={`card dash-stars ${size} ${verdict?.rating || ''}`}>
      <div className="card-title">
        <h2>🔭 Stargazing tonight</h2>
        {sky.dark && <span className="hint">{sky.dark.now ? 'Dark now' : `Dark by ${t(sky.dark.from)}`}</span>}
      </div>

      {sky.note && <p>{sky.note}</p>}
      {verdict && <p className="stars-verdict">{verdict.emoji} {verdict.text}</p>}

      {sky.dark && (
        up.length ? (
          <ul className="planet-list">
            {shown.map((p) => (
              <li key={p.id}>
                <button className="planet" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                  <span className="planet-dot" style={{ background: p.color }} aria-hidden />
                  <span className="planet-name">{p.name}</span>
                  <span className="planet-where">
                    {p.best.where}{size !== 's' && <> around {t(p.best.time)}</>}
                  </span>
                </button>
                {open === p.id && (
                  <div className="planet-more">
                    <p>
                      {kidMode ? p.kid : `${cap(p.brightness)} (magnitude ${p.magnitude}), in ${p.constellation}. Up from ${t(p.upFrom)} until ${t(p.upUntil)}, highest at ${p.best.altitude}° around ${t(p.best.time)}.`}
                    </p>
                    {!p.easy && <p className="hint">Faint tonight, so you need a dark spot away from streetlights.</p>}
                    {!kidMode && <p className="hint">{p.kid}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p>No bright planets are up after dark tonight. The Moon and stars still are!</p>
      )}
      {size !== 's' && down.length > 0 && sky.dark && (
        <p className="hint">Not up after dark: {down.map((p) => p.name).join(', ')} (too close to the Sun).</p>
      )}

      <p className="stars-moon">
        <span aria-hidden>{moon?.emoji || '🌙'}</span> {moon ? `${moon.name}, ${moon.illumination}% lit.` : ''}
        {sky.moon.rise && ` Rises ${t(sky.moon.rise)}.`}
        {sky.moon.set && ` Sets ${t(sky.moon.set)}.`}
        {sky.moon.brightSky && ' Its glow will wash out faint stars.'}
      </p>
      {kidMode && up.length > 0 && <p className="hint">Tip: planets shine steadily. Stars twinkle!</p>}
    </section>
  );
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
