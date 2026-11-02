import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { seasonOf, seasonsCovered } from '../../kid/logic.js';
import { icon } from '../../format.js';

// Shrink a photo in the browser so uploads stay small (about 200 KB).
async function shrink(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const niceDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

export default function Seasons({ user, weather, kid, today }) {
  const [photos, setPhotos] = useState(null);
  const [spot, setSpot] = useState(kid.data.spots?.[0] || '');
  const [newSpot, setNewSpot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState([null, null]);
  const fileRef = useRef();
  const lat = weather.location.lat;

  useEffect(() => {
    if (!user) return;
    api('/api/me/photos').then((r) => setPhotos(r.photos)).catch((e) => setError(e.message));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <section className="card seasons">
        <h2>Seasons tracker</h2>
        <p>📷 Take a photo of the same tree or yard every few weeks and watch it change through the year.</p>
        <p className="hint">Ask a grown-up to sign you in so your photos are saved to your profile.</p>
      </section>
    );
  }

  const spots = kid.data.spots || [];
  const addSpot = (e) => {
    e.preventDefault();
    const name = newSpot.trim();
    if (!name) return;
    if (!spots.includes(name)) kid.update(() => ({ spots: [...spots, name].slice(0, 12) }));
    setSpot(name);
    setNewSpot('');
  };

  const mine = (photos || []).filter((p) => p.spot === spot);
  const [a, b] = [mine.find((p) => p.id === compare[0]) || mine[0], mine.find((p) => p.id === compare[1]) || mine.at(-1)];

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const image = await shrink(file);
      const c = weather.forecast.current;
      const r = await api('/api/me/photos', {
        method: 'POST',
        body: { spot, image, takenOn: today, weather: { temp: c.temp == null ? null : Math.round(c.temp), units: weather.forecast.units.temp, icon: c.icon, kidLabel: c.kidLabel } },
      });
      const next = [...(photos || []), r.photo];
      setPhotos(next);
      setCompare([null, null]);
      const ids = ['photographer'];
      if (seasonsCovered(next.filter((p) => p.spot === spot), lat).size >= 4) ids.push('four-seasons');
      kid.earn(...ids);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (p) => {
    if (!window.confirm('Delete this photo?')) return;
    await api(`/api/me/photos/${p.id}`, { method: 'DELETE' }).catch(() => {});
    setPhotos((list) => list.filter((x) => x.id !== p.id));
  };

  const covered = seasonsCovered(mine, lat);
  return (
    <section className="card seasons">
      <h2>Seasons tracker</h2>
      <p className="hint">Pick a spot, like a tree or your yard. Stand in the same place each time and take a photo every few weeks.</p>

      <div className="spot-row">
        {spots.map((s) => (
          <button key={s} className={s === spot ? 'on' : 'ghost'} onClick={() => { setSpot(s); setCompare([null, null]); }}>{s}</button>
        ))}
        <form onSubmit={addSpot} className="spot-add">
          <input value={newSpot} onChange={(e) => setNewSpot(e.target.value)} placeholder="New spot, like Big oak tree" maxLength={60} aria-label="New spot name" />
          <button className="ghost">Add</button>
        </form>
      </div>

      {spot && (
        <>
          <div className="season-chips" aria-label="Seasons photographed">
            {[['spring', '🌷'], ['summer', '☀️'], ['fall', '🍂'], ['winter', '❄️']].map(([id, e]) => (
              <span key={id} className={covered.has(id) ? 'on' : ''}>{e} {id}</span>
            ))}
          </div>
          <label className={`photo-add ${busy ? 'busy' : ''}`}>
            📷 {busy ? 'Saving…' : `Add today's photo of ${spot}`}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} hidden />
          </label>
          {error && <p role="alert">{error}</p>}

          {mine.length >= 2 && a && b && (
            <div className="compare">
              {[a, b].map((p, i) => (
                <figure key={i}>
                  <img src={p.url} alt={`${spot} on ${niceDate(p.takenOn)}`} />
                  <figcaption>
                    <select value={p.id} onChange={(e) => setCompare((c) => (i === 0 ? [Number(e.target.value), c[1]] : [c[0], Number(e.target.value)]))} aria-label={i === 0 ? 'Before photo' : 'After photo'}>
                      {mine.map((x) => <option key={x.id} value={x.id}>{seasonOf(x.takenOn, lat).emoji} {niceDate(x.takenOn)}</option>)}
                    </select>
                    {p.weather && <span>{icon(p.weather.icon)} {p.weather.temp}{p.weather.units}</span>}
                  </figcaption>
                </figure>
              ))}
              <p className="hint">What changed? Look at the leaves, the grass and the light.</p>
            </div>
          )}

          {mine.length > 0 && (
            <ul className="photo-strip">
              {mine.map((p) => {
                const s = seasonOf(p.takenOn, lat);
                return (
                  <li key={p.id}>
                    <img src={p.url} alt={`${spot} on ${niceDate(p.takenOn)}`} loading="lazy" />
                    <span>{s.emoji} {niceDate(p.takenOn)}</span>
                    <button className="link" onClick={() => remove(p)} aria-label="Delete photo">🗑️</button>
                  </li>
                );
              })}
            </ul>
          )}
          {photos && !mine.length && <p className="hint">No photos of {spot} yet. Take the first one!</p>}
        </>
      )}
    </section>
  );
}
