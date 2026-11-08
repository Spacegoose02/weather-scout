import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { usePrefs } from './usePrefs.js';
import Header from './components/Header.jsx';
import AlertsBanner from './components/AlertsBanner.jsx';
import WeatherMap from './components/WeatherMap.jsx';
import KidMode from './components/KidMode.jsx';
import DisplayName from './components/DisplayName.jsx';
import SignIn from './components/SignIn.jsx';
import Admin from './components/Admin.jsx';
import News from './components/News.jsx';
import ModelsView from './components/ModelsView.jsx';
import PushAlerts from './components/PushAlerts.jsx';
import RockyFace from './components/RockyFace.jsx';
import AskExpert from './components/AskExpert.jsx';
import Learn from './components/learn/Learn.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import SafetyCenter from './components/safety/SafetyCenter.jsx';
import Badges, { BadgeCelebration } from './components/kid/Badges.jsx';
import Settings from './components/Settings.jsx';
import { ThemeBuddy } from './components/ThemeChoices.jsx';
import { useKidData } from './kid/useKidData.js';
import { parseRoute, routeHash, tabsFor } from './nav.js';
import Briefing from './components/kid/Briefing.jsx';
import Modal from './components/Modal.jsx';
import LightningBanner from './components/LightningBanner.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { useLive } from './live.js';
import { DEFAULT_ALERT_MILES } from '../../shared/lightning.js';
import ChaserPopup from './components/chasers/ChaserPopup.jsx';
import { popupMode } from './chasers/chasers.js';
import { configureVoice } from './kid/speak.js';
import { useTheme } from './theme/useTheme.js';
import { useA11y } from './a11y.js';

