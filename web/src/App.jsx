import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { usePrefs } from './usePrefs.js';
import Header from './components/Header.jsx';
import AlertsBanner from './components/AlertsBanner.jsx';
import WeatherMap from './components/WeatherMap.jsx';
import KidMode from './components/KidMode.jsx';
import SignIn from './components/SignIn.jsx';
import Admin from './components/Admin.jsx';
import News from './components/News.jsx';
import ModelsView from './components/ModelsView.jsx';
import PushAlerts from './components/PushAlerts.jsx';
import RockyFace from './components/RockyFace.jsx';
import AskExpert from './components/AskExpert.jsx';
import Learn from './components/learn/Learn.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import { configureVoice } from './kid/speak.js';
import { useTheme } from './theme/useTheme.js';

const TABS = [
  ['today', 'Today', '🌤️'],
  ['map', 'Radar & Cams', '🗺️'],
  ['kids', 'Kid Zone', <RockyFace key="rocky" />],
  ['learn', 'Learn', '🎓'],
  ['models', 'Models', '📊'],
  ['news', 'News & Videos', '📰'],
];

export default function App() {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = usePrefs(user);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('today');
  const [modal, setModal] = useState(null); // 'signin' | 'admin'

  useEffect(() => {
    api('/api/config')
      .then((c) => {
        setConfig(c);
        setUser(c.user);
        if (c.auth.needsSetup || (c.auth.required && !c.user)) setModal('signin');
      })
      .catch((e) => setError(e.message));
  }, []);

  const location = prefs.location || config?.defaultLocation;
  const units = prefs.units || config?.units || 'imperial';
  const kidMode = !!prefs.kidMode;
  const theme = useTheme(prefs.theme, weather);
  const voice = { tts: config?.tts, value: prefs.voice || '', onChange: (v) => setPrefs({ voice: v }) };

  // Read-aloud uses the server's Kokoro voice when there is one.
  useEffect(() => configureVoice({ enabled: config?.tts?.enabled, voice: prefs.voice }), [config?.tts?.enabled, prefs.voice]);

  const load = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    try {
      const w = await api(`/api/weather?lat=${location.lat}&lon=${location.lon}&units=${units}`);
      setWeather(w);
      setError('');
    } catch (e) {
      setError(e.status === 401 ? '' : e.message);
      if (e.status === 401) setModal('signin');
    } finally {
      setLoading(false);
    }
  }, [location?.lat, location?.lon, units]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.kid = kidMode ? 'on' : 'off';
    if (kidMode && tab === 'today') setTab('kids');
  }, [kidMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    const r = await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
    if (r.ssoLogoutUrl) window.location.href = r.ssoLogoutUrl;
  };

  if (!config) return <div className="splash">{error || 'Loading Weather Scout…'}</div>;
  const blocked = config.auth.required && !user;

  return (
    <div className={`app ${kidMode ? 'kid' : ''}`}>
      <Header
        location={location}
        onLocation={(l) => setPrefs((p) => ({ location: l, saved: dedupe([l, ...(p.saved || [])]).slice(0, 8) }))}
        saved={prefs.saved || []}
        kidMode={kidMode}
        onKidMode={(v) => setPrefs({ kidMode: v })}
        units={units}
        onUnits={(u) => setPrefs({ units: u })}
        user={user}
        onSignIn={() => setModal('signin')}
        onSignOut={signOut}
        onAdmin={() => setModal('admin')}
        onAlerts={() => setModal('alerts')}
        sso={config.auth.sso}
        theme={{ value: prefs.theme || 'auto', active: theme.id, why: theme.why, onChange: (t) => setPrefs({ theme: t }) }}
      />

      {!blocked && (
        <>
          <nav className="tabs" aria-label="Sections">
            {[...TABS, ...(config.ai?.enabled ? [['ask', kidMode ? 'Ask Rocky' : 'Ask an Expert', '💬']] : [])].map(([id, label, emoji]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
                <span aria-hidden>{emoji}</span> {label}
              </button>
            ))}
          </nav>

          {error && (
            <div className="error card" role="alert">
              {error} <button onClick={load}>Try again</button>
            </div>
          )}

          {weather && <AlertsBanner alerts={weather.alerts} kidMode={kidMode} />}

          <main>
            {!weather && !error && tab !== 'news' && tab !== 'ask' && tab !== 'models' && <div className="card skeleton">Fetching the sky…</div>}
            {weather && tab === 'today' && (
              <Dashboard
                weather={weather}
                location={location}
                units={units}
                kidMode={kidMode}
                user={user}
                loading={loading}
                onTab={setTab}
                onSignIn={() => setModal('signin')}
                onAlerts={() => setModal('alerts')}
                onAdmin={() => setModal('admin')}
              />
            )}
            {tab === 'map' && location && <WeatherMap center={location} alerts={weather?.alerts || []} units={units} />}
            {weather && tab === 'kids' && <KidMode weather={weather} user={user} location={location} voice={voice} />}
            {weather && tab === 'learn' && <Learn weather={weather} location={location} kidMode={kidMode} />}
            {tab === 'models' && location && <ModelsView location={location} units={units} />}
            {tab === 'ask' && config.ai?.enabled && <AskExpert ai={config.ai} weather={weather} location={location} units={units} kidMode={kidMode} voice={voice} />}
            {tab === 'news' && <News isAdmin={!!user?.isAdmin} onAdmin={() => setModal('admin')} kidMode={kidMode} location={location} />}
          </main>
        </>
      )}

      {modal === 'signin' && (
        <SignIn
          setup={config.auth.needsSetup}
          required={config.auth.required}
          sso={config.auth.sso}
          onClose={() => setModal(null)}
          onDone={(u) => {
            setUser(u);
            setConfig((c) => ({ ...c, auth: { ...c.auth, needsSetup: false } }));
            setModal(null);
          }}
        />
      )}
      {modal === 'alerts' && <PushAlerts location={location} saved={prefs.saved} onClose={() => setModal(null)} />}
      {modal === 'admin' && user?.isAdmin && <Admin me={user} onClose={() => setModal(null)} />}
    </div>
  );
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((l) => {
    const k = `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
