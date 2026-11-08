import { useState } from 'react';
import { api } from '../api.js';
import RockyFace from './RockyFace.jsx';
import { t } from '../i18n.js';

// Grown-ups get search, saved places, Kids, units and ⚙️ Settings. In the kid
// view the header is just the place, the badge counter and a way back.
export default function Header({ location, onLocation, saved, kidMode, onKidMode, units, onUnits, onSettings, badges = 0, onBadges }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

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

  const [locMsg, setLocMsg] = useState('');

  const approximate = async () => {
    setBusy(true);
    setLocMsg('');
    try {
      const l = await api('/api/ip-location');
      onLocation({ name: l.name, lat: l.lat, lon: l.lon });
    } catch (e) {
      setLocMsg(`Could not guess your location (${e.message}). Search your city or ZIP instead.`);
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    setLocMsg('');
    if (!window.isSecureContext) {
      setLocMsg('insecure');
      return;
    }
    if (!navigator.geolocation) {
      setLocMsg('This browser cannot share its location. Search your city or ZIP, or use an approximate location.');
      return;
    }
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
      (err) => {
        setBusy(false);
        setLocMsg(err.code === 1
          ? 'Location is blocked for this site. Allow it in your browser\'s site settings, search your city or ZIP, or use an approximate location.'
          : 'Your device could not find its location just now. Try again, search your city or ZIP, or use an approximate location.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60_000 },
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

      {!kidMode && (
        <form className="search" onSubmit={search} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a city or ZIP')} aria-label={t('Search location')} />
          <button type="submit" disabled={busy}>{busy ? '…' : t('Go')}</button>
          <button type="button" onClick={locate} title={t('Use my location')} aria-label={t('Use my location')}>🎯</button>
          {locMsg && (
            <div className="locate-msg" role="alert">
              <p>
                {locMsg === 'insecure'
                  ? <>Browsers only share your exact location with <strong>https://</strong> sites, and this page is plain http. Search your city or ZIP above, or use an approximate location from your internet connection.</>
                  : locMsg}
              </p>
              <div className="row-actions">
                <button type="button" onClick={approximate} disabled={busy}>{t('📍 Use approximate location')}</button>
                <button type="button" className="ghost" onClick={() => setLocMsg('')}>{t('Close')}</button>
              </div>
            </div>
          )}
          {results.length > 0 && (
            <ul className="results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}><button type="button" onClick={() => pick(r)}>{r.name}</button></li>
              ))}
            </ul>
          )}
        </form>
      )}

      {kidMode ? (
        <div className="header-actions">
          <button className="ghost kid-badges" onClick={onBadges} aria-label={`My badges: ${badges}`}>🏅 {badges}</button>
          <button className="ghost" onClick={() => onKidMode(false)} title={t('Back to the grown-up view')}>🧑 {t('Grown-ups')}</button>
        </div>
      ) : (
        <div className="header-actions">
          {saved.length > 1 && (
            <select aria-label={t('Saved places')} value="" onChange={(e) => e.target.value && pick(saved[Number(e.target.value)])}>
              <option value="">{t('Saved places')}</option>
              {saved.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
            </select>
          )}
          <button className="ghost kids-switch" onClick={() => onKidMode(true)} title={t('Big, simple, friendly view for kids')}><RockyFace /> {t('Kids')}</button>
          <button className="ghost" onClick={() => onUnits(units === 'imperial' ? 'metric' : 'imperial')} title={t('Switch units')}>
            {units === 'imperial' ? '°F' : '°C'}
          </button>
          <button className="ghost" onClick={onSettings} title={t('Settings')} aria-label={t('Settings')}>⚙️</button>
        </div>
      )}
    </header>
  );
}
