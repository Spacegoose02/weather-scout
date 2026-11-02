import { useState } from 'react';
import { api } from '../api.js';
import RockyFace from './RockyFace.jsx';

export default function Header({ location, onLocation, saved, kidMode, onKidMode, units, onUnits, user, onSignIn, onSignOut, onAdmin, sso }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const search = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await api(`/api/geocode?q=${encodeURIComponent(q.trim())}`));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const pick = (l) => {
    onLocation({ name: l.name, lat: l.lat, lon: l.lon });
    setResults([]);
    setQ('');
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = +coords.latitude.toFixed(4);
        const lon = +coords.longitude.toFixed(4);
        let name = 'My location';
        try {
          name = (await api(`/api/reverse-geocode?lat=${lat}&lon=${lon}`)).name || name;
        } catch {
          /* outside the US */
        }
        onLocation({ name, lat, lon });
        setBusy(false);
      },
      () => setBusy(false),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  return (
    <header className="header">
      <div className="brand">
        <img src="/icon-192.png" alt="" width="44" height="44" className="brand-logo" />
        <div>
          <h1>Weather Scout</h1>
          <div className="place" title={`${location?.lat}, ${location?.lon}`}>📍 {location?.name}</div>
        </div>
      </div>

      <form className="search" onSubmit={search} role="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city or ZIP" aria-label="Search location" />
        <button type="submit" disabled={busy}>{busy ? '…' : 'Go'}</button>
        <button type="button" onClick={locate} title="Use my location" aria-label="Use my location">🎯</button>
        {results.length > 0 && (
          <ul className="results">
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`}><button type="button" onClick={() => pick(r)}>{r.name}</button></li>
            ))}
          </ul>
        )}
      </form>

      <div className="header-actions">
        {saved.length > 1 && (
          <select aria-label="Saved places" value="" onChange={(e) => e.target.value && pick(saved[Number(e.target.value)])}>
            <option value="">Saved places</option>
            {saved.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
          </select>
        )}
        <label className="switch" title="Big, simple, friendly view for kids">
          <input type="checkbox" checked={kidMode} onChange={(e) => onKidMode(e.target.checked)} />
          <span><RockyFace /> Kid mode</span>
        </label>
        <button className="ghost" onClick={() => onUnits(units === 'imperial' ? 'metric' : 'imperial')} title="Switch units">
          {units === 'imperial' ? '°F' : '°C'}
        </button>
        {user ? (
          <div className="user">
            <button className="ghost" onClick={() => setMenu(menu === 'user' ? false : 'user')} aria-expanded={menu === 'user'}>
              👤 {user.displayName}
            </button>
            {menu === 'user' && (
              <div className="menu" onClick={() => setMenu(false)}>
                {user.isAdmin && <button onClick={onAdmin}>Family & settings</button>}
                <button onClick={onSignOut}>Sign out</button>
              </div>
            )}
          </div>
        ) : (
          !sso && <button className="ghost" onClick={onSignIn}>Sign in</button>
        )}
      </div>
    </header>
  );
}