export default function App() {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = usePrefs(user);
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hash, setHash] = useState(() => window.location.hash);
  const [modal, setModal] = useState(null); // 'signin' | 'settings' | 'admin' | 'alerts' | 'briefing' | 'profile' | 'badges'

  useEffect(() => {
    api('/api/config')
      .then((c) => {
        setConfig(c);
        setUser(c.user);
        if (c.auth.needsSetup || (c.auth.required && !c.user)) setModal('signin');
        else if (new URLSearchParams(window.location.search).has('briefing')) setModal('briefing'); // tapped the morning push
      })
      .catch((e) => setError(e.message));
  }, []);

  const location = prefs.location || config?.defaultLocation;
  const units = prefs.units || config?.units || 'imperial';
  const kidMode = !!prefs.kidMode;
  const aiOn = !!config?.ai?.enabled;
  // The tab lives in the address (#map, #learn/ocean) so refresh, back and
  // bookmarks work. Tapping a lightning notification (/?lightning=1) opens the map.
  const lightningLink = new URLSearchParams(window.location.search).has('lightning');
  const route = parseRoute(hash || (lightningLink ? '#map' : ''), { kidMode, aiOn });
  const { tab } = route;
  const go = useCallback((next, section = null) => {
    const h = routeHash({ tab: next, section });
    if (window.location.hash !== h) window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${h}`);
    setHash(h);
  }, []);
  const setTab = go;
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);
  const kidData = useKidData(user, weather?.kid?.date || new Date().toISOString().slice(0, 10));
  const badgeCount = Object.keys(kidData.data.badges || {}).length;
  const lightningOn = !!config?.lightning?.enabled;
  const lightningMiles = lightningOn ? (prefs.lightningMiles ?? DEFAULT_ALERT_MILES) : 0;
  const theme = useTheme(prefs.theme, weather);
  useA11y(prefs.a11y);
  const chasers = { mode: popupMode(prefs.chaserPopups), onChange: (m) => setPrefs({ chaserPopups: m }) };

  // Read-aloud uses the voice the admin picked in Family & settings (Kokoro when set up).
  useEffect(() => configureVoice({ enabled: config?.tts?.enabled, fallback: config?.tts?.fallback }), [config?.tts?.enabled, config?.tts?.fallback]);

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

  // A warning starting or ending reloads the weather right away.
  const live = useLive(location, units, { onAlerts: () => load() });

  useEffect(() => {
    document.documentElement.dataset.kid = kidMode ? 'on' : 'off';
  }, [kidMode]);
  // Switching views starts on that view's Today.
  const switchView = (on, start = 'today') => {
    setPrefs({ kidMode: on });
    go(start);
  };

  const signOut = async () => {
    const r = await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
    if (r.ssoLogoutUrl) window.location.href = r.ssoLogoutUrl;
  };

  if (!config) return <div className="splash">{error || 'Loading Weather Scout…'}</div>;
  const blocked = config.auth.required && !user;

  return (
    <div className={`app ${kidMode ? 'kid' : ''}`}>
      {/* Keyboard and screen-reader users can jump past the header and tabs. */}
      <button className="skip-link" onClick={() => document.getElementById('main')?.focus()}>Skip to the weather</button>
      <Header
        location={location}
        onLocation={(l) => setPrefs((p) => ({ location: l, saved: dedupe([l, ...(p.saved || [])]).slice(0, 8) }))}
        saved={prefs.saved || []}
        kidMode={kidMode}
        onKidMode={switchView}
        units={units}
        onUnits={(u) => setPrefs({ units: u })}
        onSettings={() => setModal('settings')}
        badges={badgeCount}
        onBadges={() => setModal('badges')}
      />

      {!blocked && (
        <>
          <nav className={`tabs${kidMode ? ' kid-tabs' : ''}`} aria-label={kidMode ? 'Kid sections' : 'Sections'}>
            {tabsFor(kidMode, aiOn).map((t) => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                <span className="tab-emoji" aria-hidden>{t.emoji === 'rocky' ? <RockyFace /> : t.emoji}</span>
                <span className="tab-label">{t.label}</span>
                <span className="tab-short" aria-hidden>{t.short}</span>
              </button>
            ))}
          </nav>

          <OfflineBanner onRetry={load} />
          {live.note && <div className="live-note card" role="status">{live.note}</div>}
          {error && (
            <div className="error card" role="alert">
              {error} <button onClick={load}>Try again</button>
            </div>
          )}

          {weather && <AlertsBanner alerts={weather.alerts} kidMode={kidMode} />}
          {lightningOn && location && (
            <LightningBanner
              location={location}
              miles={lightningMiles}
              units={units}
              kidMode={kidMode}
              onMap={tab === 'map' ? null : () => setTab('map')}
              onSettings={() => setModal('alerts')}
            />
          )}

          <main id="main" tabIndex={-1}>
            {!weather && !error && ['today', 'play', 'explore', 'chaser', 'learn', 'school'].includes(tab) && !(tab !== 'today' && route.section === 'ocean') && <div className="card skeleton">Fetching the sky…</div>}
            {weather && kidMode && ['today', 'play', 'explore', 'chaser'].includes(tab) && (
              <KidMode tab={tab} weather={weather} user={user} location={location} kid={kidData} onAlerts={() => setModal('alerts')} />
            )}
            {weather && !kidMode && tab === 'today' && (
              <Dashboard
                weather={weather}
                location={location}
                units={units}
                kidMode={kidMode}
                user={user}
                loading={loading}
                onTab={(t, kidTab) => (t === 'kids' ? switchView(true, kidTab) : setTab(t))}
                onSignIn={() => setModal('signin')}
                onAlerts={() => setModal('alerts')}
                onAdmin={() => setModal('admin')}
              />
            )}
            {tab === 'map' && location && <WeatherMap center={location} alerts={weather?.alerts || []} units={units} layers={prefs.mapLayers} onLayers={(l) => setPrefs({ mapLayers: l })} signedIn={!!user} lightningMiles={lightningMiles} defaultLayers={config?.map?.defaultLayers} />}
            {(tab === 'learn' || tab === 'school') && location && (weather || route.section === 'ocean') && (
              <Learn weather={weather} location={location} units={units} kidMode={kidMode} chasers={chasers} ai={config.ai} section={route.section} onSection={(s) => go(tab, s)} />
            )}
            {tab === 'models' && location && <ModelsView location={location} units={units} />}
            {tab === 'ask' && config.ai?.enabled && <AskExpert ai={config.ai} weather={weather} location={location} units={units} kidMode={kidMode} tts={config.tts} />}
            {tab === 'news' && <News isAdmin={!!user?.isAdmin} onAdmin={() => setModal('admin')} kidMode={kidMode} location={location} />}
          </main>
        </>
      )}

      {!blocked && <ChaserPopup alerts={weather?.alerts || []} kidMode={kidMode} mode={chasers.mode} onMode={chasers.onChange} />}
      {!blocked && <SafetyCenter alerts={weather?.alerts} kidMode={kidMode} user={user} onSignIn={() => setModal('signin')} />}

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
      {modal === 'profile' && user && (
        <DisplayName user={user} onClose={() => setModal(null)} onSaved={(u) => { setUser(u); setModal(null); }} />
      )}
      {modal === 'settings' && (
        <Settings
          user={user}
          sso={config.auth.sso}
          units={units}
          onUnits={(u) => setPrefs({ units: u })}
          theme={{ value: prefs.theme || 'auto', why: theme.why, onChange: (t) => setPrefs({ theme: t }) }}
          a11y={{ value: prefs.a11y, onChange: (a) => setPrefs({ a11y: a }) }}
          places={{ list: prefs.saved || [], onChange: (list) => setPrefs({ saved: list }) }}
          onProfile={() => setModal('profile')}
          onAlerts={() => setModal('alerts')}
          onAdmin={() => setModal('admin')}
          onSignIn={() => setModal('signin')}
          onSignOut={signOut}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'badges' && (
        <Modal title={kidMode ? 'My badges' : 'Badge shelf'} onClose={() => setModal(null)} wide>
          <Badges kid={kidData} />
        </Modal>
      )}
      <BadgeCelebration user={user} onShelf={() => setModal('badges')} />
      <ThemeBuddy active={theme.id} />
      {modal === 'alerts' && (
        <PushAlerts
          location={location}
          saved={prefs.saved}
          units={units}
          lightningOn={lightningOn}
          lightningMiles={lightningMiles}
          onLightningMiles={(m) => setPrefs({ lightningMiles: m })}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'briefing' && (briefingPlace() || location) && (
        <Modal title="Your weather from Rocky" onClose={() => { setModal(null); window.history.replaceState(null, '', window.location.pathname); }}>
          <Briefing location={briefingPlace() || location} units={units} name={user?.displayName} highlight />
        </Modal>
      )}
      {modal === 'admin' && user?.isAdmin && <Admin me={user} onClose={() => setModal(null)} />}
    </div>
  );
}

// The place in a morning-briefing notification link (/?briefing=1&lat=..&lon=..&place=..).
function briefingPlace() {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('briefing')) return null;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  if (!q.get('lat') || !q.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: q.get('place') || '' };
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
